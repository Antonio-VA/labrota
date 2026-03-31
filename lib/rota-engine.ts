/**
 * LabRota scheduling engine.
 * Pure function — no DB calls, fully testable.
 *
 * Algorithm per day:
 *  1. Determine eligible staff (active, in employment window, works that weekday,
 *     not on leave, has weekly shift budget remaining)
 *  2. Sort by preferred days (soft), then historical workload (fewer = higher priority)
 *  3. Compute coverage requirements from lab config (cobertura mínima table)
 *  4. Build preferred pool (working_pattern includes this day) + extra pool
 *  5. Assign all preferred staff; if below minimum, pull extras to fill gaps
 *  6. Apply scheduling rules (max consecutive days, weekend distribution, etc.)
 *  7. Distribute staff across shifts via per-day round-robin
 *  8. Compute skill gaps
 *  9. (by_task) Assign staff to tasks using rarest-skill-first heuristic
 */

import type {
  StaffWithSkills,
  Leave,
  RotaAssignment,
  LabConfig,
  RotaRule,
  ShiftType,
  ShiftTypeDefinition,
  ShiftCoverageByDay,
  ShiftCoverageEntry,
  SkillName,
  WorkingDay,
} from "@/lib/types/database"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayPlan {
  date: string
  assignments: { staff_id: string; shift_type: ShiftType }[]
  skillGaps: SkillName[]
}

export interface TaskAssignment {
  staff_id: string
  tecnica_code: string
  date: string
}

export interface RotaEngineResult {
  days: DayPlan[]
  taskAssignments: TaskAssignment[]
  warnings: string[]
}

export interface EngineParams {
  weekStart: string              // ISO Monday
  staff: StaffWithSkills[]
  leaves: Leave[]
  recentAssignments: RotaAssignment[]  // last ~4 weeks, used for workload scoring
  labConfig: LabConfig
  shiftTypes?: ShiftTypeDefinition[]   // org shift catalogue — used to fill all shifts
  punctionsOverride?: Record<string, number>  // per-date overrides from rota record
  rules?: RotaRule[]             // enabled scheduling rules
  tecnicas?: { codigo: string; department?: string; typical_shifts: string[]; avoid_shifts?: string[] }[]
  shiftRotation?: "stable" | "weekly" | "daily"
  taskCoverageEnabled?: boolean
  taskCoverageByDay?: Record<string, Record<string, number>> | null  // tecnica_code → { mon: N, ... }
  shiftCoverageEnabled?: boolean
  shiftCoverageByDay?: ShiftCoverageByDay | null // shift_code → { day: { lab, andrology, admin } }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalize shift coverage value: plain number → lab-only, object → as-is */
function normalizeShiftCov(val: ShiftCoverageEntry | number | undefined): ShiftCoverageEntry {
  if (val === undefined || val === null) return { lab: 0, andrology: 0, admin: 0 }
  if (typeof val === "number") return { lab: val, andrology: 0, admin: 0 }
  return val
}

const WEEKDAY_CODES: WorkingDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

function getDayCode(isoDate: string): WorkingDay {
  return WEEKDAY_CODES[new Date(isoDate + "T12:00:00").getDay()]
}

function isWeekend(isoDate: string): boolean {
  const code = getDayCode(isoDate)
  return code === "sat" || code === "sun"
}

function addDaysStr(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

/** Return ISO date strings for all 7 days of the week starting on weekStart. */
export function getWeekDates(weekStart: string): string[] {
  const dates: string[] = []
  const base = new Date(weekStart + "T12:00:00")
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    dates.push(d.toISOString().split("T")[0])
  }
  return dates
}

/** Return the ISO date of the Monday of the week containing `date`. */
export function getMondayOfWeek(date: Date = new Date()): string {
  const d = new Date(date)
  d.setHours(12, 0, 0, 0)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split("T")[0]
}

// ── Engine ────────────────────────────────────────────────────────────────────

export function runRotaEngine({
  weekStart,
  staff,
  leaves,
  recentAssignments,
  labConfig,
  shiftTypes = [],
  punctionsOverride,
  rules = [],
  tecnicas = [],
  shiftRotation = "stable",
  taskCoverageEnabled = false,
  taskCoverageByDay,
  shiftCoverageEnabled = false,
  shiftCoverageByDay,
}: EngineParams): RotaEngineResult {
  const days: DayPlan[] = []
  const taskAssignments: TaskAssignment[] = []
  const warnings: string[] = []

  // Log which coverage model is active
  if (shiftCoverageEnabled && shiftCoverageByDay) {
    const keys = Object.keys(shiftCoverageByDay)
    warnings.push(`[engine] SHIFT coverage model active — shifts: ${keys.join(", ")} | data: ${JSON.stringify(shiftCoverageByDay)}`)
  } else if (taskCoverageEnabled && taskCoverageByDay) {
    warnings.push(`[engine] TASK coverage model active — keys: ${Object.keys(taskCoverageByDay).join(", ")}`)
  } else {
    warnings.push(`[engine] No coverage model active (shiftCoverageEnabled=${shiftCoverageEnabled}, taskCoverageEnabled=${taskCoverageEnabled})`)
  }

  // Historical workload scores (recent shift count per staff for fairness sorting)
  const workloadScore: Record<string, number> = {}
  for (const a of recentAssignments) {
    workloadScore[a.staff_id] = (workloadScore[a.staff_id] ?? 0) + 1
  }

  // ── Infer preferences from historical patterns ────────────────────────────
  // For each staff member, count shift and day frequencies from recent assignments.
  // If a pattern is strong enough (≥70% for a shift, ≥60% for days), use it as
  // an implicit preference — but only when no explicit preference is set.
  const inferredShiftPref: Record<string, string> = {}  // staff_id → shift code
  const inferredDayPref: Record<string, Set<string>> = {}   // staff_id → day codes they prefer
  const inferredDayAvoid: Record<string, Set<string>> = {}  // staff_id → day codes they avoid

  if (recentAssignments.length > 0) {
    // Group by staff
    const byStaff: Record<string, typeof recentAssignments> = {}
    for (const a of recentAssignments) {
      if (!byStaff[a.staff_id]) byStaff[a.staff_id] = []
      byStaff[a.staff_id].push(a)
    }

    for (const [staffId, assignments] of Object.entries(byStaff)) {
      const person = staff.find((s) => s.id === staffId)
      if (!person) continue
      const totalAssignments = assignments.length

      // Shift inference: count how often each shift appears
      if (!person.preferred_shift && !(person.avoid_shifts?.length)) {
        const shiftCounts: Record<string, number> = {}
        for (const a of assignments) {
          shiftCounts[a.shift_type] = (shiftCounts[a.shift_type] ?? 0) + 1
        }
        const topShift = Object.entries(shiftCounts).sort((a, b) => b[1] - a[1])[0]
        if (topShift && topShift[1] / totalAssignments >= 0.7) {
          inferredShiftPref[staffId] = topShift[0]
        }
      }

      // Day inference: count how often each weekday appears vs total weeks
      if (!(person.preferred_days?.length) && !(person.avoid_days?.length)) {
        const totalWeeks = Math.max(1, Math.ceil(totalAssignments / 5))
        const dayCounts: Record<string, number> = {}
        for (const a of assignments) {
          const dow = new Date(a.date + "T12:00:00").getDay()
          const dayCode = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[dow]
          dayCounts[dayCode] = (dayCounts[dayCode] ?? 0) + 1
        }
        // Days that appear in ≥60% of weeks → inferred preferred
        // Days that appear in ≤15% of weeks (and total > 2 weeks) → inferred avoid
        for (const [dayCode, count] of Object.entries(dayCounts)) {
          const ratio = count / totalWeeks
          if (ratio >= 0.6) {
            if (!inferredDayPref[staffId]) inferredDayPref[staffId] = new Set()
            inferredDayPref[staffId].add(dayCode)
          }
        }
        if (totalWeeks >= 3) {
          for (const dc of ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]) {
            const ratio = (dayCounts[dc] ?? 0) / totalWeeks
            if (ratio <= 0.15) {
              if (!inferredDayAvoid[staffId]) inferredDayAvoid[staffId] = new Set()
              inferredDayAvoid[staffId].add(dc)
            }
          }
        }
      }
    }
  }

  const allWeekDates = getWeekDates(weekStart)

  // Weekly shift counter — resets at the start of each generated week
  const weeklyShiftCount: Record<string, number> = {}
  const weekShiftHistory: Record<string, Set<string>> = {} // staff_id → shifts used this week (for daily rotation)

  // Leave map: staff_id → set of dates on leave
  const leaveMap: Record<string, Set<string>> = {}
  for (const leave of leaves) {
    const s = new Date(leave.start_date + "T12:00:00")
    const e = new Date(leave.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split("T")[0]
      if (!leaveMap[leave.staff_id]) leaveMap[leave.staff_id] = new Set()
      leaveMap[leave.staff_id].add(iso)
    }
  }

  // Leave days this week per staff — used to discount their shift budget so the
  // ShiftBudgetBar doesn't flag leave-reduced weeks as under-scheduled.
  const leaveThisWeek: Record<string, number> = {}
  for (const staffId in leaveMap) {
    leaveThisWeek[staffId] = allWeekDates.filter((d) => leaveMap[staffId].has(d)).length
  }

  // Shift codes sorted by sort_order — only active shifts are used for assignment.
  const activeShiftTypes = shiftTypes.filter((st) => st.active !== false)
  const shiftCodes = [...activeShiftTypes]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((st) => st.code)
  const activeShiftSet = new Set(shiftCodes)

  // Técnica → typical shifts lookup (for soft shift preference)
  const tecnicaTypicalShifts: Record<string, Set<string>> = {}
  for (const t of tecnicas) {
    if (t.typical_shifts.length > 0) {
      tecnicaTypicalShifts[t.codigo] = new Set(t.typical_shifts)
    }
  }

  // Skills for gap detection — derived from org's configured técnicas (not hardcoded)
  const allOrgSkills = new Set(
    tecnicas.map((t) => t.codigo as SkillName)
  )

  // Assignment lookup for rules: date → set of staff_ids
  // Pre-seeded from recentAssignments; updated each day as we generate
  const assignedByDate: Record<string, Set<string>> = {}
  for (const a of recentAssignments) {
    if (!assignedByDate[a.date]) assignedByDate[a.date] = new Set()
    assignedByDate[a.date].add(a.staff_id)
  }

  // Helper: count consecutive days assigned immediately before a given date
  function consecutiveDaysBefore(staffId: string, date: string): number {
    let count = 0
    const d = new Date(date + "T12:00:00")
    for (let i = 0; i < 30; i++) {
      d.setDate(d.getDate() - 1)
      const iso = d.toISOString().split("T")[0]
      if (!assignedByDate[iso]?.has(staffId)) break
      count++
    }
    return count
  }

  // Days-off preference: controls when staff get their off days
  const daysOffPref = (labConfig as any).days_off_preference as "always_weekend" | "prefer_weekend" | "any_day" | undefined ?? "prefer_weekend"

