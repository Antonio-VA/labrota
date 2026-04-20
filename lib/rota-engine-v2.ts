/**
 * LabRota scheduling engine v2.
 * Pure function — no DB calls, fully testable.
 *
 * Three-level constraint hierarchy:
 *
 * LEVEL 1 — ABSOLUTE (break = invalid schedule):
 *  L1.1 Leave: staff on leave cannot be assigned
 *  L1.2 Budget: each staff works EXACTLY days_per_week days
 *  L1.3 Active shifts: 0 coverage = 0 staff (closed shifts)
 *  L1.4 Days off mode: always_weekend forces weekend offs
 *  L1.5 Calendar rules: restriccion_dia_tecnica
 *  L1.6 Shift coverage minimums per role per shift per day
 *  L1.7 One shift per day per person
 *
 * LEVEL 2 — MANDATORY (override only if L1 requires it):
 *  L2.1 Technique coverage: right skills in right shifts
 *  L2.2 Hard user rules (is_hard=true)
 *  L2.3 Preferred days off: avoid_days = STRONG, preferred_days = weak
 *  L2.4 Preferred shifts: avoid_shifts = STRONG, preferred_shift = weak
 *
 * LEVEL 3 — OPTIMISATION (no L1/L2 loss):
 *  L3.1 Fair share: excess budget distributed evenly across shifts
 *  L3.2 Shift rotation
 *  L3.3 Soft rules (is_hard=false)
 *  L3.4 Workload balance
 */

import type {
  StaffWithSkills,
  ShiftType,
  SkillName,
} from "@/lib/types/database"
import { getDayCode, isWeekend, addDays, getWeekDates, normalizeShiftCov } from "@/lib/engine-helpers"
import { toISODate } from "@/lib/format-date"
import type { DayPlan, TaskAssignment, RotaEngineResult, EngineParams } from "./rota-engine-v2/types"
import { inferPreferences } from "./rota-engine-v2/infer-preferences"
import { buildLeaveMap } from "./rota-engine-v2/leave-map"
import { buildHolidayContext } from "./rota-engine-v2/holiday-helpers"
import { repairNoLibrarMismoDia } from "./rota-engine-v2/no-librar-swap"
import { reEnforceSupervisorColocation, collectTrainingTecnicaMap } from "./rota-engine-v2/supervisor-relocate"
import { repairShiftCoverage } from "./rota-engine-v2/coverage-repair"
import { assignTasksToShifts } from "./rota-engine-v2/task-assignment"
import { enforceFinalBudget } from "./rota-engine-v2/budget-enforcement"

export type { DayPlan, TaskAssignment, RotaEngineResult, EngineParams }

// ── Engine ────────────────────────────────────────────────────────────────────

