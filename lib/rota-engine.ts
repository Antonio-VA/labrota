/**
 * LabRota scheduling engine.
 * Pure function — no DB calls, fully testable.
 *
 * Algorithm per day:
 *  1. Determine eligible staff (active, in employment window, works that weekday,
 *     not on leave, has weekly shift budget remaining)
 *  2. Sort by historical workload score (fewer recent shifts = higher priority)
 *  3. Assign ALL eligible lab + andrology staff; max 1 admin
 *  4. Compute minimum coverage requirements (dynamic from punctions/embryologist ratio)
 *  5. Auto-designate OPU (most senior lab/andrology staff with egg_collection skill)
 *  6. Compute skill gaps
 */

import type {
  StaffWithSkills,
  Leave,
  RotaAssignment,
  LabConfig,
  ShiftType,
  SkillName,
  WorkingDay,
} from "@/lib/types/database"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DayPlan {
  date: string
  assignments: { staff_id: string; shift_type: ShiftType; is_opu: boolean }[]
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
  punctionsOverride?: Record<string, number>  // per-date overrides from rota record
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
  punctionsOverride,
}: EngineParams): RotaEngineResult {
  const days: DayPlan[] = []
  const warnings: string[] = []

  // Historical workload scores (recent shift count per staff for fairness sorting)
  const workloadScore: Record<string, number> = {}
  for (const a of recentAssignments) {
    workloadScore[a.staff_id] = (workloadScore[a.staff_id] ?? 0) + 1
  }

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

  // All skills present in this org (for gap detection)
  const allOrgSkills = new Set(staff.flatMap((s) => s.staff_skills.map((sk) => sk.skill)))

  for (const date of getWeekDates(weekStart)) {
    const dayCode = getDayCode(date)
    const weekend = isWeekend(date)

    // 1. Eligible staff: active, in employment window, works this weekday,
    //    not on leave, and still has weekly shift budget
    const eligible = staff.filter((s) => {
      if (s.onboarding_status === "inactive") return false
      if (s.start_date > date) return false
      if (s.end_date && s.end_date < date) return false
      if (!(s.working_pattern ?? []).includes(dayCode)) return false
      if (leaveMap[s.id]?.has(date)) return false
      if ((weeklyShiftCount[s.id] ?? 0) >= (s.days_per_week ?? 5)) return false
      return true
    })

    // 2. Sort by historical workload ascending (fewer past shifts = higher priority)
    const sorted = [...eligible].sort(
      (a, b) => (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
    )

    // 3. Role pools (all eligible staff in each role, sorted by workload)
    const labPool       = sorted.filter((s) => s.role === "lab")
    const andrologyPool = sorted.filter((s) => s.role === "andrology")
    const adminPool     = sorted.filter((s) => s.role === "admin")

    // 4. Compute minimum coverage requirements
    //    Lab minimum = max(static minimum, ceil(daily_punctions / punctions_per_embryologist))
    const punctionsForDay = punctionsOverride?.[date]
      ?? labConfig.punctions_by_day?.[dayCode]
      ?? 0
    const dynamicLabMin = (labConfig.staffing_ratio > 0 && punctionsForDay > 0)
      ? Math.ceil(punctionsForDay / labConfig.staffing_ratio)
      : 0
    const labRequired       = Math.max(labConfig.min_lab_coverage, dynamicLabMin)
    const andrologyRequired = weekend
      ? labConfig.min_weekend_andrology
      : labConfig.min_andrology_coverage
    const includeAdmin = !weekend || labConfig.admin_on_weekends

    // 5. Assign ALL eligible lab + andrology (budget-limited); max 1 admin
    const assignedLab       = labPool
    const assignedAndrology = andrologyPool
    const assignedAdmin     = includeAdmin ? adminPool.slice(0, 1) : []

    const assigned = [...assignedLab, ...assignedAndrology, ...assignedAdmin]

    // 6. OPU designation: most senior (earliest start_date) lab/andrology staff
    //    with egg_collection skill among those assigned today
    let opuStaffId: string | null = null
    const opuCandidates = [...assignedLab, ...assignedAndrology].filter(
      (s) => s.staff_skills.some((sk) => sk.skill === "egg_collection")
    )
    if (opuCandidates.length > 0) {
      opuCandidates.sort((a, b) => a.start_date.localeCompare(b.start_date))
      opuStaffId = opuCandidates[0].id
    }

    // 7. Warnings for coverage shortfalls
    if (labPool.length < labRequired) {
      warnings.push(`${date}: only ${labPool.length} lab staff available (need ${labRequired})`)
    }
    if (andrologyPool.length < andrologyRequired) {
      warnings.push(
        `${date}: only ${andrologyPool.length} andrology staff available (need ${andrologyRequired})`
      )
    }

    // 8. Skill gaps
    const coveredSkills = new Set(assigned.flatMap((s) => s.staff_skills.map((sk) => sk.skill)))
    const skillGaps = [...allOrgSkills].filter((skill) => !coveredSkills.has(skill)) as SkillName[]
    if (skillGaps.length > 0) {
      warnings.push(`${date}: skill gaps — ${skillGaps.join(", ")}`)
    }

    const adminDefaultShift: ShiftType = labConfig.admin_default_shift ?? "full"

    days.push({
      date,
      assignments: assigned.map((s) => ({
        staff_id:   s.id,
        shift_type: (s.preferred_shift ?? (s.role === "admin" ? adminDefaultShift : "full")) as ShiftType,
        is_opu:     s.id === opuStaffId,
      })),
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
