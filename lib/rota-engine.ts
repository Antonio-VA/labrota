/**
 * LabRota scheduling engine.
 * Pure function — no DB calls, fully testable.
 *
 * Algorithm per day:
 *  1. Determine eligible staff (active, in employment window, works that weekday, not on leave)
 *  2. Score by recent shift count (fewer = higher priority = fairer rotation)
 *  3. Assign required minimums per role (lab, andrology, admin)
 *  4. Compute skill gaps (skills present in org but uncovered by assigned staff)
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
}: EngineParams): RotaEngineResult {
  const days: DayPlan[] = []
  const warnings: string[] = []

  // Pre-compute workload scores (recent shift count per staff)
  const workloadScore: Record<string, number> = {}
  for (const a of recentAssignments) {
    workloadScore[a.staff_id] = (workloadScore[a.staff_id] ?? 0) + 1
  }

  // Pre-compute leave set: staff_id -> set of dates on leave
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

  // All skills present in this org
  const allOrgSkills = new Set(staff.flatMap((s) => s.staff_skills.map((sk) => sk.skill)))

  for (const date of getWeekDates(weekStart)) {
    const dayCode = getDayCode(date)
    const weekend = isWeekend(date)

    // 1. Eligible staff for this day
    const eligible = staff.filter((s) => {
      if (s.onboarding_status === "inactive") return false
      if (s.start_date > date) return false
      if (s.end_date && s.end_date < date) return false
      if (!s.working_pattern.includes(dayCode)) return false
      if (leaveMap[s.id]?.has(date)) return false
      return true
    })

    // 2. Sort by workload score ascending (fewest shifts = higher priority)
    const sorted = [...eligible].sort(
      (a, b) => (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
    )

    // 3. Required coverage per role
    const labRequired = labConfig.min_lab_coverage
    const andrologyRequired = weekend
      ? labConfig.min_weekend_andrology
      : labConfig.min_andrology_coverage
    const includeAdmin = !weekend || labConfig.admin_on_weekends

    const labPool       = sorted.filter((s) => s.role === "lab")
    const andrologyPool = sorted.filter((s) => s.role === "andrology")
    const adminPool     = sorted.filter((s) => s.role === "admin")

    const assigned = [
      ...labPool.slice(0, labRequired),
      ...andrologyPool.slice(0, andrologyRequired),
      ...(includeAdmin ? adminPool.slice(0, 1) : []),
    ]

    // 4. Skill gaps
    const coveredSkills = new Set(assigned.flatMap((s) => s.staff_skills.map((sk) => sk.skill)))
    const skillGaps = [...allOrgSkills].filter((skill) => !coveredSkills.has(skill)) as SkillName[]

    // 5. Warnings
    if (labPool.length < labRequired) {
      warnings.push(`${date}: only ${labPool.length} lab staff available (need ${labRequired})`)
    }
    if (andrologyPool.length < andrologyRequired) {
      warnings.push(
        `${date}: only ${andrologyPool.length} andrology staff available (need ${andrologyRequired})`
      )
    }
    if (skillGaps.length > 0) {
      warnings.push(`${date}: skill gaps — ${skillGaps.join(", ")}`)
    }

    days.push({
      date,
      assignments: assigned.map((s) => ({ staff_id: s.id, shift_type: "full" as ShiftType })),
      skillGaps,
    })

    // Update workload scores so later days in the week account for earlier ones
    for (const s of assigned) {
      workloadScore[s.id] = (workloadScore[s.id] ?? 0) + 1
    }
  }

  return { days, warnings }
}
