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
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  taskCoverageEnabled: _taskCoverageEnabled = false,
  taskCoverageByDay,
}: EngineParams): RotaEngineResult {
  let taskCoverageEnabled = _taskCoverageEnabled
  const days: DayPlan[] = []
  const taskAssignments: TaskAssignment[] = []
  const warnings: string[] = []



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

  // Auto-detect per-shift coverage: if task_coverage_by_day has keys matching
  // shift codes, enable coverage-aware distribution regardless of toggle state.
  if (!taskCoverageEnabled && taskCoverageByDay && shiftCodes.length > 1) {
    const covKeys = Object.keys(taskCoverageByDay)
    const hasShiftKeys = covKeys.some((k) => activeShiftSet.has(k))
    if (hasShiftKeys) {
      taskCoverageEnabled = true
      warnings.push("[auto] Per-shift coverage detected from task_coverage_by_day — enabling coverage-aware distribution")
    }
  }

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
    const labRequired = Math.max(dayCoverage?.lab ?? labConfig.min_lab_coverage, dynamicLabMin)
    const andrologyRequired = dayCoverage?.andrology ?? labConfig.min_andrology_coverage
    const adminRequired = dayCoverage?.admin ?? 0

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

    if (taskCoverageEnabled && taskCoverageByDay) {
      // Per-role caps: shift minimums are for embryologists only
      const dayShiftCodesForCap = activeShiftTypes
        .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dayCode))
        .map((st) => st.code)
      const shiftMinTotal = dayShiftCodesForCap.reduce((sum, sc) => sum + (taskCoverageByDay[sc]?.[dayCode] ?? 0), 0)
      const labCap = Math.max(shiftMinTotal, labRequired)

      // Fill each role separately to guarantee enough embryologists
      const remainingLab = remaining.filter((s) => s.role === "lab")
      const remainingAndro = remaining.filter((s) => s.role === "andrology")
      const remainingAdmin = remaining.filter((s) => s.role === "admin")

      let labCount = reservedStaff.filter((s) => s.role === "lab").length
      for (const s of remainingLab) {
        if (labCount >= labCap) break
        assignedSet.add(s.id)
        labCount++
      }
      let androCount = reservedStaff.filter((s) => s.role === "andrology").length
      for (const s of remainingAndro) {
        if (androCount >= andrologyRequired) break
        assignedSet.add(s.id)
        androCount++
      }
      let adminCount = reservedStaff.filter((s) => s.role === "admin").length
      for (const s of remainingAdmin) {
        if (adminCount >= adminRequired) break
        assignedSet.add(s.id)
        adminCount++
      }
    } else {
      for (const s of remaining) {
        assignedSet.add(s.id)
      }
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
              if (rule.is_hard) hardRemovals.add(s.id)
              else warnings.push(`${date}: ${s.first_name} ${s.last_name} has reached ${maxDays} consecutive days`)
            }
          }
        }

        if (rule.type === "distribucion_fines_semana" && weekend) {
          const maxPerMonth = (rule.params.maxPerMonth as number) ?? 2
          for (const s of assigned) {
            if (!affects(s.id)) continue
            if ((weekendCountThisMonth[s.id] ?? 0) >= maxPerMonth) {
              if (rule.is_hard) hardRemovals.add(s.id)
              else warnings.push(`${date}: ${s.first_name} ${s.last_name} has reached ${maxPerMonth} weekends this month`)
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
              if (rule.is_hard) hardRemovals.add(byWorkload[i].id)
              else warnings.push(
                `${date}: ${byWorkload[i].first_name} ${byWorkload[i].last_name} cannot coincide with ${byWorkload[0].first_name} ${byWorkload[0].last_name}`
              )
            }
          }
        }

        if (rule.type === "supervisor_requerido") {
          const supervisorId = rule.params.supervisor_id as string | undefined
          if (supervisorId) {
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
                if (rule.is_hard) hardRemovals.add(s.id)
                else warnings.push(`${date}: ${s.first_name} ${s.last_name} worked last weekend — needs rest (descanso_fin_de_semana)`)
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
                if (rule.is_hard) hardRemovals.add(s.id)
                else warnings.push(`${date}: ${s.first_name} ${s.last_name} worked last weekend — alternating weekends required`)
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
                if (rule.is_hard) hardRemovals.add(s.id)
                else warnings.push(`${date}: ${s.first_name} ${s.last_name} needs ${restDays} rest days after weekend`)
              }
            }
          }
        }

        // no_turno_doble: each person is assigned at most once per day already

        if (rule.type === "no_librar_mismo_dia") {
          // Ensure the selected staff are not ALL off on the same day.
          // This rule requires specific staff_ids — skip if none specified.
          if (rule.staff_ids.length < 2) continue
          const conflictIds = new Set(rule.staff_ids)
          const assignedConflict = assigned.filter((s) => conflictIds.has(s.id))
          const allConflictStaff = staff.filter((s) => conflictIds.has(s.id))
          // Only act when every member of the group is currently unassigned
          if (assignedConflict.length === 0 && allConflictStaff.length > 1) {
            // Find eligible staff from the conflict group to force assign
            const eligible = allConflictStaff.filter((s) => {
              if (s.onboarding_status === "inactive") return false
              if (s.start_date > date || (s.end_date && s.end_date < date)) return false
              if (leaveMap[s.id]?.has(date)) return false
              return true
            }).sort((a, b) => (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0))

            if (eligible.length > 0) {
              if (rule.is_hard) {
                // Force-assign the lowest-workload eligible member
                const pick = eligible[0]
                assigned.push(pick)
                assignedLab = pick.role === "lab" ? [...assignedLab, pick] : assignedLab
                assignedAndrology = pick.role === "andrology" ? [...assignedAndrology, pick] : assignedAndrology
                // Track the forced assignment so budget is accounted for
                weeklyShiftCount[pick.id] = (weeklyShiftCount[pick.id] ?? 0) + 1
              }
              warnings.push(
                `${date}: ${allConflictStaff.map((s) => `${s.first_name} ${s.last_name}`).join(" + ")} — no_librar_mismo_dia${!rule.is_hard ? " (soft)" : ""}`
              )
            }
          }
        }

        // no_misma_tarea: enforced post-assignment at task assignment level — engine emits warning
        if (rule.type === "no_misma_tarea") {
          // This rule is checked after técnica assignment in the technique-shift alignment pass.
          // At the shift-assignment stage, we just ensure both are assigned (prerequisite for the check).
          // The actual técnica conflict detection happens in the rota actions or UI layer.
          // Store the rule params so warnings can reference it.
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

    // 7. Debug: always log assignment counts per day
    warnings.push(
      `[debug] ${date} (${dayCode}): ${assignedLab.length}L+${assignedAndrology.length}A+${assignedAdmin.length}Ad = ${assigned.length} assigned` +
      ` | need ${labRequired}L+${andrologyRequired}A+${adminRequired}Ad` +
      ` | reserved=${reservedIds.size} weekend=${weekend}`
    )

    // 9. Skill gaps
    const coveredSkills = new Set(assigned.flatMap((s) => s.staff_skills.map((sk) => sk.skill)))
    const skillGaps = [...allOrgSkills].filter((skill) => !coveredSkills.has(skill)) as SkillName[]
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

    if (taskCoverageEnabled && taskCoverageByDay && defaultShiftCodes.length > 1) {
      // ── Coverage-aware distribution ──
      // Shift minimums apply to embryologists (lab role) only.
      // Andro/admin are placed separately after minimums are filled.
      const labStaff = assigned.filter((s) => s.role === "lab")
      const nonLabStaff = assigned.filter((s) => s.role !== "lab")

      const shiftMin: Record<string, number> = {}
      const shiftFilled: Record<string, number> = {}
      let totalMin = 0
      for (const sc of defaultShiftCodes) {
        const min = taskCoverageByDay[sc]?.[dayCode] ?? 0
        shiftMin[sc] = min
        shiftFilled[sc] = 0
        totalMin += min
      }

      const assignedToShift = new Set<string>()

      // ── Step 1: Fill each shift's minimum with embryologists ──
      // Sort shifts by minimum descending — fill hardest constraints first
      const shiftsByPriority = [...defaultShiftCodes].sort((a, b) => (shiftMin[b] ?? 0) - (shiftMin[a] ?? 0))

      for (const shiftCode of shiftsByPriority) {
        const min = shiftMin[shiftCode] ?? 0
        if (min <= 0) continue

        // First try: embryologists who prefer this shift (via skills/typical_shifts)
        const preferring = labStaff.filter((s) => {
          if (assignedToShift.has(s.id)) return false
          if (s.avoid_shifts?.includes(shiftCode)) return false
          const pref = getPreferredShift(s)
          return pref === shiftCode
        }).sort((a, b) => (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0))

        for (const s of preferring) {
          if (shiftFilled[shiftCode] >= min) break
          dayPlanAssignments.push({ staff_id: s.id, shift_type: shiftCode as ShiftType })
          assignedToShift.add(s.id)
          shiftFilled[shiftCode]++
        }

        // Second try: any unplaced embryologist, sorted by suitability
        if (shiftFilled[shiftCode] < min) {
          const pool = labStaff.filter((s) => !assignedToShift.has(s.id))
            .sort((a, b) => {
              const aAvoids = a.avoid_shifts?.includes(shiftCode) ? 1 : 0
              const bAvoids = b.avoid_shifts?.includes(shiftCode) ? 1 : 0
              if (aAvoids !== bAvoids) return aAvoids - bAvoids
              return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
            })
          for (const s of pool) {
            if (shiftFilled[shiftCode] >= min) break
            dayPlanAssignments.push({ staff_id: s.id, shift_type: shiftCode as ShiftType })
            assignedToShift.add(s.id)
            shiftFilled[shiftCode]++
          }
        }

        if (shiftFilled[shiftCode] < min) {
          warnings.push(`${date}: ${shiftCode} — cobertura insuficiente: ${shiftFilled[shiftCode]}/${min}`)
        }
      }

      // ── Step 2: Place remaining embryologists as fair share across shifts ──
      const unplacedLab = labStaff.filter((s) => !assignedToShift.has(s.id))
      for (const s of unplacedLab) {
        // Assign to the shift furthest below its minimum, or least-filled shift
        const bestShift = defaultShiftCodes
          .filter((sc) => !s.avoid_shifts?.includes(sc))
          .sort((a, b) => {
            // Priority: shifts still below minimum
            const aGap = (shiftMin[a] ?? 0) - (shiftFilled[a] ?? 0)
            const bGap = (shiftMin[b] ?? 0) - (shiftFilled[b] ?? 0)
            if (aGap !== bGap) return bGap - aGap
            // Then least-filled overall
            return (shiftFilled[a] ?? 0) - (shiftFilled[b] ?? 0)
          })[0]
        const shift = bestShift ?? defaultShiftCodes[0]
        dayPlanAssignments.push({ staff_id: s.id, shift_type: shift as ShiftType })
        assignedToShift.add(s.id)
        shiftFilled[shift] = (shiftFilled[shift] ?? 0) + 1
      }

      // ── Step 3: Place andro/admin via preference or least-filled shift ──
      for (const s of nonLabStaff) {
        const pref = getPreferredShift(s)
        const shift = pref ? applyAvoidShifts(s, pref) : defaultShiftCodes
          .filter((sc) => !s.avoid_shifts?.includes(sc))
          .sort((a, b) => (shiftFilled[a] ?? 0) - (shiftFilled[b] ?? 0))[0] as ShiftType ?? defaultShiftCodes[0] as ShiftType
        dayPlanAssignments.push({ staff_id: s.id, shift_type: shift as ShiftType })
        shiftFilled[shift] = (shiftFilled[shift] ?? 0) + 1
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

    // Post-distribution: balance shifts — move excess from overstaffed to empty shifts
    const dayPlan = days[days.length - 1]
    if (!taskCoverageEnabled && defaultShiftCodes.length > 1 && dayPlan.assignments.length > 0) {
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

    // ── Technique-shift alignment pass (by_shift only) ──────────────────────
    // Check each technique's typical_shift for coverage. If a shift is missing
    // a qualified person for a mapped technique, try to reassign or add one.

    // Group techniques by their typical shift
    const techByShift: Record<string, string[]> = {} // shift_code → [tecnica_codigo...]
    for (const [codigo, shifts] of Object.entries(tecnicaTypicalShifts)) {
      for (const sc of shifts) {
        if (!techByShift[sc]) techByShift[sc] = []
        techByShift[sc].push(codigo)
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
        let resolved = false
        const qualifiedInOtherShifts = dayPlan.assignments.filter((a) =>
          a.shift_type !== shiftCode &&
          assignedById.get(a.staff_id)?.staff_skills.some((sk) => sk.skill === techCode)
        )

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
            candidate.shift_type = shiftCode as ShiftType
            resolved = true
            break
          }
        }

        if (!resolved) {
          // 2. Try to add: find an unassigned qualified staff member
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
        }

        if (!resolved) {
          const shiftDef = shiftTypes.find((st) => st.code === shiftCode)
          const shiftName = shiftDef ? shiftDef.code : shiftCode
          warnings.push(`${date}: ${shiftName} sin personal cualificado para ${techCode}`)
        }
      }
    }

    // Update scores so later days in the week account for earlier assignments
    for (const s of assigned) {
      workloadScore[s.id]    = (workloadScore[s.id]    ?? 0) + 1
      weeklyShiftCount[s.id] = (weeklyShiftCount[s.id] ?? 0) + 1
    }
  }

  // ── PHASE 4: Task assignment (only when taskCoverageEnabled) ────────────────
  if (taskCoverageEnabled && taskCoverageByDay && Object.keys(taskCoverageByDay).length > 0) {
    const taskConflictThreshold = labConfig.task_conflict_threshold ?? 3

    for (const dayPlan of days) {
      const date = dayPlan.date
      const dayCode = getDayCode(date)
      const assignedStaff = dayPlan.assignments.map((a) => {
        const s = staff.find((st) => st.id === a.staff_id)
        return s ? { ...a, staff: s } : null
      }).filter(Boolean) as { staff_id: string; shift_type: ShiftType; staff: StaffWithSkills }[]

      if (assignedStaff.length === 0) continue

      // 4.1: Build task demand for this day
      const taskDemand: { code: string; needed: number; typical_shifts: Set<string>; avoid_shifts: Set<string> }[] = []
      for (const [tecCode, dayCov] of Object.entries(taskCoverageByDay)) {
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