  // ── PHASE 1: Pre-plan minimum coverage for ALL 7 days ────────────────────
  // Reserve budget so minimum coverage is guaranteed before preferences kick in.
  const allDates = getWeekDates(weekStart)
  const minCoverageReserved: Record<string, Set<string>> = {} // date → set of staff_ids

  for (const date of allDates) {
    minCoverageReserved[date] = new Set()
    const dayCode = getDayCode(date)
    const wknd = isWeekend(date)

    const punctionsForDay = punctionsOverride?.[date] ?? labConfig.punctions_by_day?.[dayCode] ?? 0
    const dynamicLabMin = (labConfig.staffing_ratio > 0 && punctionsForDay > 0) ? Math.ceil(punctionsForDay / labConfig.staffing_ratio) : 0
    const dayCoverage = labConfig.coverage_by_day?.[dayCode]
    const labReq = Math.max(dayCoverage?.lab ?? labConfig.min_lab_coverage, dynamicLabMin)
    const andReq = dayCoverage?.andrology ?? labConfig.min_andrology_coverage

    for (const [role, required] of [["lab", labReq], ["andrology", andReq]] as const) {
      if (required <= 0) continue
      // Find eligible staff for this day+role, sorted by fewest total reservations
      const eligible = staff.filter((s) => {
        if (s.onboarding_status === "inactive" || s.role !== role) return false
        if (s.start_date > date || (s.end_date && s.end_date < date)) return false
        if (leaveMap[s.id]?.has(date)) return false
        const reserved = Object.values(minCoverageReserved).filter((set) => set.has(s.id)).length
        return reserved < (s.days_per_week ?? 5)
      }).sort((a, b) => {
        // Fewest reservations first — spreads assignments evenly across staff
        const aRes = Object.values(minCoverageReserved).filter((set) => set.has(a.id)).length
        const bRes = Object.values(minCoverageReserved).filter((set) => set.has(b.id)).length
        if (aRes !== bRes) return aRes - bRes
        // Then prefer pattern match
        const aInPattern = (!a.working_pattern?.length || a.working_pattern.includes(dayCode)) ? 0 : 1
        const bInPattern = (!b.working_pattern?.length || b.working_pattern.includes(dayCode)) ? 0 : 1
        if (aInPattern !== bInPattern) return aInPattern - bInPattern
        // For "prefer_weekend" days off: on weekdays, prefer staff who would lose a weekend slot;
        // on weekends, prefer staff with fewer weekend assignments (save weekends for those who need them)
        if (daysOffPref === "prefer_weekend" && wknd) {
          const aWkndCount = Object.entries(minCoverageReserved).filter(([d, s]) => isWeekend(d) && s.has(a.id)).length
          const bWkndCount = Object.entries(minCoverageReserved).filter(([d, s]) => isWeekend(d) && s.has(b.id)).length
          if (aWkndCount !== bWkndCount) return aWkndCount - bWkndCount // fewer weekend assignments first
        }
        return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
      })

      for (let i = 0; i < Math.min(required, eligible.length); i++) {
        minCoverageReserved[date].add(eligible[i].id)
      }
    }
  }