export function runRotaEngineV2({
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
  publicHolidays = {},
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

  const { inferredShiftPref, inferredDayPref, inferredDayAvoid } = inferPreferences(recentAssignments, staff)

  const allWeekDates = getWeekDates(weekStart)

  // Weekly shift counter — resets at the start of each generated week
  const weeklyShiftCount: Record<string, number> = {}
  const weekShiftHistory: Record<string, Set<string>> = {} // staff_id → shifts used this week (for daily rotation)

  const { leaveMap, leaveThisWeek } = buildLeaveMap(leaves, allWeekDates)

  // Shift codes sorted by sort_order — only active shifts are used for assignment.
  const activeShiftTypes = shiftTypes.filter((st) => st.active !== false)
  const shiftCodes = [...activeShiftTypes]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((st) => st.code)

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
      const iso = toISODate(d)
      if (!assignedByDate[iso]?.has(staffId)) break
      count++
    }
    return count
  }

  // Days-off preference: controls when staff get their off days
  const daysOffPref = labConfig.days_off_preference ?? "prefer_weekend"

  const allDates = getWeekDates(weekStart)
  const { holidayMode, holidayCount, reduceBudget, getEffectiveDayCode, isEffectiveWeekend, getEffectiveBudget } =
    buildHolidayContext(labConfig, allDates, publicHolidays)

  if (holidayMode !== "weekday" && holidayCount > 0) {
    warnings.push(`[engine] Public holiday mode: ${holidayMode} — ${holidayCount} holiday(s) this week.${reduceBudget ? ` Weekly budgets reduced by ${holidayCount}.` : ""}`)
  }

  // ── PHASE 1: Pre-plan minimum coverage for ALL 7 days ────────────────────
  // Reserve budget so minimum coverage is guaranteed before preferences kick in.
  const minCoverageReserved: Record<string, Set<string>> = {} // date → set of staff_ids

  for (const date of allDates) {
    minCoverageReserved[date] = new Set()
    const dayCode = getDayCode(date)
    const effectiveDayCode = getEffectiveDayCode(date)
    const wknd = isEffectiveWeekend(date)

    const punctionsForDay = punctionsOverride?.[date] ?? labConfig.punctions_by_day?.[effectiveDayCode] ?? 0
    const dynamicLabMin = (labConfig.staffing_ratio > 0 && punctionsForDay > 0) ? Math.ceil(punctionsForDay / labConfig.staffing_ratio) : 0
    const dayCoverage = labConfig.coverage_by_day?.[effectiveDayCode]

    // Use same coverage source as Phase 2
    let labReq: number, andReq: number, adminReq: number
    if (shiftCoverageEnabled && shiftCoverageByDay) {
      let labSum = 0, androSum = 0, adminSum = 0
      const dayShiftsP1 = activeShiftTypes
        .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(effectiveDayCode))
        .map((st) => st.code)
      for (const sc of dayShiftsP1) {
        const cov = normalizeShiftCov(shiftCoverageByDay[sc]?.[effectiveDayCode])
        labSum += cov.lab
        androSum += cov.andrology
        adminSum += cov.admin
      }
      labReq = Math.max(labSum, dynamicLabMin)
      andReq = androSum
      adminReq = adminSum
    } else {
      labReq = Math.max(dayCoverage?.lab ?? labConfig.min_lab_coverage, dynamicLabMin)
      andReq = dayCoverage?.andrology ?? labConfig.min_andrology_coverage
      adminReq = dayCoverage?.admin ?? 0
    }

    for (const [role, required] of [["lab", labReq], ["andrology", andReq], ["admin", adminReq]] as const) {
      if (required <= 0) continue
      const eligible = staff.filter((s) => {
        if (s.onboarding_status === "inactive" || s.role !== role) return false
        if (s.start_date > date || (s.end_date && s.end_date < date)) return false
        if (leaveMap[s.id]?.has(date)) return false
        if (s.working_pattern?.length && !s.working_pattern.includes(dayCode)) return false
        const reserved = Object.values(minCoverageReserved).filter((set) => set.has(s.id)).length
        return reserved < getEffectiveBudget(s)
      }).sort((a, b) => {
        const aRes = Object.values(minCoverageReserved).filter((set) => set.has(a.id)).length
        const bRes = Object.values(minCoverageReserved).filter((set) => set.has(b.id)).length
        if (aRes !== bRes) return aRes - bRes
        if (daysOffPref === "prefer_weekend" && wknd) {
          const aWkndCount = Object.entries(minCoverageReserved).filter(([d, s]) => isEffectiveWeekend(d) && s.has(a.id)).length
          const bWkndCount = Object.entries(minCoverageReserved).filter(([d, s]) => isEffectiveWeekend(d) && s.has(b.id)).length
          if (aWkndCount !== bWkndCount) return aWkndCount - bWkndCount
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
    const effectiveDayCode = getEffectiveDayCode(date)
    const weekend = isEffectiveWeekend(date)

    // Coverage requirements — use effective day code
    const punctionsForDay = punctionsOverride?.[date] ?? labConfig.punctions_by_day?.[effectiveDayCode] ?? 0
    const dynamicLabMin = (labConfig.staffing_ratio > 0 && punctionsForDay > 0) ? Math.ceil(punctionsForDay / labConfig.staffing_ratio) : 0
    const dayCoverage = labConfig.coverage_by_day?.[effectiveDayCode]

    // When shift coverage is enabled, derive department totals by summing across shifts
    let labRequired: number
    let andrologyRequired: number
    let adminRequired: number
    if (shiftCoverageEnabled && shiftCoverageByDay) {
      let labSum = 0, androSum = 0, adminSum = 0
      const dayShiftsForCov = activeShiftTypes
        .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(effectiveDayCode))
        .map((st) => st.code)
      for (const sc of dayShiftsForCov) {
        const cov = normalizeShiftCov(shiftCoverageByDay[sc]?.[effectiveDayCode])
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
      const cap = getEffectiveBudget(s)
      if (used >= cap) return false
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
      // L2.3: avoid_days is a STRONG signal (employee wants this day OFF)
      if (s.avoid_days?.includes(dayCode)) score -= 10
      // preferred_days is a weaker positive signal
      if (s.preferred_days?.includes(dayCode)) score += 2
      // Inferred preferences (weaker weight, only if no explicit set)
      if (!(s.preferred_days?.length) && !(s.avoid_days?.length)) {
        if (inferredDayPref[s.id]?.has(dayCode)) score += 1
        if (inferredDayAvoid[s.id]?.has(dayCode)) score -= 2
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
        const aCap = getEffectiveBudget(a)
        const bCap = getEffectiveBudget(b)
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
    let assignedAdmin = staff.filter((s) => assignedSet.has(s.id) && s.role === "admin")

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
          const scope = (rule.params.scope as string | undefined) ?? "same_day"
          const ruleDays = (rule.params.days as string[] | undefined) ?? []
          // Day filter: if days specified (same_shift only), skip if today isn't one
          if (ruleDays.length > 0 && !ruleDays.includes(dayCode)) {
            // Rule doesn't apply today — skip
          } else if (scope === "same_day") {
            // Same day: cannot both work on the same day
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
          // scope === "same_shift" is handled post-distribution (after shift assignment)
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
              const prevSat = addDays(date, -( getDayCode(date) === "sat" ? 7 : 8))
              const prevSun = addDays(date, -(getDayCode(date) === "sun" ? 7 : 6))
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
              const prevSat = addDays(date, -(getDayCode(date) === "sat" ? 7 : 8))
              const prevSun = addDays(date, -(getDayCode(date) === "sun" ? 7 : 6))
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
        // v2 L1 > L2: Only remove if it won't break Level 1 constraints.
        // Level 1 = budget (days_per_week) AND coverage minimums.
        const actualRemovals = new Set<string>()
        for (const id of hardRemovals) {
          const s = assigned.find((a) => a.id === id)
          if (!s) continue
          const used = weeklyShiftCount[id] ?? 0
          const cap = s.days_per_week ?? 5
          // L1.2: Don't remove if person hasn't met their budget yet
          if (used < cap) {
            warnings.push(`${date}: ${s.first_name} ${s.last_name} — regla L2 ignorada (L1 presupuesto ${used}/${cap})`)
            continue
          }
          // L1.6: Don't remove if it would break coverage minimums
          const roleCount = s.role === "lab" ? assignedLab.filter((a) => !actualRemovals.has(a.id)).length
            : s.role === "andrology" ? assignedAndrology.filter((a) => !actualRemovals.has(a.id)).length
            : assignedAdmin.filter((a) => !actualRemovals.has(a.id)).length
          const roleMin = s.role === "lab" ? labRequired : s.role === "andrology" ? andrologyRequired : adminRequired
          if (roleCount <= roleMin) {
            warnings.push(`${date}: ${s.first_name} ${s.last_name} — regla L2 ignorada (L1 cobertura ${s.role} ${roleCount}/${roleMin})`)
          } else {
            actualRemovals.add(id) // safe to remove: budget met AND above coverage minimum
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

      // Search ALL roles — techniques like CNG/SEM may belong to andro staff.
      const allAssignableStaff = [...labStaff, ...androStaff, ...adminStaff]

      // ── Scarcity ranking ──────────────────────────────────────────────────
      // For each technique required in a shift, count how many active staff
      // can cover it. A staff member's scarcity score for a shift = sum of
      // (1 / providers) for each technique they cover in that shift.
      // Higher score = more scarce = should be placed in that shift first.
      const scarcityForShift: Record<string, Record<string, number>> = {} // staffId → shiftCode → score
      const techProviderCount: Record<string, number> = {} // techCode → how many active staff have it
      for (const tec of tecnicas) {
        if (!tec.typical_shifts?.length) continue
        const providers = allAssignableStaff.filter((s) =>
          s.staff_skills.some((sk) => sk.skill === tec.codigo && sk.level === "certified")
        ).length
        techProviderCount[tec.codigo] = providers
      }
      for (const s of allAssignableStaff) {
        scarcityForShift[s.id] = {}
        for (const shiftCode of defaultShiftCodes) {
          const requiredTechs = techRequiredInShift[shiftCode]
          if (!requiredTechs) continue
          let score = 0
          for (const sk of s.staff_skills) {
            if (sk.level !== "certified") continue
            if (!requiredTechs.has(sk.skill)) continue
            const providers = techProviderCount[sk.skill] ?? 0
            if (providers > 0) score += 1 / providers
          }
          scarcityForShift[s.id][shiftCode] = score
        }
      }

      // ── Step 0: Place ONE qualified person per shift for technique coverage ──
      // For each shift with configured coverage, try to place a single person
      // who covers as many required techniques as possible. This is a hint to
      // the coverage distribution — Steps 1-3 do the real filling.
      // We must NOT over-allocate: at most 1 person per shift here.

      for (const shiftCode of defaultShiftCodes) {
        const totalMin = (shiftMinLab[shiftCode] ?? 0) + (shiftMinAndro[shiftCode] ?? 0) + (shiftMinAdmin[shiftCode] ?? 0)
        if (totalMin === 0) continue
        const requiredTechs = techRequiredInShift[shiftCode]
        if (!requiredTechs || requiredTechs.size === 0) continue

        // Check if someone already placed covers at least one required technique (certified only)
        const alreadyCovered = dayPlanAssignments.some((a) =>
          a.shift_type === shiftCode &&
          allAssignableStaff.find((s) => s.id === a.staff_id)?.staff_skills.some((sk) => requiredTechs.has(sk.skill) && sk.level === "certified")
        )
        if (alreadyCovered) continue

        // Find the best unplaced person: covers the most required techniques (certified only)
        const candidates = allAssignableStaff.filter((s) => {
          if (assignedToShift.has(s.id)) return false
          if (s.avoid_shifts?.includes(shiftCode)) return false
          return s.staff_skills.some((sk) => requiredTechs.has(sk.skill) && sk.level === "certified")
        }).sort((a, b) => {
          const aCovers = a.staff_skills.filter((sk) => requiredTechs.has(sk.skill) && sk.level === "certified").length
          const bCovers = b.staff_skills.filter((sk) => requiredTechs.has(sk.skill) && sk.level === "certified").length
          if (aCovers !== bCovers) return bCovers - aCovers
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
            // Priority 1: net scarcity — scarcity for this shift minus max scarcity elsewhere.
            // Positive = this is the best shift for this person's rare skills.
            // Negative = this person is more valuable somewhere else — save them.
            const aHere = scarcityForShift[a.id]?.[shiftCode] ?? 0
            const aMax = Math.max(...Object.values(scarcityForShift[a.id] ?? {}), 0)
            const aNet = aHere - aMax
            const bHere = scarcityForShift[b.id]?.[shiftCode] ?? 0
            const bMax = Math.max(...Object.values(scarcityForShift[b.id] ?? {}), 0)
            const bNet = bHere - bMax
            if (aNet !== bNet) return bNet - aNet
            // Priority 2: rotation preference
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

      }

      // ── Step 2: Fair share remaining embryologists across shifts ──
      // Respect avoid_shifts as hard, spread skills evenly
      // Sort by max scarcity first — staff with rare skills get placed first
      const unplacedLab = labStaff.filter((s) => !assignedToShift.has(s.id))
        .sort((a, b) => {
          const aMax = Math.max(...Object.values(scarcityForShift[a.id] ?? {}), 0)
          const bMax = Math.max(...Object.values(scarcityForShift[b.id] ?? {}), 0)
          return bMax - aMax
        })
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
          // Priority 2: scarcity — prefer the shift where this person's rare skills are most needed
          const aScar = scarcityForShift[s.id]?.[a] ?? 0
          const bScar = scarcityForShift[s.id]?.[b] ?? 0
          if (aScar !== bScar) return bScar - aScar

          // Priority 3: rotation preference (weekly/daily/stable)
          const aRot = rotationPreference(s.id, a)
          const bRot = rotationPreference(s.id, b)
          if (aRot !== bRot) return aRot - bRot
          // Priority 4: least-filled overall
          const aFill = shiftFilled[a] ?? 0
          const bFill = shiftFilled[b] ?? 0
          if (aFill !== bFill) return aFill - bFill
          // Priority 5: shift where this person adds the most NEW skills
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
      placeRoleByMin(androStaff, shiftMinAndro, shiftFilledAndro)
      placeRoleByMin(adminStaff, shiftMinAdmin, shiftFilledAdmin)

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

    // Post-distribution: no_coincidir same_shift enforcement
    // If two conflicting staff ended up in the same shift, move one to a different shift.
    const noCoincidirShiftRules = rules.filter((r) => r.enabled && r.type === "no_coincidir" && r.params.scope === "same_shift")
    for (const rule of noCoincidirShiftRules) {
      const ruleDays = (rule.params.days as string[] | undefined) ?? []
      if (ruleDays.length > 0 && !ruleDays.includes(dayCode)) continue
      const conflictIds = new Set(rule.staff_ids)
      // Group conflicting staff by shift
      const byShift: Record<string, typeof dayPlanAssignments> = {}
      for (const a of dayPlanAssignments) {
        if (!conflictIds.has(a.staff_id)) continue
        if (!byShift[a.shift_type]) byShift[a.shift_type] = []
        byShift[a.shift_type].push(a)
      }
      for (const [, shiftGroup] of Object.entries(byShift)) {
        if (shiftGroup.length <= 1) continue
        // Keep the first, move the rest to another shift
        for (let i = 1; i < shiftGroup.length; i++) {
          const toMove = shiftGroup[i]
          // Find the shift with the fewest staff (that doesn't have another conflicting member)
          const shiftCounts: Record<string, number> = {}
          for (const sc of defaultShiftCodes) shiftCounts[sc] = 0
          for (const a of dayPlanAssignments) shiftCounts[a.shift_type] = (shiftCounts[a.shift_type] ?? 0) + 1
          const conflictInShift = new Set(dayPlanAssignments.filter((a) => conflictIds.has(a.staff_id)).map((a) => a.shift_type))
          const target = defaultShiftCodes
            .filter((sc) => !conflictInShift.has(sc))
            .sort((a, b) => (shiftCounts[a] ?? 0) - (shiftCounts[b] ?? 0))[0]
          if (target) {
            toMove.shift_type = target as ShiftType
            if (!rule.is_hard) {
              warnings.push(`${date}: ${assigned.find((s) => s.id === toMove.staff_id)?.first_name ?? "?"} movido de turno — no coincidir en mismo turno`)
            }
          } else if (!rule.is_hard) {
            const name1 = assigned.find((s) => s.id === shiftGroup[0].staff_id)?.first_name ?? "?"
            const name2 = assigned.find((s) => s.id === toMove.staff_id)?.first_name ?? "?"
            warnings.push(`${date}: ${name2} coincide en turno con ${name1} (no hay turno alternativo)`)
          }
        }
      }
    }

    // ── L3.1: Fair share pass ──────────────────────────────────────────────
    // When shift coverage is enabled, staff above minimums should be distributed
    // more evenly across shifts. Move excess from overstaffed to understaffed.
    if (shiftCoverageEnabled && shiftCoverageByDay && dayPlanAssignments.length > 1) {
      const staffById = new Map(assigned.map((s) => [s.id, s]))
      // Calculate how many staff above minimum each shift has, per role
      for (const role of ["lab", "andrology", "admin"] as const) {
        const roleMinByShift: Record<string, number> = {}
        const roleCountByShift: Record<string, number> = {}
        for (const sc of defaultShiftCodes) {
          const cov = normalizeShiftCov(shiftCoverageByDay[sc]?.[dayCode])
          roleMinByShift[sc] = cov[role]
          roleCountByShift[sc] = dayPlanAssignments.filter((a) =>
            a.shift_type === sc && staffById.get(a.staff_id)?.role === role
          ).length
        }
        // Find shifts with excess and deficit (above min)
        let moved = true
        while (moved) {
          moved = false
          const overstaffed = defaultShiftCodes
            .filter((sc) => roleCountByShift[sc] - (roleMinByShift[sc] ?? 0) >= 2) // 2+ above min
            .sort((a, b) => (roleCountByShift[b] - (roleMinByShift[b] ?? 0)) - (roleCountByShift[a] - (roleMinByShift[a] ?? 0)))
          const understaffed = defaultShiftCodes
            .filter((sc) => (roleMinByShift[sc] ?? 0) > 0 && roleCountByShift[sc] <= (roleMinByShift[sc] ?? 0))
            .sort((a, b) => (roleCountByShift[a] - (roleMinByShift[a] ?? 0)) - (roleCountByShift[b] - (roleMinByShift[b] ?? 0)))
          if (overstaffed.length === 0 || understaffed.length === 0) break
          const srcShift = overstaffed[0]
          const dstShift = understaffed[0]
          // Move one person (not one with avoid_shifts for dst, not supervised)
          const supRuleStaff = new Set<string>()
          for (const rule of rules.filter((r) => r.enabled && r.type === "supervisor_requerido")) {
            for (const id of rule.staff_ids) supRuleStaff.add(id)
          }
          const movable = dayPlanAssignments.find((a) =>
            a.shift_type === srcShift &&
            staffById.get(a.staff_id)?.role === role &&
            !staffById.get(a.staff_id)?.avoid_shifts?.includes(dstShift) &&
            !supRuleStaff.has(a.staff_id)
          )
          if (movable) {
            movable.shift_type = dstShift as ShiftType
            roleCountByShift[srcShift]--
            roleCountByShift[dstShift]++
            moved = true
          }
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

      for (const techCode of techCodes) {
        // Check if at least one certified person is in this shift
        const hasCoverage = staffInShift.some((a) => {
          const member = assignedById.get(a.staff_id)
          return member?.staff_skills.some((sk) => sk.skill === techCode && sk.level === "certified")
        })
        if (hasCoverage) continue

        // Gap found — try to resolve
        // 1. Try to swap: find someone in ANOTHER shift who is qualified and swap them
        //    BUT never move someone out of a shift that would drop below its minimum
        let resolved = false
        const qualifiedInOtherShifts = dayPlan.assignments.filter((a) => {
          if (a.shift_type === shiftCode) return false
          if (!assignedById.get(a.staff_id)?.staff_skills.some((sk) => sk.skill === techCode && sk.level === "certified")) return false
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

    // Final shift coverage check — after ALL distribution and swap passes
    if (shiftCoverageEnabled && shiftCoverageByDay) {
      const finalPlan = days[days.length - 1]
      const finalByShift: Record<string, { lab: number; andrology: number; admin: number }> = {}
      for (const a of finalPlan.assignments) {
        const s = staff.find((st) => st.id === a.staff_id)
        if (!s) continue
        if (!finalByShift[a.shift_type]) finalByShift[a.shift_type] = { lab: 0, andrology: 0, admin: 0 }
        if (s.role === "lab") finalByShift[a.shift_type].lab++
        else if (s.role === "andrology") finalByShift[a.shift_type].andrology++
        else finalByShift[a.shift_type].admin++
      }
      const dayShiftsFinal = activeShiftTypes
        .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dayCode))
        .map((st) => st.code)
      for (const sc of dayShiftsFinal) {
        const req = normalizeShiftCov(shiftCoverageByDay[sc]?.[dayCode])
        const got = finalByShift[sc] ?? { lab: 0, andrology: 0, admin: 0 }
        if (got.lab < req.lab) warnings.push(`${date}: ${sc} — lab insuficiente: ${got.lab}/${req.lab}`)
        if (got.andrology < req.andrology) warnings.push(`${date}: ${sc} — andrología insuficiente: ${got.andrology}/${req.andrology}`)
        if (got.admin < req.admin) warnings.push(`${date}: ${sc} — admin insuficiente: ${got.admin}/${req.admin}`)
      }
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


  repairNoLibrarMismoDia({ days, rules, staff, leaveMap, warnings })

  reEnforceSupervisorColocation({ days, rules, activeShiftTypes, tecnicaTypicalShifts })

  if (shiftCoverageEnabled && shiftCoverageByDay) {
    repairShiftCoverage({ days, staff, activeShiftTypes, shiftCoverageByDay })
  }

  const trainingTecnicaMap = collectTrainingTecnicaMap(rules)

  const hasExplicitTaskCoverage = taskCoverageEnabled && taskCoverageByDay && Object.keys(taskCoverageByDay).length > 0
  if (hasExplicitTaskCoverage) {
    assignTasksToShifts({
      days,
      staff,
      rules,
      labConfig,
      tecnicas,
      shiftTypes,
      taskCoverageByDay: taskCoverageByDay!,
      leaveMap,
      weeklyShiftCount,
      workloadScore,
      trainingTecnicaMap,
      taskAssignments,
      warnings,
    })
  }

  enforceFinalBudget({
    days,
    staff,
    warnings,
    activeShiftTypes,
    shiftCodes,
    leaveMap,
    getEffectiveBudget,
  })

  return { days, taskAssignments, warnings }
}
