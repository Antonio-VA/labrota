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

export interface RotaEngineResult {
  days: DayPlan[]
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
  tecnicas?: { codigo: string; typical_shifts: string[] }[]  // for shift preference
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
}: EngineParams): RotaEngineResult {
  const days: DayPlan[] = []
  const warnings: string[] = []

  // Historical workload scores (recent shift count per staff for fairness sorting)
  const workloadScore: Record<string, number> = {}
  for (const a of recentAssignments) {
    workloadScore[a.staff_id] = (workloadScore[a.staff_id] ?? 0) + 1
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

  // Técnica → typical shifts lookup (for soft shift preference)
  const tecnicaTypicalShifts: Record<string, Set<string>> = {}
  for (const t of tecnicas) {
    if (t.typical_shifts.length > 0) {
      tecnicaTypicalShifts[t.codigo] = new Set(t.typical_shifts)
    }
  }

  // ── Weekend reservation ──────────────────────────────────────────────────
  // Pre-compute how many weekend days each staff member is reserved for.
  // If Sat/Sun coverage requires more staff than have those days in their
  // working pattern, we draft extra staff (lowest workload) and reduce their
  // effective weekly budget so weekdays don't exhaust them before the weekend.
  const weekendReservation: Record<string, number> = {}
  for (const wkd of ["sat", "sun"] as const) {
    const wkDate = allWeekDates.find((d) => getDayCode(d) === wkd)
    if (!wkDate) continue
    const dayCov = labConfig.coverage_by_day?.[wkd]
    if (!dayCov) continue

    for (const role of ["lab", "andrology", "admin"] as const) {
      const required = dayCov[role] ?? 0
      if (required === 0) continue

      // Staff who naturally work this weekend day and have budget
      const natural = staff.filter((s) => {
        if (s.onboarding_status === "inactive") return false
        if (s.role !== role) return false
        if (s.start_date > wkDate) return false
        if (s.end_date && s.end_date < wkDate) return false
        if (leaveMap[s.id]?.has(wkDate)) return false
        if (!(s.working_pattern ?? []).includes(wkd)) return false
        return true
      })

      const deficit = required - natural.length
      if (deficit <= 0) continue

      // Draft extra staff for this weekend day (those not in pattern but base-eligible)
      const extras = staff
        .filter((s) => {
          if (s.onboarding_status === "inactive") return false
          if (s.role !== role) return false
          if (s.start_date > wkDate) return false
          if (s.end_date && s.end_date < wkDate) return false
          if (leaveMap[s.id]?.has(wkDate)) return false
          if ((s.working_pattern ?? []).includes(wkd)) return false // already natural
          return true
        })
        .sort((a, b) => (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0))

      for (let i = 0; i < Math.min(deficit, extras.length); i++) {
        weekendReservation[extras[i].id] = (weekendReservation[extras[i].id] ?? 0) + 1
      }
    }
  }

  // Canonical skills tracked for gap detection — only these five matter for rota coverage.
  // Intentionally excludes legacy/non-procedure skills (witnessing, iui, etc.).
  const CANONICAL_SKILLS = new Set<SkillName>([
    "biopsy", "icsi", "egg_collection", "embryo_transfer", "denudation",
  ])
  // Intersect with what this org's staff actually have (no point warning about unused skills)
  const allOrgSkills = new Set(
    staff.flatMap((s) => s.staff_skills.map((sk) => sk.skill))
         .filter((sk) => CANONICAL_SKILLS.has(sk))
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

  for (const date of getWeekDates(weekStart)) {
    const dayCode = getDayCode(date)
    const weekend = isWeekend(date)

    // 1. Compute coverage requirements for this day
    const punctionsForDay = punctionsOverride?.[date]
      ?? labConfig.punctions_by_day?.[dayCode]
      ?? 0
    const dynamicLabMin = (labConfig.staffing_ratio > 0 && punctionsForDay > 0)
      ? Math.ceil(punctionsForDay / labConfig.staffing_ratio)
      : 0
    const dayCoverage       = labConfig.coverage_by_day?.[dayCode]
    const staticLabMin      = dayCoverage?.lab ?? (weekend
      ? (labConfig.min_weekend_lab_coverage ?? labConfig.min_lab_coverage)
      : labConfig.min_lab_coverage)
    const labRequired       = Math.max(staticLabMin, dynamicLabMin)
    const andrologyRequired = dayCoverage?.andrology ?? (weekend
      ? labConfig.min_weekend_andrology
      : labConfig.min_andrology_coverage)
    const adminRequired     = dayCoverage?.admin ?? ((!weekend || labConfig.admin_on_weekends) ? 1 : 0)

    // 2. Build candidate pools — base eligibility (active, in range, not on leave, has budget)
    //    Working pattern is a PREFERENCE, not a hard filter. Staff whose pattern
    //    includes this day are "preferred"; others are "extra" and used to fill
    //    minimum coverage gaps.
    function isBaseEligible(s: StaffWithSkills): boolean {
      if (s.onboarding_status === "inactive") return false
      if (s.start_date > date) return false
      if (s.end_date && s.end_date < date) return false
      if (leaveMap[s.id]?.has(date)) return false
      const totalBudget = Math.max(0, (s.days_per_week ?? 5) - (leaveThisWeek[s.id] ?? 0))
      const used = weeklyShiftCount[s.id] ?? 0
      // On weekdays, reserve budget slots for weekend drafts so staff aren't
      // exhausted before Sat/Sun. On weekends, use full remaining budget.
      const reserved = weekend ? 0 : (weekendReservation[s.id] ?? 0)
      if (used >= totalBudget - reserved) return false
      return true
    }

    const preferred = staff.filter((s) => isBaseEligible(s) && (s.working_pattern ?? []).includes(dayCode))
    const extra     = staff.filter((s) => isBaseEligible(s) && !(s.working_pattern ?? []).includes(dayCode))

    // Sort both pools: preferred_days first, then lowest workload
    function sortByFairness(arr: StaffWithSkills[]): StaffWithSkills[] {
      return [...arr].sort((a, b) => {
        const aPref = a.preferred_days?.length ? (a.preferred_days.includes(dayCode) ? 0 : 1) : 0
        const bPref = b.preferred_days?.length ? (b.preferred_days.includes(dayCode) ? 0 : 1) : 0
        if (aPref !== bPref) return aPref - bPref
        return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
      })
    }

    const sortedPreferred = sortByFairness(preferred)
    const sortedExtra     = sortByFairness(extra)

    // 3. Role pools from preferred staff (these normally work this day)
    let labPool       = sortedPreferred.filter((s) => s.role === "lab")
    let andrologyPool = sortedPreferred.filter((s) => s.role === "andrology")
    let adminPool     = sortedPreferred.filter((s) => s.role === "admin")

    // 4. If preferred pool is below minimum coverage, pull in extra staff
    if (labPool.length < labRequired) {
      const extraLab = sortedExtra.filter((s) => s.role === "lab")
      labPool = [...labPool, ...extraLab.slice(0, labRequired - labPool.length)]
    }
    if (andrologyPool.length < andrologyRequired) {
      const extraAndrology = sortedExtra.filter((s) => s.role === "andrology")
      andrologyPool = [...andrologyPool, ...extraAndrology.slice(0, andrologyRequired - andrologyPool.length)]
    }
    if (adminPool.length < adminRequired) {
      const extraAdmin = sortedExtra.filter((s) => s.role === "admin")
      adminPool = [...adminPool, ...extraAdmin.slice(0, adminRequired - adminPool.length)]
    }

    // 5. Assign all preferred + needed extras; admin all-or-none based on requirement
    let assignedLab       = labPool
    let assignedAndrology = andrologyPool
    let assignedAdmin     = adminRequired > 0 ? adminPool : []

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
          const skill = ((rule.params.skill as string | undefined) ?? "egg_collection") as SkillName
          const trainees = assigned.filter(
            (s) => affects(s.id) && s.staff_skills.some((sk) => sk.skill === skill && sk.level === "training")
          )
          const supervisors = assigned.filter((s) =>
            s.staff_skills.some((sk) => sk.skill === skill && sk.level === "certified")
          )
          if (trainees.length > 0 && supervisors.length === 0) {
            if (rule.is_hard) for (const t of trainees) hardRemovals.add(t.id)
            else warnings.push(`${date}: trainees present for ${skill} without a certified supervisor`)
          }
        }
        // no_turno_doble: each person is assigned at most once per day already
      }

      if (hardRemovals.size > 0) {
        assignedLab       = assignedLab.filter((s) => !hardRemovals.has(s.id))
        assignedAndrology = assignedAndrology.filter((s) => !hardRemovals.has(s.id))
        assignedAdmin     = assignedAdmin.filter((s) => !hardRemovals.has(s.id))
        assigned          = [...assignedLab, ...assignedAndrology, ...assignedAdmin]
      }
    }

    // 7. Warnings for coverage shortfalls + debug info
    if (assigned.length < labRequired + andrologyRequired + adminRequired) {
      const prefCount = preferred.length
      const extraCount = extra.length
      warnings.push(
        `${date} (${dayCode}): assigned ${assignedLab.length}L+${assignedAndrology.length}A+${assignedAdmin.length}Ad = ${assigned.length} ` +
        `(need ${labRequired}L+${andrologyRequired}A+${adminRequired}Ad) | ` +
        `preferred=${prefCount} extra=${extraCount} | ` +
        `coverage_by_day.${dayCode}=${JSON.stringify(dayCoverage ?? "null")}`
      )
    }
    if (labPool.length < labRequired) {
      warnings.push(`${date}: only ${labPool.length} lab staff available (need ${labRequired})`)
    }
    if (andrologyPool.length < andrologyRequired) {
      warnings.push(
        `${date}: only ${andrologyPool.length} andrology staff available (need ${andrologyRequired})`
      )
    }

    // 9. Skill gaps
    const coveredSkills = new Set(assigned.flatMap((s) => s.staff_skills.map((sk) => sk.skill)))
    const skillGaps = [...allOrgSkills].filter((skill) => !coveredSkills.has(skill)) as SkillName[]
    if (skillGaps.length > 0) {
      warnings.push(`${date}: skill gaps — ${skillGaps.join(", ")}`)
    }

    const adminDefaultShift: ShiftType = labConfig.admin_default_shift ?? (shiftCodes[0] ?? "T1")
    const defaultShiftCodes = shiftCodes.length > 0 ? shiftCodes : ["T1"]

    // Distribute staff across shifts — round-robin resets each day so every
    // shift gets roughly equal coverage within a single day.
    let dayRrIdx = 0
    days.push({
      date,
      assignments: assigned.map((s) => {
        let shift: ShiftType
        if (s.preferred_shift && activeShiftSet.has(s.preferred_shift)) {
          // Only honour preference if the shift is active
          shift = s.preferred_shift as ShiftType
        } else if (s.role === "admin") {
          shift = activeShiftSet.has(adminDefaultShift) ? adminDefaultShift : (defaultShiftCodes[0] ?? "T1")
        } else {
          // Check if staff has a primary técnica with typical_shifts preference
          const staffSkillCodes = s.staff_skills.map((sk) => sk.skill)
          let preferredFromTecnica: string | null = null
          for (const code of staffSkillCodes) {
            const typical = tecnicaTypicalShifts[code]
            if (typical && typical.size > 0) {
              // Only match active shifts
              const match = defaultShiftCodes.find((sc) => typical.has(sc))
              if (match) { preferredFromTecnica = match; break }
            }
          }
          if (preferredFromTecnica) {
            shift = preferredFromTecnica as ShiftType
          } else {
            shift = defaultShiftCodes[dayRrIdx % defaultShiftCodes.length] as ShiftType
            dayRrIdx++
          }
        }
        return { staff_id: s.id, shift_type: shift }
      }),
      skillGaps,
    })

    // Update scores so later days in the week account for earlier assignments
    for (const s of assigned) {
      workloadScore[s.id]    = (workloadScore[s.id]    ?? 0) + 1
      weeklyShiftCount[s.id] = (weeklyShiftCount[s.id] ?? 0) + 1
    }
  }

  return { days, warnings }
}