  // ── PHASE 2: Day-by-day assignment (minimum guaranteed + fill with preferences)
  for (const date of allDates) {
    const dayCode = getDayCode(date)
    const weekend = isWeekend(date)

    // Coverage requirements
    const punctionsForDay = punctionsOverride?.[date] ?? labConfig.punctions_by_day?.[dayCode] ?? 0
    const dynamicLabMin = (labConfig.staffing_ratio > 0 && punctionsForDay > 0) ? Math.ceil(punctionsForDay / labConfig.staffing_ratio) : 0
    const dayCoverage = labConfig.coverage_by_day?.[dayCode]

    // When shift coverage is enabled, derive department totals by summing across shifts
    let labRequired: number
    let andrologyRequired: number
    let adminRequired: number
    if (shiftCoverageEnabled && shiftCoverageByDay) {
      let labSum = 0, androSum = 0, adminSum = 0
      const dayShiftsForCov = activeShiftTypes
        .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dayCode))
        .map((st) => st.code)
      for (const sc of dayShiftsForCov) {
        const cov = normalizeShiftCov(shiftCoverageByDay[sc]?.[dayCode])
        labSum += cov.lab
        androSum += cov.andrology
        adminSum += cov.admin
      }
      labRequired = Math.max(labSum, dynamicLabMin)
      andrologyRequired = androSum
      adminRequired = adminSum
    } else {
      labRequired = Math.max(dayCoverage?.lab ?? labConfig.min_lab_coverage, dynamicLabMin)
      andrologyRequired = dayCoverage?.andrology ?? labConfig.min_andrology_coverage
      adminRequired = dayCoverage?.admin ?? 0
    }

    // Basic eligibility (not budget-related)
    function isAvailable(s: StaffWithSkills): boolean {
      if (s.onboarding_status === "inactive") return false
      if (s.start_date > date) return false
      if (s.end_date && s.end_date < date) return false
      if (leaveMap[s.id]?.has(date)) return false
      return true
    }

    function hasBudget(s: StaffWithSkills): boolean {
      const used = weeklyShiftCount[s.id] ?? 0
      const cap = s.days_per_week ?? 5
      if (used >= cap) return false
      // Reserve slots for future days where this person is reserved in Phase 1
      // (but not yet counted in weeklyShiftCount)
      const futureReserved = allDates
        .filter((d) => d > date && minCoverageReserved[d]?.has(s.id))
        .length
      return (used + 1 + futureReserved) <= cap
    }

    // Reserved staff are ALWAYS assigned (Phase 1 guaranteed their budget)
    const reservedIds = minCoverageReserved[date]
    const reservedStaff = staff.filter((s) => reservedIds.has(s.id) && isAvailable(s))

    // Preference scoring for day assignment (explicit > inferred)
    function dayPreferenceScore(s: typeof staff[0]): number {
      let score = 0
      // Explicit preferences (stronger weight)
      if (s.preferred_days?.includes(dayCode)) score += 2
      if (s.avoid_days?.includes(dayCode)) score -= 3
      // Inferred preferences (weaker weight, only if no explicit set)
      if (!(s.preferred_days?.length) && !(s.avoid_days?.length)) {
        if (inferredDayPref[s.id]?.has(dayCode)) score += 1
        if (inferredDayAvoid[s.id]?.has(dayCode)) score -= 1.5
      }
      return score
    }

    // Additional staff: must have budget after accounting for future reservations
    const remaining = staff.filter((s) => {
      if (!isAvailable(s) || reservedIds.has(s.id) || !hasBudget(s)) return false
      // "always_weekend" mode: on weekends, only reserved staff work (already handled above)
      if (daysOffPref === "always_weekend" && weekend) return false
      return true
    }).sort((a, b) => {
      const aInPattern = (!a.working_pattern?.length || a.working_pattern.includes(dayCode)) ? 0 : 1
      const bInPattern = (!b.working_pattern?.length || b.working_pattern.includes(dayCode)) ? 0 : 1
      if (aInPattern !== bInPattern) return aInPattern - bInPattern
      // "prefer_weekend" mode: penalise weekend assignments so staff prefer weekdays off
      if (daysOffPref === "prefer_weekend" && weekend) {
        // Staff with more weekday budget remaining should be deprioritised for weekends
        const aUsed = weeklyShiftCount[a.id] ?? 0
        const bUsed = weeklyShiftCount[b.id] ?? 0
        const aCap = a.days_per_week ?? 5
        const bCap = b.days_per_week ?? 5
        const aRemaining = aCap - aUsed
        const bRemaining = bCap - bUsed
        // More remaining → less likely to need weekend → sort higher (deprioritise)
        if (aRemaining !== bRemaining) return bRemaining - aRemaining
      }
      // Day preference scoring: higher is better (sort descending)
      const aDayPref = dayPreferenceScore(a)
      const bDayPref = dayPreferenceScore(b)
      if (aDayPref !== bDayPref) return bDayPref - aDayPref
      return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
    })

    const assignedSet = new Set(reservedStaff.map((s) => s.id))

    // Assign ALL remaining staff who have budget — shift minimums only affect
    // distribution across shifts, NOT who gets to work that day.
    // days_per_week is the hard constraint; hasBudget enforces it.
    for (const s of remaining) {
      assignedSet.add(s.id)
    }

    let assignedLab = staff.filter((s) => assignedSet.has(s.id) && s.role === "lab")
    let assignedAndrology = staff.filter((s) => assignedSet.has(s.id) && s.role === "andrology")
    let assignedAdmin = adminRequired > 0
      ? staff.filter((s) => assignedSet.has(s.id) && s.role === "admin")
      : []

    // Warn if minimum still not met
    if (assignedLab.length < labRequired) {
      warnings.push(`${date}: COBERTURA INSUFICIENTE — ${assignedLab.length} embriología (mínimo ${labRequired})`)
    }
    if (assignedAndrology.length < andrologyRequired) {
      warnings.push(`${date}: COBERTURA INSUFICIENTE — ${assignedAndrology.length} andrología (mínimo ${andrologyRequired})`)
    }

    let assigned = [...assignedLab, ...assignedAndrology, ...assignedAdmin]
    const fixedShiftOverrides: Record<string, string> = {} // staff_id → forced shift code from asignacion_fija

    // 6. Apply scheduling rules
    if (rules.length > 0) {
      const dateMonth = date.slice(0, 7)
      const weekendCountThisMonth: Record<string, number> = {}
      for (const a of recentAssignments) {
        if (a.date.slice(0, 7) === dateMonth && isWeekend(a.date)) {
          weekendCountThisMonth[a.staff_id] = (weekendCountThisMonth[a.staff_id] ?? 0) + 1
        }
      }

      const hardRemovals = new Set<string>()
      for (const rule of rules.filter((r) => r.enabled)) {
        const affectedIds = rule.staff_ids.length > 0 ? new Set(rule.staff_ids) : null
        const affects = (id: string) => affectedIds === null || affectedIds.has(id)

        if (rule.type === "max_dias_consecutivos") {
          const maxDays = (rule.params.maxDays as number) ?? 5
          for (const s of assigned) {
            if (!affects(s.id)) continue
            if (consecutiveDaysBefore(s.id, date) >= maxDays) {
              if (rule.is_hard) {
                hardRemovals.add(s.id)
                warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — ${maxDays} días consecutivos (regla obligatoria)`)
              } else {
                warnings.push(`${date}: ${s.first_name} ${s.last_name} lleva ${maxDays} días consecutivos`)
              }
            }
          }
        }

        if (rule.type === "distribucion_fines_semana" && weekend) {
          const maxPerMonth = (rule.params.maxPerMonth as number) ?? 2
          for (const s of assigned) {
            if (!affects(s.id)) continue
            if ((weekendCountThisMonth[s.id] ?? 0) >= maxPerMonth) {
              if (rule.is_hard) {
                hardRemovals.add(s.id)
                warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — ${maxPerMonth} fines de semana este mes (regla obligatoria)`)
              } else {
                warnings.push(`${date}: ${s.first_name} ${s.last_name} lleva ${maxPerMonth} fines de semana este mes`)
              }
            }
          }
        }

        if (rule.type === "no_coincidir") {
          const conflictIds = new Set(rule.staff_ids)
          const conflicting = assigned.filter((s) => conflictIds.has(s.id))
          if (conflicting.length > 1) {
            const byWorkload = [...conflicting].sort(
              (a, b) => (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
            )
            for (let i = 1; i < byWorkload.length; i++) {
              if (rule.is_hard) {
                hardRemovals.add(byWorkload[i].id)
                warnings.push(`${date}: ${byWorkload[i].first_name} ${byWorkload[i].last_name} retirado — no coincidir con ${byWorkload[0].first_name} ${byWorkload[0].last_name} (regla obligatoria)`)
              } else {
                warnings.push(
                  `${date}: ${byWorkload[i].first_name} ${byWorkload[i].last_name} coincide con ${byWorkload[0].first_name} ${byWorkload[0].last_name}`)
              }
            }
          }
        }

        if (rule.type === "supervisor_requerido") {
          const supervisorId = rule.params.supervisor_id as string | undefined
          // Skip if rule is restricted to certain days and today isn't one of them
          const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
          if (supDays.length > 0 && !supDays.includes(dayCode)) {
            // Not an active day for this supervisor rule — skip
          } else if (supervisorId) {
            // Check if any supervised staff (staff_ids excluding supervisor) are assigned
            const supervisedIds = rule.staff_ids.filter((id) => id !== supervisorId)
            const supervisedAssigned = assigned.filter((s) => supervisedIds.includes(s.id))
            const supervisorAssigned = assigned.some((s) => s.id === supervisorId)

            if (supervisedAssigned.length > 0 && !supervisorAssigned) {
              // Supervisor not assigned but supervised staff are — force-assign supervisor
              const supervisor = staff.find((s) => s.id === supervisorId)
              if (supervisor) {
                const isEligible =
                  supervisor.onboarding_status !== "inactive" &&
                  supervisor.start_date <= date &&
                  (!supervisor.end_date || supervisor.end_date >= date) &&
                  !leaveMap[supervisor.id]?.has(date)

                if (isEligible) {
                  if (rule.is_hard) {
                    assigned.push(supervisor)
                    if (supervisor.role === "lab") assignedLab = [...assignedLab, supervisor]
                    else if (supervisor.role === "andrology") assignedAndrology = [...assignedAndrology, supervisor]
                    else assignedAdmin = [...assignedAdmin, supervisor]
                  }
                  warnings.push(
                    `${date}: ${supervisor.first_name} ${supervisor.last_name} — supervisor asignado (supervisor_requerido)`
                  )
                } else {
                  warnings.push(
                    `${date}: supervisor ${supervisor.first_name} ${supervisor.last_name} no disponible — personal supervisado presente`
                  )
                }
              }
            }
          }
        }
        if (rule.type === "descanso_fin_de_semana" && weekend) {
          const recovery = (rule.params.recovery as string) ?? "following"
          const restDays = (rule.params.restDays as number) ?? 2

          for (const s of assigned) {
            if (!affects(s.id)) continue

            if (recovery === "following") {
              // If staff worked LAST weekend → must be off THIS weekend
              const prevSat = addDaysStr(date, -( getDayCode(date) === "sat" ? 7 : 8))
              const prevSun = addDaysStr(date, -(getDayCode(date) === "sun" ? 7 : 6))
              const workedLastWeekend = recentAssignments.some(
                (a) => a.staff_id === s.id && (a.date === prevSat || a.date === prevSun)
              )
              if (workedLastWeekend) {
                if (rule.is_hard) {
                  hardRemovals.add(s.id)
                  warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — trabajó el fin de semana pasado (regla obligatoria)`)
                } else {
                  warnings.push(`${date}: ${s.first_name} ${s.last_name} worked last weekend — needs rest (descanso_fin_de_semana)`)
                }
              }
            } else {
              // "previous": If staff is working THIS weekend → must have been off LAST weekend
              // Since we're assigning now, check if they worked last weekend — if so, block
              const prevSat = addDaysStr(date, -(getDayCode(date) === "sat" ? 7 : 8))
              const prevSun = addDaysStr(date, -(getDayCode(date) === "sun" ? 7 : 6))
              const workedLastWeekend = recentAssignments.some(
                (a) => a.staff_id === s.id && (a.date === prevSat || a.date === prevSun)
              )
              if (workedLastWeekend) {
                if (rule.is_hard) {
                  hardRemovals.add(s.id)
                  warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — fines de semana alternos (regla obligatoria)`)
                } else {
                  warnings.push(`${date}: ${s.first_name} ${s.last_name} worked last weekend — alternating weekends required`)
                }
              }
            }
          }

          // Rest days enforcement: if staff worked last weekend, ensure they get contiguous rest days
          // This is handled by also marking avoid_days in the scoring phase above
          // For hard rules, we add to hardRemovals if within the rest window after a worked weekend
          if (restDays > 0 && !weekend) {
            // Check weekday rest: if this date falls within restDays after last worked weekend
            for (const s of assigned) {
              if (!affects(s.id)) continue
              // Find the most recent weekend day this person worked
              const lastWorkedWeekend = [...recentAssignments]
                .filter((a) => a.staff_id === s.id && isWeekend(a.date))
                .sort((a, b) => b.date.localeCompare(a.date))[0]
              if (!lastWorkedWeekend) continue
              // Calculate days since last worked weekend
              const diffMs = new Date(date + "T12:00:00").getTime() - new Date(lastWorkedWeekend.date + "T12:00:00").getTime()
              const diffDays = Math.round(diffMs / 86400000)
              if (diffDays > 0 && diffDays <= restDays) {
                if (rule.is_hard) {
                  hardRemovals.add(s.id)
                  warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — necesita ${restDays} días de descanso tras fin de semana (regla obligatoria)`)
                } else {
                  warnings.push(`${date}: ${s.first_name} ${s.last_name} needs ${restDays} rest days after weekend`)
                }
              }
            }
          }
        }

        // no_turno_doble: each person is assigned at most once per day already

        if (rule.type === "no_librar_mismo_dia") {
          // Handled in Phase 3 (post-plan budget-neutral swap) — not here.
          // Phase 2 can't fix this without breaking budgets since it only sees one day at a time.
        }

        // no_misma_tarea: enforced post-assignment at task assignment level — engine emits warning
        if (rule.type === "no_misma_tarea") {
          // This rule is checked after técnica assignment in the technique-shift alignment pass.
          // At the shift-assignment stage, we just ensure both are assigned (prerequisite for the check).
          // The actual técnica conflict detection happens in the rota actions or UI layer.
          // Store the rule params so warnings can reference it.
        }

        if (rule.type === "asignacion_fija") {
          const fixedShift = rule.params.fixedShift as string | undefined
          const fixedDays = (rule.params.fixedDays as string[] | undefined) ?? []
          // If fixedDays specified, only apply on those days
          if (fixedDays.length > 0 && !fixedDays.includes(dayCode)) continue

          for (const staffId of rule.staff_ids) {
            const s = staff.find((st) => st.id === staffId)
            if (!s) continue
            if (s.onboarding_status === "inactive") continue
            if (s.start_date > date || (s.end_date && s.end_date < date)) continue
            if (leaveMap[s.id]?.has(date)) continue

            const alreadyAssigned = assigned.some((a) => a.id === s.id)
            if (alreadyAssigned) {
              if (fixedShift) fixedShiftOverrides[staffId] = fixedShift
            } else if (rule.is_hard) {
              // Force-assign on this day
              assigned.push(s)
              if (s.role === "lab") assignedLab = [...assignedLab, s]
              else if (s.role === "andrology") assignedAndrology = [...assignedAndrology, s]
              else assignedAdmin = [...assignedAdmin, s]
              if (fixedShift) fixedShiftOverrides[staffId] = fixedShift
              warnings.push(
                `${date}: ${s.first_name} ${s.last_name} — asignación fija${fixedShift ? ` (${fixedShift})` : ""}`
              )
            } else {
              warnings.push(
                `${date}: ${s.first_name} ${s.last_name} no asignado — asignación fija no cumplida (regla blanda)`
              )
            }
          }
        }
      }

      if (hardRemovals.size > 0) {
        // Only remove if the person has ALREADY met their days_per_week.
        // Otherwise keep them assigned (shift usage is the priority) and warn.
        const actualRemovals = new Set<string>()
        for (const id of hardRemovals) {
          const s = assigned.find((a) => a.id === id)
          if (!s) continue
          const used = weeklyShiftCount[id] ?? 0
          const cap = s.days_per_week ?? 5
          if (used >= cap) {
            actualRemovals.add(id) // already at cap, safe to remove
          } else {
            warnings.push(`${date}: ${s.first_name} ${s.last_name} — regla de planificación ignorada para cumplir turnos disponibles`)
          }
        }
        if (actualRemovals.size > 0) {
          assignedLab       = assignedLab.filter((s) => !actualRemovals.has(s.id))
          assignedAndrology = assignedAndrology.filter((s) => !actualRemovals.has(s.id))
          assignedAdmin     = assignedAdmin.filter((s) => !actualRemovals.has(s.id))
          assigned          = [...assignedLab, ...assignedAndrology, ...assignedAdmin]
        }
      }
    }

    // 6b. Backfill: if rules removed staff below minimum coverage, add replacements
    // (from staff who still have budget and weren't already assigned today)
    if (assignedLab.length < labRequired || assignedAndrology.length < andrologyRequired) {
      const assignedIds = new Set(assigned.map((s) => s.id))
      const backfillRole = (role: string, current: number, needed: number) => {
        const additions: StaffWithSkills[] = []
        if (current >= needed) return additions
        const pool = staff.filter((s) => {
          if (assignedIds.has(s.id) || s.role !== role) return false
          if (!isAvailable(s)) return false
          const used = weeklyShiftCount[s.id] ?? 0
          return used < (s.days_per_week ?? 5)
        }).sort((a, b) => (weeklyShiftCount[a.id] ?? 0) - (weeklyShiftCount[b.id] ?? 0))
        for (const s of pool) {
          if (current + additions.length >= needed) break
          additions.push(s)
          assignedIds.add(s.id)
        }
        return additions
      }
      const labAdded = backfillRole("lab", assignedLab.length, labRequired)
      assignedLab = [...assignedLab, ...labAdded]
      const androAdded = backfillRole("andrology", assignedAndrology.length, andrologyRequired)
      assignedAndrology = [...assignedAndrology, ...androAdded]
      assigned = [...assignedLab, ...assignedAndrology, ...assignedAdmin]
    }

    // 7. Debug: always log assignment counts per day
    warnings.push(
      `[debug] ${date} (${dayCode}): ${assignedLab.length}L+${assignedAndrology.length}A+${assignedAdmin.length}Ad = ${assigned.length} assigned` +
      ` | need ${labRequired}L+${andrologyRequired}A+${adminRequired}Ad` +
      ` | reserved=${reservedIds.size} weekend=${weekend}`
    )

    // 9. Skill gaps — skip techniques blocked by restriccion_dia_tecnica rules on this day
    const coveredSkills = new Set(assigned.flatMap((s) => s.staff_skills.map((sk) => sk.skill)))
    const tecDayRestrictions = rules.filter((r) => r.enabled && r.type === "restriccion_dia_tecnica")
    const skillGaps = ([...allOrgSkills] as SkillName[]).filter((skill) => {
      if (coveredSkills.has(skill)) return false
      const blocked = tecDayRestrictions.some((r) => {
        const tecCode = r.params.tecnica_code as string | undefined
        if (tecCode !== skill) return false
        const dayMode = r.params.dayMode as string | undefined
        const restrictedDays = (r.params.restrictedDays as string[] | undefined) ?? []
        if (restrictedDays.length === 0) return false
        return dayMode === "only" ? !restrictedDays.includes(dayCode) : restrictedDays.includes(dayCode)
      })
      return !blocked
    })
    if (skillGaps.length > 0) {
      warnings.push(`${date}: skill gaps — ${skillGaps.join(", ")}`)
    }

    // Filter shifts active on this specific day
    const dayShiftCodes = activeShiftTypes
      .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dayCode))
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((st) => st.code)
    const dayShiftSet = new Set(dayShiftCodes)
    const defaultShiftCodes = dayShiftCodes.length > 0 ? dayShiftCodes : (shiftCodes.length > 0 ? shiftCodes : ["T1"])

    // ── Distribute staff across shifts ─────────────────────────────────────
    const dayIndex = allDates.indexOf(date)
    let dayRrIdx = dayIndex

    // Helper: determine a staff member's preferred shift
    function getPreferredShift(s: typeof assigned[0]): ShiftType | null {
      // 1. Technique typical_shift
      const certifiedCodes = s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill)
      const trainingCodes  = s.staff_skills.filter((sk) => sk.level === "training").map((sk) => sk.skill)
      for (const code of [...certifiedCodes, ...trainingCodes]) {
        const typical = tecnicaTypicalShifts[code]
        if (typical && typical.size > 0) {
          const match = defaultShiftCodes.find((sc) => typical.has(sc))
          if (match) return match as ShiftType
        }
      }
      // 2. Explicit preferred shift
      const explicitPrefShifts = s.preferred_shift ? s.preferred_shift.split(",").filter(Boolean) : []
      const matchedPref = explicitPrefShifts.find((ps) => dayShiftSet.has(ps))
      if (matchedPref) return matchedPref as ShiftType
      // 3. Inferred
      if (inferredShiftPref[s.id] && dayShiftSet.has(inferredShiftPref[s.id])) {
        return inferredShiftPref[s.id] as ShiftType
      }
      return null
    }

    function getRotationShift(s: typeof assigned[0]): ShiftType {
      const rotation = shiftRotation ?? "stable"
      if (rotation === "stable") {
        const shift = defaultShiftCodes[dayRrIdx % defaultShiftCodes.length] as ShiftType
        dayRrIdx++
        return shift
      } else if (rotation === "weekly") {
        const lastShift = recentAssignments
          .filter((a) => a.staff_id === s.id)
          .sort((a, b) => b.date.localeCompare(a.date))[0]?.shift_type
        const lastIdx = lastShift ? defaultShiftCodes.indexOf(lastShift) : -1
        return defaultShiftCodes[(lastIdx + 1) % defaultShiftCodes.length] as ShiftType
      } else {
        const staffIdx = staff.indexOf(s)
        return defaultShiftCodes[(staffIdx + dayIndex) % defaultShiftCodes.length] as ShiftType
      }
    }

    function applyAvoidShifts(s: typeof assigned[0], shift: ShiftType): ShiftType {
      const staffAvoidShifts = s.avoid_shifts
      if (!staffAvoidShifts?.includes(shift) || defaultShiftCodes.length <= 1) return shift
      const explicitPrefShifts = s.preferred_shift ? s.preferred_shift.split(",").filter(Boolean) : []
      const effectivePrefShifts = explicitPrefShifts.length > 0 ? explicitPrefShifts : (inferredShiftPref[s.id] ? [inferredShiftPref[s.id]] : [])
      const alternative = effectivePrefShifts.find((sc) =>
        !staffAvoidShifts.includes(sc) && dayShiftSet.has(sc)
      ) ?? defaultShiftCodes.find((sc) =>
        !staffAvoidShifts.includes(sc) && dayShiftSet.has(sc)
      )
      if (alternative) return alternative as ShiftType
      warnings.push(`${date}: ${s.first_name} ${s.last_name} — preference overridden, assigned to avoided shift ${shift}`)
      return shift
    }

    const dayPlanAssignments: { staff_id: string; shift_type: ShiftType }[] = []

    if (shiftCoverageEnabled && shiftCoverageByDay && defaultShiftCodes.length > 1) {
      // ── Coverage-aware distribution (by_shift mode) ──
      // Per-shift per-department minimums: each shift specifies how many lab/andro/admin it needs.
      const labStaff = assigned.filter((s) => s.role === "lab")
      const androStaff = assigned.filter((s) => s.role === "andrology")
      const adminStaff = assigned.filter((s) => s.role === "admin")

      // Parse per-department minimums per shift
      const shiftMinLab: Record<string, number> = {}
      const shiftMinAndro: Record<string, number> = {}
      const shiftMinAdmin: Record<string, number> = {}
      const shiftFilled: Record<string, number> = {}
      const shiftFilledLab: Record<string, number> = {}
      const shiftFilledAndro: Record<string, number> = {}
      const shiftFilledAdmin: Record<string, number> = {}
      for (const sc of defaultShiftCodes) {
        const cov = normalizeShiftCov(shiftCoverageByDay[sc]?.[dayCode])
        shiftMinLab[sc] = cov.lab
        shiftMinAndro[sc] = cov.andrology
        shiftMinAdmin[sc] = cov.admin
        shiftFilled[sc] = 0
        shiftFilledLab[sc] = 0
        shiftFilledAndro[sc] = 0
        shiftFilledAdmin[sc] = 0
      }

      const assignedToShift = new Set<string>()
      const shiftSkills: Record<string, Set<string>> = {}
      for (const sc of defaultShiftCodes) shiftSkills[sc] = new Set()

      // ── Pre-place staff with fixed shift assignments (asignacion_fija) ──
      // These must be placed BEFORE coverage steps so the counters are accurate.
      // Otherwise a person counted in T5 during coverage gets overridden to T1 after,
      // leaving T5 empty despite having configured minimums.
      for (const [staffId, fixedShift] of Object.entries(fixedShiftOverrides)) {
        if (!defaultShiftCodes.includes(fixedShift)) continue
        const s = assigned.find((st) => st.id === staffId)
        if (!s || assignedToShift.has(staffId)) continue
        dayPlanAssignments.push({ staff_id: staffId, shift_type: fixedShift as ShiftType })
        assignedToShift.add(staffId)
        shiftFilled[fixedShift] = (shiftFilled[fixedShift] ?? 0) + 1
        if (s.role === "lab") shiftFilledLab[fixedShift] = (shiftFilledLab[fixedShift] ?? 0) + 1
        else if (s.role === "andrology") shiftFilledAndro[fixedShift] = (shiftFilledAndro[fixedShift] ?? 0) + 1
        else shiftFilledAdmin[fixedShift] = (shiftFilledAdmin[fixedShift] ?? 0) + 1
        for (const sk of s.staff_skills) shiftSkills[fixedShift]?.add(sk.skill)
      }

      // ── Rotation preference for coverage-aware mode ──
      // Returns a score (lower = preferred) for placing a staff member in a given shift.
      // "stable": prefer the same shift as last week (lower for matching)
      // "weekly": prefer a DIFFERENT shift from last week (lower for non-matching)
      // "daily": each person gets a different shift each day of the week
      const rotation = shiftRotation ?? "stable"

      function rotationPreference(staffId: string, shiftCode: string): number {
        if (rotation === "stable") {
          const lastAssignment = recentAssignments
            .filter((a) => a.staff_id === staffId)
            .sort((a, b) => b.date.localeCompare(a.date))[0]
          if (lastAssignment) {
            return lastAssignment.shift_type === shiftCode ? 0 : 1
          }
          return 0
        } else if (rotation === "weekly") {
          const lastAssignment = recentAssignments
            .filter((a) => a.staff_id === staffId)
            .sort((a, b) => b.date.localeCompare(a.date))[0]
          if (lastAssignment) {
            return lastAssignment.shift_type === shiftCode ? 1 : 0
          }
          return 0
        } else {
          // "daily": prefer shifts NOT yet used this week by this person
          const usedShifts = weekShiftHistory[staffId]
          if (usedShifts && usedShifts.has(shiftCode)) return 2 // already used this shift this week
          // Tiebreak: cycle based on day + staff position for deterministic variety
          const staffIdx = staff.findIndex((s) => s.id === staffId)
          const shiftIdx = defaultShiftCodes.indexOf(shiftCode)
          const preferred = (staffIdx + dayIndex) % defaultShiftCodes.length
          return shiftIdx === preferred ? 0 : 1
        }
      }

      // Build technique → required shifts mapping (hard constraint)
      // A technique's typical_shifts = shifts where it MUST be covered
      // A technique's avoid_shifts = shifts where it MUST NOT be placed
      const techRequiredInShift: Record<string, Set<string>> = {} // shift → set of technique codes that need coverage
      for (const tec of tecnicas) {
        if (!tec.typical_shifts?.length) continue
        for (const sc of tec.typical_shifts) {
          if (!defaultShiftCodes.includes(sc)) continue
          if (!techRequiredInShift[sc]) techRequiredInShift[sc] = new Set()
          techRequiredInShift[sc].add(tec.codigo)
        }
      }

      // Staff avoid_shifts: treated as hard — never place in an avoided shift
      // Technique avoid_shifts: staff qualified for a technique with avoid_shifts
      // should not be placed in those shifts for technique coverage purposes
      const techAvoidShift: Record<string, Set<string>> = {} // technique → set of shifts to avoid
      for (const tec of tecnicas) {
        if (tec.avoid_shifts?.length) {
          techAvoidShift[tec.codigo] = new Set(tec.avoid_shifts)
        }
      }

      // ── Step 0: Place ONE qualified person per shift for technique coverage ──
      // For each shift with configured coverage, try to place a single person
      // who covers as many required techniques as possible. This is a hint to
      // the coverage distribution — Steps 1-3 do the real filling.
      // We must NOT over-allocate: at most 1 person per shift here.
      // Search ALL roles — techniques like CNG/SEM may belong to andro staff.
      const allAssignableStaff = [...labStaff, ...androStaff, ...adminStaff]

      for (const shiftCode of defaultShiftCodes) {
        const totalMin = (shiftMinLab[shiftCode] ?? 0) + (shiftMinAndro[shiftCode] ?? 0) + (shiftMinAdmin[shiftCode] ?? 0)
        if (totalMin === 0) continue
        const requiredTechs = techRequiredInShift[shiftCode]
        if (!requiredTechs || requiredTechs.size === 0) continue

        // Check if someone already placed covers at least one required technique
        const alreadyCovered = dayPlanAssignments.some((a) =>
          a.shift_type === shiftCode &&
          allAssignableStaff.find((s) => s.id === a.staff_id)?.staff_skills.some((sk) => requiredTechs.has(sk.skill))
        )
        if (alreadyCovered) continue

        // Find the best unplaced person: covers the most required techniques in this shift
        const candidates = allAssignableStaff.filter((s) => {
          if (assignedToShift.has(s.id)) return false
          if (s.avoid_shifts?.includes(shiftCode)) return false
          return s.staff_skills.some((sk) => requiredTechs.has(sk.skill))
        }).sort((a, b) => {
          const aCovers = a.staff_skills.filter((sk) => requiredTechs.has(sk.skill)).length
          const bCovers = b.staff_skills.filter((sk) => requiredTechs.has(sk.skill)).length
          if (aCovers !== bCovers) return bCovers - aCovers
          // Prefer certified
          const aCert = a.staff_skills.filter((sk) => requiredTechs.has(sk.skill) && sk.level === "certified").length
          const bCert = b.staff_skills.filter((sk) => requiredTechs.has(sk.skill) && sk.level === "certified").length
          if (aCert !== bCert) return bCert - aCert
          return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
        })

        if (candidates.length > 0) {
          const pick = candidates[0]
          dayPlanAssignments.push({ staff_id: pick.id, shift_type: shiftCode as ShiftType })
          assignedToShift.add(pick.id)
          shiftFilled[shiftCode]++
          if (pick.role === "lab") shiftFilledLab[shiftCode]++
          else if (pick.role === "andrology") shiftFilledAndro[shiftCode]++
          else shiftFilledAdmin[shiftCode]++
          for (const sk of pick.staff_skills) shiftSkills[shiftCode].add(sk.skill)
        }
      }

      // ── Step 1: Fill remaining lab shift minimums ──
      const shiftsByLabPriority = [...defaultShiftCodes].sort((a, b) => (shiftMinLab[b] ?? 0) - (shiftMinLab[a] ?? 0))

      for (const shiftCode of shiftsByLabPriority) {
        const min = shiftMinLab[shiftCode] ?? 0
        if (shiftFilledLab[shiftCode] >= min) continue

        const pool = labStaff.filter((s) => !assignedToShift.has(s.id) && !s.avoid_shifts?.includes(shiftCode))
          .sort((a, b) => {
            // Prefer staff whose rotation preference matches this shift
            const aRot = rotationPreference(a.id, shiftCode)
            const bRot = rotationPreference(b.id, shiftCode)
            if (aRot !== bRot) return aRot - bRot
            const aNew = a.staff_skills.filter((sk) => !shiftSkills[shiftCode]?.has(sk.skill)).length
            const bNew = b.staff_skills.filter((sk) => !shiftSkills[shiftCode]?.has(sk.skill)).length
            if (aNew !== bNew) return bNew - aNew
            return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
          })

        for (const s of pool) {
          if (shiftFilledLab[shiftCode] >= min) break
          dayPlanAssignments.push({ staff_id: s.id, shift_type: shiftCode as ShiftType })
          assignedToShift.add(s.id)
          shiftFilled[shiftCode]++
          shiftFilledLab[shiftCode]++
          for (const sk of s.staff_skills) shiftSkills[shiftCode].add(sk.skill)
        }

        if (shiftFilledLab[shiftCode] < min) {
          warnings.push(`${date}: ${shiftCode} — lab insuficiente: ${shiftFilledLab[shiftCode]}/${min}`)
        }
      }

      // ── Step 2: Fair share remaining embryologists across shifts ──
      // Respect avoid_shifts as hard, spread skills evenly
      const unplacedLab = labStaff.filter((s) => !assignedToShift.has(s.id))
      for (const s of unplacedLab) {
        const personSkills = new Set(s.staff_skills.map((sk) => sk.skill))
        // Hard: filter out avoided shifts
        const allowedShifts = defaultShiftCodes.filter((sc) => !s.avoid_shifts?.includes(sc))
        if (allowedShifts.length === 0) {
          // Nowhere to go — use least-filled as fallback
          const fallback = defaultShiftCodes.sort((a, b) => (shiftFilled[a] ?? 0) - (shiftFilled[b] ?? 0))[0]
          dayPlanAssignments.push({ staff_id: s.id, shift_type: fallback as ShiftType })
          assignedToShift.add(s.id)
          shiftFilled[fallback] = (shiftFilled[fallback] ?? 0) + 1
          warnings.push(`${date}: ${s.first_name} ${s.last_name} — placed in avoided shift ${fallback} (no alternatives)`)
          continue
        }
        const bestShift = allowedShifts.sort((a, b) => {
          // Priority 1: shifts still below lab minimum
          const aGap = (shiftMinLab[a] ?? 0) - (shiftFilledLab[a] ?? 0)
          const bGap = (shiftMinLab[b] ?? 0) - (shiftFilledLab[b] ?? 0)
          if (aGap !== bGap) return bGap - aGap
          // Priority 2: rotation preference (weekly/daily/stable)
          const aRot = rotationPreference(s.id, a)
          const bRot = rotationPreference(s.id, b)
          if (aRot !== bRot) return aRot - bRot
          // Priority 3: least-filled overall
          const aFill = shiftFilled[a] ?? 0
          const bFill = shiftFilled[b] ?? 0
          if (aFill !== bFill) return aFill - bFill
          // Priority 4: shift where this person adds the most NEW skills
          const aNewSkills = [...personSkills].filter((sk) => !shiftSkills[a]?.has(sk)).length
          const bNewSkills = [...personSkills].filter((sk) => !shiftSkills[b]?.has(sk)).length
          return bNewSkills - aNewSkills
        })[0]
        dayPlanAssignments.push({ staff_id: s.id, shift_type: bestShift as ShiftType })
        assignedToShift.add(s.id)
        shiftFilled[bestShift] = (shiftFilled[bestShift] ?? 0) + 1
        shiftFilledLab[bestShift] = (shiftFilledLab[bestShift] ?? 0) + 1
        for (const sk of s.staff_skills) shiftSkills[bestShift]?.add(sk.skill)
      }

      // ── Step 3: Place andro per shift minimums, then fair share remainder ──
      const placeRoleByMin = (
        roleStaff: StaffWithSkills[],
        roleMinMap: Record<string, number>,
        roleFilledMap: Record<string, number>,
        roleName: string
      ) => {
        // First: fill per-shift minimums for this role
        for (const shiftCode of defaultShiftCodes) {
          const min = roleMinMap[shiftCode] ?? 0
          if (roleFilledMap[shiftCode] >= min) continue
          const pool = roleStaff.filter((s) => !assignedToShift.has(s.id) && !s.avoid_shifts?.includes(shiftCode))
            .sort((a, b) => {
              const aRot = rotationPreference(a.id, shiftCode)
              const bRot = rotationPreference(b.id, shiftCode)
              if (aRot !== bRot) return aRot - bRot
              return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
            })
          for (const s of pool) {
            if (roleFilledMap[shiftCode] >= min) break
            dayPlanAssignments.push({ staff_id: s.id, shift_type: shiftCode as ShiftType })
            assignedToShift.add(s.id)
            shiftFilled[shiftCode] = (shiftFilled[shiftCode] ?? 0) + 1
            roleFilledMap[shiftCode] = (roleFilledMap[shiftCode] ?? 0) + 1
          }
          if (roleFilledMap[shiftCode] < min) {
            warnings.push(`${date}: ${shiftCode} — ${roleName} insuficiente: ${roleFilledMap[shiftCode]}/${min}`)
          }
        }
        // Then: fair share remaining to least-filled shift (rotation as tiebreaker)
        const remaining = roleStaff.filter((s) => !assignedToShift.has(s.id))
        for (const s of remaining) {
          const allowed = defaultShiftCodes.filter((sc) => !s.avoid_shifts?.includes(sc))
          const shift = (allowed.length > 0
            ? allowed.sort((a, b) => {
                const aRot = rotationPreference(s.id, a)
                const bRot = rotationPreference(s.id, b)
                if (aRot !== bRot) return aRot - bRot
                return (shiftFilled[a] ?? 0) - (shiftFilled[b] ?? 0)
              })[0]
            : defaultShiftCodes.sort((a, b) => (shiftFilled[a] ?? 0) - (shiftFilled[b] ?? 0))[0]
          ) as ShiftType
          dayPlanAssignments.push({ staff_id: s.id, shift_type: shift })
          assignedToShift.add(s.id)
          shiftFilled[shift] = (shiftFilled[shift] ?? 0) + 1
          roleFilledMap[shift] = (roleFilledMap[shift] ?? 0) + 1
        }
      }
      placeRoleByMin(androStaff, shiftMinAndro, shiftFilledAndro, "andrología")
      placeRoleByMin(adminStaff, shiftMinAdmin, shiftFilledAdmin, "admin")

      // ── Rotation swap pass ──
      // For weekly/daily rotation, try swapping same-role pairs between shifts
      // to improve rotation scores. Same-role swaps preserve per-shift minimums
      // (net zero change per shift). Validates avoid_shifts and technique coverage.
      if (rotation !== "stable" && dayPlanAssignments.length > 1) {
        const staffRole: Record<string, string> = {}
        const staffAvoid: Record<string, string[]> = {}
        const staffSkillSet: Record<string, Set<string>> = {}
        for (const s of assigned) {
          staffRole[s.id] = s.role
          staffAvoid[s.id] = s.avoid_shifts ?? []
          staffSkillSet[s.id] = new Set(s.staff_skills.map((sk) => sk.skill))
        }

        // Check if swapping would break technique coverage in either shift
        function wouldBreakTechCoverage(personA: string, shiftA: string, personB: string, shiftB: string): boolean {
          // After swap: A moves to shiftB, B moves to shiftA
          // Check shiftA: B replaces A. Any technique required in shiftA that only A covers?
          const requiredA = techRequiredInShift[shiftA]
          if (requiredA) {
            for (const techCode of requiredA) {
              // Current: does anyone in shiftA cover this tech besides personA?
              const othersCover = dayPlanAssignments.some((x) =>
                x.shift_type === shiftA && x.staff_id !== personA && staffSkillSet[x.staff_id]?.has(techCode)
              )
              if (!othersCover) {
                // Only personA covers it. Does personB also cover it?
                if (!staffSkillSet[personB]?.has(techCode)) return true
              }
            }
          }
          // Check shiftB: A replaces B
          const requiredB = techRequiredInShift[shiftB]
          if (requiredB) {
            for (const techCode of requiredB) {
              const othersCover = dayPlanAssignments.some((x) =>
                x.shift_type === shiftB && x.staff_id !== personB && staffSkillSet[x.staff_id]?.has(techCode)
              )
              if (!othersCover) {
                if (!staffSkillSet[personA]?.has(techCode)) return true
              }
            }
          }
          return false
        }

        let improved = true
        let passes = 0
        while (improved && passes < 3) {
          improved = false
          passes++
          for (let i = 0; i < dayPlanAssignments.length; i++) {
            for (let j = i + 1; j < dayPlanAssignments.length; j++) {
              const a = dayPlanAssignments[i]
              const b = dayPlanAssignments[j]
              if (a.shift_type === b.shift_type) continue
              if (staffRole[a.staff_id] !== staffRole[b.staff_id]) continue

              // Hard: avoid_shifts
              if (staffAvoid[a.staff_id]?.includes(b.shift_type)) continue
              if (staffAvoid[b.staff_id]?.includes(a.shift_type)) continue

              // Hard: don't break technique coverage
              if (wouldBreakTechCoverage(a.staff_id, a.shift_type, b.staff_id, b.shift_type)) continue

              // Swap if it improves total rotation score
              const currentScore = rotationPreference(a.staff_id, a.shift_type) + rotationPreference(b.staff_id, b.shift_type)
              const swappedScore = rotationPreference(a.staff_id, b.shift_type) + rotationPreference(b.staff_id, a.shift_type)
              if (swappedScore < currentScore) {
                const tmp = a.shift_type
                a.shift_type = b.shift_type
                b.shift_type = tmp
                improved = true
              }
            }
          }
        }
      }
    } else {
      // ── Original distribution (no per-shift coverage) ──
      for (const s of assigned) {
        const pref = getPreferredShift(s)
        const shift = pref ?? getRotationShift(s)
        dayPlanAssignments.push({ staff_id: s.id, shift_type: applyAvoidShifts(s, shift) })
      }
    }

    // Warn for avoided days
    for (const s of assigned) {
      if (s.avoid_days?.includes(dayCode)) {
        warnings.push(`${date}: ${s.first_name} ${s.last_name} — assigned on avoided day (${dayCode}) due to coverage needs`)
      }
    }

    days.push({ date, assignments: dayPlanAssignments, skillGaps })

    // Apply asignacion_fija shift overrides (non-coverage mode only —
    // coverage mode pre-places these before Steps 0-3)
    if (!shiftCoverageEnabled) {
      for (const [staffId, fixedShift] of Object.entries(fixedShiftOverrides)) {
        const asg = dayPlanAssignments.find((a) => a.staff_id === staffId)
        if (asg && asg.shift_type !== fixedShift) {
          asg.shift_type = fixedShift as ShiftType
        }
      }
    }

    // Post-distribution: supervisor shift co-location
    // Ensure supervisor is on the same shift as their trainee(s).
    // When a training technique is specified, prefer a shift where that technique
    // is typically done (based on tecnica.typical_shifts).
    const supRules = rules.filter((r) => r.enabled && r.type === "supervisor_requerido")
    for (const rule of supRules) {
      const supervisorId = rule.params.supervisor_id as string | undefined
      if (!supervisorId) continue
      const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
      if (supDays.length > 0 && !supDays.includes(dayCode)) continue
      const supervisedIds = rule.staff_ids.filter((id) => id !== supervisorId)
      const supAsg = dayPlanAssignments.find((a) => a.staff_id === supervisorId)
      if (!supAsg) continue
      const traineeAsg = dayPlanAssignments.find((a) => supervisedIds.includes(a.staff_id))
      if (!traineeAsg) continue

      // Determine valid shifts for the training technique (if any)
      const trainingTec = rule.params.training_tecnica_code as string | undefined
      const validShifts = trainingTec ? tecnicaTypicalShifts[trainingTec] : null

      if (validShifts && validShifts.size > 0) {
        const traineeInValid = validShifts.has(traineeAsg.shift_type)
        const supInValid = validShifts.has(supAsg.shift_type)

        if (traineeInValid) {
          // Trainee is already in a valid shift — move supervisor there
          supAsg.shift_type = traineeAsg.shift_type
        } else if (supInValid) {
          // Supervisor is in a valid shift — move trainee there
          traineeAsg.shift_type = supAsg.shift_type
        } else {
          // Neither is in a valid shift — pick the valid shift with most staff
          // (so we don't create an empty source shift)
          const shiftCounts: Record<string, number> = {}
          for (const a of dayPlanAssignments) shiftCounts[a.shift_type] = (shiftCounts[a.shift_type] ?? 0) + 1
          const bestShift = [...validShifts]
            .filter((s) => dayShiftSet.has(s))
            .sort((a, b) => (shiftCounts[b] ?? 0) - (shiftCounts[a] ?? 0))[0]
          if (bestShift) {
            supAsg.shift_type = bestShift as ShiftType
            traineeAsg.shift_type = bestShift as ShiftType
          } else {
            // No valid shift active today — just co-locate
            supAsg.shift_type = traineeAsg.shift_type
          }
        }
      } else {
        // No training technique — just co-locate on the same shift
        if (supAsg.shift_type !== traineeAsg.shift_type) {
          supAsg.shift_type = traineeAsg.shift_type
        }
      }
    }

    // Post-distribution: balance shifts — move excess from overstaffed to empty shifts
    // Only when shift coverage is NOT enabled — the coverage-aware distribution
    // intentionally places staff per configured minimums. Empty shifts with 0
    // coverage are empty by design.
    const dayPlan = days[days.length - 1]
    if (!shiftCoverageEnabled && defaultShiftCodes.length > 1 && dayPlan.assignments.length > 0) {
      const shiftCount: Record<string, number> = {}
      for (const sc of defaultShiftCodes) shiftCount[sc] = 0
      for (const a of dayPlan.assignments) shiftCount[a.shift_type] = (shiftCount[a.shift_type] ?? 0) + 1

      const emptyShifts = defaultShiftCodes.filter((sc) => (shiftCount[sc] ?? 0) === 0)
      for (const emptyShift of emptyShifts) {
        const maxShift = defaultShiftCodes.reduce((best, sc) =>
          (shiftCount[sc] ?? 0) > (shiftCount[best] ?? 0) ? sc : best
        )
        if ((shiftCount[maxShift] ?? 0) <= 1) break
        const candidates = dayPlan.assignments.filter((a) => a.shift_type === maxShift)
        const movable = candidates.find((a) => {
          const s = assigned.find((st) => st.id === a.staff_id)
          if (!s) return true
          const skills = s.staff_skills.map((sk) => sk.skill)
          return !skills.some((sk) => tecnicaTypicalShifts[sk]?.has(maxShift))
        }) ?? candidates[candidates.length - 1]
        if (movable) {
          movable.shift_type = emptyShift as ShiftType
          shiftCount[maxShift]--
          shiftCount[emptyShift] = 1
        }
      }
    }

    const assignedById = new Map(assigned.map((s) => [s.id, s]))

    // ── Technique-shift alignment pass ──────────────────────────────────────
    // After distribution, check each technique's typical_shift for coverage.
    // If a shift is missing a qualified person, try to swap with someone from
    // another shift. The shiftMinForGuard prevents breaking coverage minimums.
    {

    // Check each technique's typical_shift for coverage. If a shift is missing
    // a qualified person for a mapped technique, try to reassign or add one.

    // Build set of staff protected by supervisor rules (active today) — never move them
    const supervisedStaffIds = new Set<string>()
    for (const rule of rules.filter((r) => r.enabled && r.type === "supervisor_requerido")) {
      const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
      if (supDays.length > 0 && !supDays.includes(dayCode)) continue
      for (const id of rule.staff_ids) supervisedStaffIds.add(id)
    }

    // Group techniques by their typical shift
    const techByShift: Record<string, string[]> = {} // shift_code → [tecnica_codigo...]
    for (const [codigo, shifts] of Object.entries(tecnicaTypicalShifts)) {
      for (const sc of shifts) {
        if (!techByShift[sc]) techByShift[sc] = []
        techByShift[sc].push(codigo)
      }
    }

    // Build shift counts for minimum-protection during alignment
    const shiftCountAfterDist: Record<string, number> = {}
    for (const sc of defaultShiftCodes) shiftCountAfterDist[sc] = 0
    for (const a of dayPlan.assignments) shiftCountAfterDist[a.shift_type] = (shiftCountAfterDist[a.shift_type] ?? 0) + 1

    // Per-shift minimums for guard checks
    const shiftMinForGuard: Record<string, number> = {}
    if (shiftCoverageEnabled && shiftCoverageByDay) {
      for (const sc of defaultShiftCodes) {
        const cov = normalizeShiftCov(shiftCoverageByDay[sc]?.[dayCode])
        shiftMinForGuard[sc] = cov.lab + cov.andrology + cov.admin
      }
    }

    // For each shift, check technique coverage
    for (const [shiftCode, techCodes] of Object.entries(techByShift)) {
      if (!dayShiftSet.has(shiftCode)) continue
      const staffInShift = dayPlan.assignments.filter((a) => a.shift_type === shiftCode)
      const staffIdsInShift = new Set(staffInShift.map((a) => a.staff_id))

      for (const techCode of techCodes) {
        // Check if at least one qualified person is in this shift
        const hasCoverage = staffInShift.some((a) => {
          const member = assignedById.get(a.staff_id)
          return member?.staff_skills.some((sk) => sk.skill === techCode)
        })
        if (hasCoverage) continue

        // Gap found — try to resolve
        // 1. Try to swap: find someone in ANOTHER shift who is qualified and swap them
        //    BUT never move someone out of a shift that would drop below its minimum
        let resolved = false
        const qualifiedInOtherShifts = dayPlan.assignments.filter((a) => {
          if (a.shift_type === shiftCode) return false
          if (!assignedById.get(a.staff_id)?.staff_skills.some((sk) => sk.skill === techCode)) return false
          // Guard: don't move supervised staff (supervisor rules place them deliberately)
          if (supervisedStaffIds.has(a.staff_id)) return false
          // Guard: don't move if source shift would drop below minimum
          const sourceMin = shiftMinForGuard[a.shift_type] ?? 0
          if (sourceMin > 0 && (shiftCountAfterDist[a.shift_type] ?? 0) <= sourceMin) return false
          return true
        })

        if (qualifiedInOtherShifts.length > 0) {
          // Pick rarest: person whose qualification is shared by fewest others
          const scored = qualifiedInOtherShifts.map((a) => {
            const qualCount = assigned.filter((s) =>
              s.staff_skills.some((sk) => sk.skill === techCode)
            ).length
            return { a, rarity: qualCount, workload: workloadScore[a.staff_id] ?? 0 }
          }).sort((x, y) => x.rarity - y.rarity || x.workload - y.workload)

          // Try candidates in order — skip only if they explicitly prefer their current shift
          for (const { a: candidate } of scored) {
            const member = assignedById.get(candidate.staff_id)
            const prefShifts = member?.preferred_shift?.split(",").filter(Boolean) ?? []
            // Block swap only if person explicitly prefers their CURRENT shift
            if (prefShifts.length > 0 && prefShifts.includes(candidate.shift_type)) continue
            // Update shift counts
            shiftCountAfterDist[candidate.shift_type]--
            shiftCountAfterDist[shiftCode] = (shiftCountAfterDist[shiftCode] ?? 0) + 1
            candidate.shift_type = shiftCode as ShiftType
            resolved = true
            break
          }
        }

        if (!resolved) {
          // 2. Try to add: find an unassigned qualified staff member
          //    Skip when coverage-aware distribution is active — minimums are already
          //    enforced and adding extra staff would break the day cap and budgets.
          if (!shiftCoverageEnabled) {
          const unassigned = staff.filter((s) =>
            !(assignedByDate[date] ?? new Set()).has(s.id) &&
            !leaveMap[s.id]?.has(date) &&
            s.onboarding_status === "active" &&
            (weeklyShiftCount[s.id] ?? 0) < (s.days_per_week ?? 5) &&
            s.staff_skills.some((sk) => sk.skill === techCode)
          )
          if (unassigned.length > 0) {
            // Pick rarest then least-assigned
            const scored = unassigned.map((s) => {
              const qualCount = staff.filter((o) =>
                o.staff_skills.some((sk) => sk.skill === techCode)
              ).length
              return { s, rarity: qualCount, workload: workloadScore[s.id] ?? 0 }
            }).sort((x, y) => x.rarity - y.rarity || x.workload - y.workload)

            const pick = scored[0].s
            dayPlan.assignments.push({ staff_id: pick.id, shift_type: shiftCode as ShiftType })
            assigned.push(pick)
            if (!assignedByDate[date]) assignedByDate[date] = new Set()
            assignedByDate[date].add(pick.id)
            resolved = true
          }
          } // end if (!shiftCoverageEnabled)
        }

        if (!resolved) {
          const shiftDef = shiftTypes.find((st) => st.code === shiftCode)
          const shiftName = shiftDef ? shiftDef.code : shiftCode
          // Internal log only — getRotaWeek generates the user-facing
          // "technique_shift_gap" warning with full technique names
          warnings.push(`[engine] ${date}: ${shiftName} sin personal cualificado para ${techCode}`)
        }
      }
    }
    } // end technique-shift alignment pass

    // Hard guard: remove anyone who would exceed their weekly budget
    // (can happen if Phase 1 over-reserves)
    const overBudget = new Set<string>()
    for (const s of assigned) {
      const used = weeklyShiftCount[s.id] ?? 0
      const cap = s.days_per_week ?? 5
      if (used >= cap) overBudget.add(s.id)
    }
    if (overBudget.size > 0) {
      const dayPlan = days[days.length - 1]
      dayPlan.assignments = dayPlan.assignments.filter((a) => !overBudget.has(a.staff_id))
      assigned = assigned.filter((s) => !overBudget.has(s.id))
    }

    // Update scores so later days in the week account for earlier assignments
    const dayPlanFinal = days[days.length - 1]
    for (const s of assigned) {
      workloadScore[s.id]    = (workloadScore[s.id]    ?? 0) + 1
      weeklyShiftCount[s.id] = (weeklyShiftCount[s.id] ?? 0) + 1
    }
    // Track shift usage per person for daily rotation
    for (const a of dayPlanFinal.assignments) {
      if (!weekShiftHistory[a.staff_id]) weekShiftHistory[a.staff_id] = new Set()
      weekShiftHistory[a.staff_id].add(a.shift_type)
    }
  }

  // ── PHASE 3: Repair no_librar_mismo_dia violations ──────────────────────────
  // After all days are planned, find days where ALL conflict group members are off.
  // Fix by swapping a conflict member's off day with a non-conflict same-role member.
  for (const rule of rules.filter((r) => r.enabled && r.type === "no_librar_mismo_dia" && r.is_hard && r.staff_ids.length >= 2)) {
    for (const dayPlan of days) {
      const assignedIds = new Set(dayPlan.assignments.map((a) => a.staff_id))
      const conflictOff = rule.staff_ids.filter((id) => !assignedIds.has(id))
      // Only act if ALL conflict members are off
      if (conflictOff.length < rule.staff_ids.length) continue

      // Pick the conflict member with the most total assignments (easiest to move)
      const conflictCandidates = conflictOff
        .map((id) => staff.find((s) => s.id === id))
        .filter((s): s is StaffWithSkills => !!s && s.onboarding_status !== "inactive" && !leaveMap[s.id]?.has(dayPlan.date))
        .sort((a, b) => {
          const aTotal = days.filter((d) => d.assignments.some((x) => x.staff_id === a.id)).length
          const bTotal = days.filter((d) => d.assignments.some((x) => x.staff_id === b.id)).length
          return bTotal - aTotal // more assignments = easier to swap one out
        })

      let fixed = false
      for (const conflictPerson of conflictCandidates) {
        if (fixed) break
        // Find a non-conflict same-role person working today who could swap off days
        // The swap: conflictPerson works today, donor takes off today + works on conflictPerson's off day
        for (const asg of dayPlan.assignments) {
          if (fixed) break
          if (rule.staff_ids.includes(asg.staff_id)) continue // skip conflict members
          const donor = staff.find((s) => s.id === asg.staff_id)
          if (!donor || donor.role !== conflictPerson.role) continue

          // Find a day where conflictPerson works but donor is off
          const swapDay = days.find((d) => {
            if (d.date === dayPlan.date) return false
            const cpWorking = d.assignments.some((x) => x.staff_id === conflictPerson.id)
            const donorOff = !d.assignments.some((x) => x.staff_id === donor.id)
            if (!cpWorking || !donorOff) return false
            // Check donor is available on that day
            if (leaveMap[donor.id]?.has(d.date)) return false
            if (donor.start_date > d.date || (donor.end_date && donor.end_date < d.date)) return false
            // Don't create a new violation: after removing conflictPerson from this day,
            // ensure at least one conflict member still works here
            const otherConflictWorking = d.assignments.some((x) =>
              rule.staff_ids.includes(x.staff_id) && x.staff_id !== conflictPerson.id
            )
            if (!otherConflictWorking) {
              // All conflict members would be off on swapDay after removing conflictPerson
              // Check if any conflict member besides conflictPerson is assigned
              const anyConflictAssigned = rule.staff_ids.some((id) =>
                id !== conflictPerson.id && d.assignments.some((x) => x.staff_id === id)
              )
              if (!anyConflictAssigned) return false // would create a new violation
            }
            return true
          })

          if (!swapDay) continue

          // Execute swap:
          // 1. Remove donor from today, add conflictPerson to today (with donor's shift)
          const donorShift = asg.shift_type
          dayPlan.assignments = dayPlan.assignments.filter((a) => a.staff_id !== donor.id)
          dayPlan.assignments.push({ staff_id: conflictPerson.id, shift_type: donorShift })

          // 2. Remove conflictPerson from swapDay, add donor (with conflictPerson's shift)
          const cpAsg = swapDay.assignments.find((a) => a.staff_id === conflictPerson.id)
          const cpShift = cpAsg?.shift_type ?? donorShift
          swapDay.assignments = swapDay.assignments.filter((a) => a.staff_id !== conflictPerson.id)
          swapDay.assignments.push({ staff_id: donor.id, shift_type: cpShift })

          warnings.push(
            `[engine] ${dayPlan.date}: no_librar_mismo_dia — swapped ${conflictPerson.first_name} ↔ ${donor.first_name}`
          )
          fixed = true
        }
      }

      if (!fixed) {
        warnings.push(
          `${dayPlan.date}: no_librar_mismo_dia — could not resolve: ${conflictOff.map((id) => staff.find((s) => s.id === id)?.first_name ?? id).join(" + ")} all off`
        )
      }
    }
  }

  // ── Re-enforce supervisor co-location after Phase 3 ────────────────────────
  // Phase 3 (no_librar_mismo_dia) swaps staff between days, potentially splitting
  // supervised pairs. Re-apply co-location for all supervisor rules.
  const dayCodeLookup = ["sun","mon","tue","wed","thu","fri","sat"] as const
  for (const rule of rules.filter((r) => r.enabled && r.type === "supervisor_requerido")) {
    const supervisorId = rule.params.supervisor_id as string | undefined
    if (!supervisorId) continue
    const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
    const supervisedIds = rule.staff_ids.filter((id) => id !== supervisorId)
    const trainingTec = rule.params.training_tecnica_code as string | undefined
    const validShifts = trainingTec ? tecnicaTypicalShifts[trainingTec] : null

    for (const dayPlan of days) {
      const dc = dayCodeLookup[new Date(dayPlan.date + "T12:00:00").getDay()] as string
      if (supDays.length > 0 && !supDays.includes(dc)) continue
      const supAsg = dayPlan.assignments.find((a) => a.staff_id === supervisorId)
      if (!supAsg) continue
      const traineeAsg = dayPlan.assignments.find((a) => supervisedIds.includes(a.staff_id))
      if (!traineeAsg) continue
      if (supAsg.shift_type === traineeAsg.shift_type) continue

      // Determine target shift
      const dayShiftSet = new Set(activeShiftTypes
        .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dc))
        .map((st) => st.code))

      if (validShifts && validShifts.size > 0) {
        const traineeInValid = validShifts.has(traineeAsg.shift_type)
        const supInValid = validShifts.has(supAsg.shift_type)
        if (traineeInValid) {
          supAsg.shift_type = traineeAsg.shift_type
        } else if (supInValid) {
          traineeAsg.shift_type = supAsg.shift_type
        } else {
          const shiftCounts: Record<string, number> = {}
          for (const a of dayPlan.assignments) shiftCounts[a.shift_type] = (shiftCounts[a.shift_type] ?? 0) + 1
          const bestShift = [...validShifts]
            .filter((s) => dayShiftSet.has(s))
            .sort((a, b) => (shiftCounts[b] ?? 0) - (shiftCounts[a] ?? 0))[0]
          if (bestShift) {
            supAsg.shift_type = bestShift as ShiftType
            traineeAsg.shift_type = bestShift as ShiftType
          } else {
            supAsg.shift_type = traineeAsg.shift_type
          }
        }
      } else {
        supAsg.shift_type = traineeAsg.shift_type
      }
    }
  }

  // ── Collect training technique assignments from supervisor rules ──────────
  // Map: trainee staff_id → forced technique code (from supervisor_requerido rules with training_tecnica_code)
  const trainingTecnicaMap: Record<string, string> = {}
  for (const rule of rules.filter((r) => r.enabled && r.type === "supervisor_requerido")) {
    const trainingTecCode = rule.params.training_tecnica_code as string | undefined
    if (!trainingTecCode) continue
    const supervisorId = rule.params.supervisor_id as string | undefined
    const traineeIds = rule.staff_ids.filter((id) => id !== supervisorId)
    for (const id of traineeIds) {
      trainingTecnicaMap[id] = trainingTecCode
    }
  }

  // ── PHASE 4: Task assignment (shift engine) ─────────────────────────────────
  // Only runs when explicit task coverage is configured. By_task orgs use the
  // task engine instead. By_shift orgs without task coverage should not produce
  // task-level rows — having active técnicas alone is not enough.
  const hasExplicitTaskCoverage = taskCoverageEnabled && taskCoverageByDay && Object.keys(taskCoverageByDay).length > 0
  if (hasExplicitTaskCoverage) {
    const taskConflictThreshold = labConfig.task_conflict_threshold ?? 3

    for (const dayPlan of days) {
      const date = dayPlan.date
      const dayCode = getDayCode(date)
      const assignedStaff = dayPlan.assignments.map((a) => {
        const s = staff.find((st) => st.id === a.staff_id)
        return s ? { ...a, staff: s } : null
      }).filter(Boolean) as { staff_id: string; shift_type: ShiftType; staff: StaffWithSkills }[]

      if (assignedStaff.length === 0) continue

      // 4.1: Build task demand for this day (explicit coverage only)
      const taskDemand: { code: string; needed: number; typical_shifts: Set<string>; avoid_shifts: Set<string> }[] = []
      for (const [tecCode, dayCov] of Object.entries(taskCoverageByDay!)) {
        const needed = dayCov[dayCode] ?? 0
        if (needed <= 0) continue
        const tec = tecnicas.find((t) => t.codigo === tecCode)
        taskDemand.push({
          code: tecCode,
          needed,
          typical_shifts: new Set(tec?.typical_shifts ?? []),
          avoid_shifts: new Set(tec?.avoid_shifts ?? []),
        })
      }

      // 4.1b: Apply restriccion_dia_tecnica rules — remove demand for blocked techniques
      for (const rule of rules.filter((r) => r.enabled && r.type === "restriccion_dia_tecnica")) {
        const tecCode = rule.params.tecnica_code as string | undefined
        const dayMode = rule.params.dayMode as string | undefined
        const restrictedDays = (rule.params.restrictedDays as string[] | undefined) ?? []
        if (!tecCode || restrictedDays.length === 0) continue
        const blocked = dayMode === "only"
          ? !restrictedDays.includes(dayCode)  // "only" mode: blocked if day NOT in list
          : restrictedDays.includes(dayCode)    // "never" mode: blocked if day IS in list
        if (blocked) {
          const idx = taskDemand.findIndex((td) => td.code === tecCode)
          if (idx !== -1) {
            taskDemand.splice(idx, 1)
            warnings.push(`[rule] ${tecCode} blocked on ${dayCode} by restriccion_dia_tecnica`)
          }
        }
      }

      if (taskDemand.length === 0) continue

      // 4.2: Build staff capability matrix
      const staffTaskCount: Record<string, number> = {} // staff_id → tasks assigned so far
      const staffSkillMap: Record<string, { certified: Set<string>; training: Set<string> }> = {}
      for (const { staff_id, staff: s } of assignedStaff) {
        staffTaskCount[staff_id] = 0
        const certified = new Set<string>()
        const training = new Set<string>()
        for (const sk of s.staff_skills) {
          if (sk.level === "certified") certified.add(sk.skill)
          else if (sk.level === "training") training.add(sk.skill)
        }
        staffSkillMap[staff_id] = { certified, training }
      }

      // 4.3: Sort tasks by rarest first (fewest qualified staff)
      const qualifiedCount = (code: string): number => {
        return assignedStaff.filter(({ staff_id }) => {
          const skills = staffSkillMap[staff_id]
          return skills?.certified.has(code) || skills?.training.has(code)
        }).length
      }
      taskDemand.sort((a, b) => qualifiedCount(a.code) - qualifiedCount(b.code))

      // Track task assignments for no_misma_tarea checking
      const dayTaskMap: Record<string, Set<string>> = {} // staff_id → set of task codes

      // 4.3b: Force training technique assignments from supervisor rules
      for (const { staff_id } of assignedStaff) {
        const forcedTec = trainingTecnicaMap[staff_id]
        if (!forcedTec) continue
        // Only force if the technique exists in demand (even if filled)
        const demandEntry = taskDemand.find((td) => td.code === forcedTec)
        if (!demandEntry) continue
        taskAssignments.push({ staff_id, tecnica_code: forcedTec, date })
        staffTaskCount[staff_id] = (staffTaskCount[staff_id] ?? 0) + 1
        if (!dayTaskMap[staff_id]) dayTaskMap[staff_id] = new Set()
        dayTaskMap[staff_id].add(forcedTec)
        // Reduce remaining demand
        demandEntry.needed = Math.max(0, demandEntry.needed - 1)
      }

      for (const task of taskDemand) {
        // Find qualified staff for this task
        const candidates = assignedStaff.filter(({ staff_id }) => {
          if (staffTaskCount[staff_id] >= taskConflictThreshold) return false
          const skills = staffSkillMap[staff_id]
          return skills?.certified.has(task.code) || skills?.training.has(task.code)
        })

        // Sort candidates: compatible shift first, then certified > training, then fewest tasks, then workload
        candidates.sort((a, b) => {
          // Prefer staff on a compatible shift
          const aShiftOk = task.typical_shifts.size === 0 || task.typical_shifts.has(a.shift_type) ? 0 : 1
          const bShiftOk = task.typical_shifts.size === 0 || task.typical_shifts.has(b.shift_type) ? 0 : 1
          if (aShiftOk !== bShiftOk) return aShiftOk - bShiftOk
          // Avoid staff on an avoided shift
          const aAvoid = task.avoid_shifts.has(a.shift_type) ? 1 : 0
          const bAvoid = task.avoid_shifts.has(b.shift_type) ? 1 : 0
          if (aAvoid !== bAvoid) return aAvoid - bAvoid
          // Certified before training
          const aCert = staffSkillMap[a.staff_id]?.certified.has(task.code) ? 0 : 1
          const bCert = staffSkillMap[b.staff_id]?.certified.has(task.code) ? 0 : 1
          if (aCert !== bCert) return aCert - bCert
          // Fewest tasks assigned so far
          const aCount = staffTaskCount[a.staff_id]
          const bCount = staffTaskCount[b.staff_id]
          if (aCount !== bCount) return aCount - bCount
          // Lowest workload
          return (workloadScore[a.staff_id] ?? 0) - (workloadScore[b.staff_id] ?? 0)
        })

        let filled = 0
        for (const candidate of candidates) {
          if (filled >= task.needed) break
          taskAssignments.push({ staff_id: candidate.staff_id, tecnica_code: task.code, date })
          staffTaskCount[candidate.staff_id]++
          if (!dayTaskMap[candidate.staff_id]) dayTaskMap[candidate.staff_id] = new Set()
          dayTaskMap[candidate.staff_id].add(task.code)
          filled++
        }

        // If still unfilled, try adding unassigned staff to the day
        if (filled < task.needed) {
          const unassignedQualified = staff.filter((s) => {
            if (assignedStaff.some((a) => a.staff_id === s.id)) return false
            if (s.onboarding_status === "inactive") return false
            if (s.start_date > date || (s.end_date && s.end_date < date)) return false
            if (leaveMap[s.id]?.has(date)) return false
            if ((weeklyShiftCount[s.id] ?? 0) >= (s.days_per_week ?? 5)) return false
            const skills = staffSkillMap[s.id] ?? {
              certified: new Set(s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill)),
              training: new Set(s.staff_skills.filter((sk) => sk.level === "training").map((sk) => sk.skill)),
            }
            return skills.certified.has(task.code) || skills.training.has(task.code)
          }).sort((a, b) => (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0))

          for (const pick of unassignedQualified) {
            if (filled >= task.needed) break
            // Add to day assignments — pick a compatible shift
            const dayShiftCodes = shiftTypes
              .filter((st) => st.active !== false && (!st.active_days || st.active_days.length === 0 || st.active_days.includes(dayCode)))
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((st) => st.code)
            const compatibleShift = (task.typical_shifts.size > 0
              ? dayShiftCodes.find((sc) => task.typical_shifts.has(sc))
              : null) ?? dayShiftCodes[0] ?? "T1"

            dayPlan.assignments.push({ staff_id: pick.id, shift_type: compatibleShift as ShiftType })
            assignedStaff.push({ staff_id: pick.id, shift_type: compatibleShift as ShiftType, staff: pick })
            staffTaskCount[pick.id] = 1
            staffSkillMap[pick.id] = {
              certified: new Set(pick.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill)),
              training: new Set(pick.staff_skills.filter((sk) => sk.level === "training").map((sk) => sk.skill)),
            }
            if (!dayTaskMap[pick.id]) dayTaskMap[pick.id] = new Set()
            dayTaskMap[pick.id].add(task.code)
            taskAssignments.push({ staff_id: pick.id, tecnica_code: task.code, date })
            weeklyShiftCount[pick.id] = (weeklyShiftCount[pick.id] ?? 0) + 1
            workloadScore[pick.id] = (workloadScore[pick.id] ?? 0) + 1
            filled++
            warnings.push(`${date}: ${pick.first_name} ${pick.last_name} añadido para cubrir tarea ${task.code} (supera mínimo departamento)`)
          }
        }

        if (filled < task.needed) {
          warnings.push(`${date}: COBERTURA INSUFICIENTE — ${task.code} necesita ${task.needed}, asignados ${filled}`)
        }

        // Warn if only training-level staff cover this task
        const assignedForTask = taskAssignments.filter((ta) => ta.date === date && ta.tecnica_code === task.code)
        const allTraining = assignedForTask.length > 0 && assignedForTask.every((ta) => {
          return !staffSkillMap[ta.staff_id]?.certified.has(task.code)
        })
        if (allTraining && assignedForTask.length > 0) {
          warnings.push(`${date}: solo personal en formación para ${task.code}`)
        }
      }

      // 4.6: Enforce no_misma_tarea rules
      for (const rule of rules.filter((r) => r.enabled && r.type === "no_misma_tarea")) {
        const ruleStaffIds = new Set(rule.staff_ids)
        // Group task assignments by task for this day
        const taskToStaff: Record<string, string[]> = {}
        for (const ta of taskAssignments.filter((ta) => ta.date === date)) {
          if (!taskToStaff[ta.tecnica_code]) taskToStaff[ta.tecnica_code] = []
          taskToStaff[ta.tecnica_code].push(ta.staff_id)
        }

        for (const [taskCode, staffIds] of Object.entries(taskToStaff)) {
          const conflicting = staffIds.filter((id) => ruleStaffIds.has(id))
          if (conflicting.length <= 1) continue

          if (rule.is_hard) {
            // Keep the first, try to reassign the rest to other tasks
            for (let i = 1; i < conflicting.length; i++) {
              const staffId = conflicting[i]
              const skills = staffSkillMap[staffId]
              // Find another task this person is qualified for and not yet assigned to
              const currentTasks = dayTaskMap[staffId] ?? new Set()
              const altTask = taskDemand.find((t) =>
                t.code !== taskCode &&
                !currentTasks.has(t.code) &&
                (skills?.certified.has(t.code) || skills?.training.has(t.code))
              )
              if (altTask) {
                // Move: remove from current task, add to alternative
                const idx = taskAssignments.findIndex((ta) => ta.date === date && ta.staff_id === staffId && ta.tecnica_code === taskCode)
                if (idx >= 0) {
                  taskAssignments[idx].tecnica_code = altTask.code
                  currentTasks.delete(taskCode)
                  currentTasks.add(altTask.code)
                }
              } else {
                // Can't reassign — remove from task entirely
                const idx = taskAssignments.findIndex((ta) => ta.date === date && ta.staff_id === staffId && ta.tecnica_code === taskCode)
                if (idx >= 0) {
                  taskAssignments.splice(idx, 1)
                  staffTaskCount[staffId]--
                  currentTasks.delete(taskCode)
                }
                warnings.push(`${date}: ${staff.find((s) => s.id === staffId)?.first_name ?? staffId} retirado de ${taskCode} (no_misma_tarea)`)
              }
            }
          } else {
            const names = conflicting.map((id) => staff.find((s) => s.id === id)?.first_name ?? id)
            warnings.push(`${date}: ${names.join(" + ")} asignados a ${taskCode} (no_misma_tarea, soft)`)
          }
        }
      }
    }
  }

  return { days, taskAssignments, warnings }
}
