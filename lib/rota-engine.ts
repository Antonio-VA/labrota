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
  shiftRotation?: "stable" | "weekly" | "daily"
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
  shiftRotation = "stable",
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
        const aInPattern = (a.working_pattern ?? []).includes(dayCode) ? 0 : 1
        const bInPattern = (b.working_pattern ?? []).includes(dayCode) ? 0 : 1
        if (aInPattern !== bInPattern) return aInPattern - bInPattern
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

    // Additional staff: must have budget after accounting for future reservations
    const remaining = staff.filter((s) =>
      isAvailable(s) && !reservedIds.has(s.id) && hasBudget(s)
    ).sort((a, b) => {
      const aInPattern = (a.working_pattern ?? []).includes(dayCode) ? 0 : 1
      const bInPattern = (b.working_pattern ?? []).includes(dayCode) ? 0 : 1
      if (aInPattern !== bInPattern) return aInPattern - bInPattern
      const aPref = a.preferred_days?.includes(dayCode) ? 0 : 1
      const bPref = b.preferred_days?.includes(dayCode) ? 0 : 1
      if (aPref !== bPref) return aPref - bPref
      return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
    })

    const assignedSet = new Set(reservedStaff.map((s) => s.id))
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

    // Distribute staff across shifts — same logic for all roles:
    // 1. Technique typical_shift  2. Preferred shift  3. Rotation fallback
    const dayIndex = allDates.indexOf(date)
    let dayRrIdx = 0
    days.push({
      date,
      assignments: assigned.map((s) => {
        let shift: ShiftType

        // 1. Technique typical_shift — highest priority
        const certifiedCodes = s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill)
        const trainingCodes  = s.staff_skills.filter((sk) => sk.level === "training").map((sk) => sk.skill)
        const orderedCodes   = [...certifiedCodes, ...trainingCodes]
        let preferredFromTecnica: string | null = null
        for (const code of orderedCodes) {
          const typical = tecnicaTypicalShifts[code]
          if (typical && typical.size > 0) {
            const match = defaultShiftCodes.find((sc) => typical.has(sc))
            if (match) { preferredFromTecnica = match; break }
          }
        }

        if (preferredFromTecnica) {
          shift = preferredFromTecnica as ShiftType
        } else if (s.preferred_shift && dayShiftSet.has(s.preferred_shift)) {
          // 2. Staff preferred shift
          shift = s.preferred_shift as ShiftType
        } else {
          // 3. Rotation fallback — lowest priority
          const rotation = shiftRotation ?? "stable"
          if (rotation === "stable") {
            // Check last week's assignment for this person
            const lastShift = recentAssignments
              .filter((a) => a.staff_id === s.id)
              .sort((a, b) => b.date.localeCompare(a.date))[0]?.shift_type
            if (lastShift && dayShiftSet.has(lastShift)) {
              shift = lastShift as ShiftType
            } else {
              shift = defaultShiftCodes[dayRrIdx % defaultShiftCodes.length] as ShiftType
              dayRrIdx++
            }
          } else if (rotation === "weekly") {
            // Same shift all week, rotate from last week
            const lastShift = recentAssignments
              .filter((a) => a.staff_id === s.id)
              .sort((a, b) => b.date.localeCompare(a.date))[0]?.shift_type
            const lastIdx = lastShift ? defaultShiftCodes.indexOf(lastShift) : -1
            const nextIdx = (lastIdx + 1) % defaultShiftCodes.length
            shift = defaultShiftCodes[nextIdx] as ShiftType
          } else {
            // Daily rotation: cycle through shifts by day index
            // Each person gets a stable offset so they start at different shifts
            const staffIdx = staff.indexOf(s)
            const shiftIdx = (staffIdx + dayIndex) % defaultShiftCodes.length
            shift = defaultShiftCodes[shiftIdx] as ShiftType
          }
        }
        return { staff_id: s.id, shift_type: shift }
      }),
      skillGaps,
    })

    // Post-distribution: balance shifts — move excess from overstaffed to empty shifts
    const dayPlan = days[days.length - 1]
    if (defaultShiftCodes.length > 1 && dayPlan.assignments.length > 0) {
      const shiftCount: Record<string, number> = {}
      for (const sc of defaultShiftCodes) shiftCount[sc] = 0
      for (const a of dayPlan.assignments) shiftCount[a.shift_type] = (shiftCount[a.shift_type] ?? 0) + 1

      const emptyShifts = defaultShiftCodes.filter((sc) => (shiftCount[sc] ?? 0) === 0)
      for (const emptyShift of emptyShifts) {
        // Find the most overstaffed shift
        const maxShift = defaultShiftCodes.reduce((best, sc) =>
          (shiftCount[sc] ?? 0) > (shiftCount[best] ?? 0) ? sc : best
        )
        if ((shiftCount[maxShift] ?? 0) <= 1) break // can't move if only 1 person

        // Move the last person from maxShift to emptyShift
        // (prefer moving someone without a technique-driven shift preference)
        const candidates = dayPlan.assignments.filter((a) => a.shift_type === maxShift)
        const movable = candidates.find((a) => {
          const s = assigned.find((st) => st.id === a.staff_id)
          if (!s) return true
          // Don't move if their technique specifically maps to this shift
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

    // ── Technique-shift alignment pass (by_shift only) ──────────────────────
    // Check each technique's typical_shift for coverage. If a shift is missing
    // a qualified person for a mapped technique, try to reassign or add one.
    const assignedById = new Map(assigned.map((s) => [s.id, s]))

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

          const best = scored[0]
          // Only swap if the person doesn't have a preferred_shift or manual preference for their current shift
          const member = assignedById.get(best.a.staff_id)
          if (member && member.preferred_shift !== best.a.shift_type) {
            best.a.shift_type = shiftCode as ShiftType
            resolved = true
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

  return { days, warnings }
}
