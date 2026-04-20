import type { StaffWithSkills, LabConfig } from "@/lib/types/database"
import { getDayCode, isWeekend } from "@/lib/engine-helpers"

export interface MinCoverageParams {
  staff: StaffWithSkills[]
  allWeekDates: string[]
  labConfig: LabConfig
  leaveMap: Record<string, Set<string>>
  workloadScore: Record<string, number>
  daysOffPref: LabConfig["days_off_preference"]
}

/**
 * Pre-plan minimum department coverage across all 7 days (Phase 1).
 * Reserves one day of each eligible staff member's weekly budget so every day
 * meets its department minimums before tasks are distributed.
 */
export function reserveMinCoverage({
  staff,
  allWeekDates,
  labConfig,
  leaveMap,
  workloadScore,
  daysOffPref,
}: MinCoverageParams): Record<string, Set<string>> {
  const minCoverageReserved: Record<string, Set<string>> = {}
  // Incremental counters — avoid re-walking every day's set on every sort
  // comparison (O(N²) per role-day).
  const reservedCount: Record<string, number> = {}
  const reservedWeekendCount: Record<string, number> = {}

  for (const date of allWeekDates) {
    minCoverageReserved[date] = new Set()
    const dayCode = getDayCode(date)
    const wknd = isWeekend(date)
    const dayCoverage = labConfig.coverage_by_day?.[dayCode]

    for (const role of ["lab", "andrology", "admin"] as const) {
      const required =
        dayCoverage?.[role] ??
        (role === "lab"
          ? labConfig.min_lab_coverage
          : role === "andrology"
          ? labConfig.min_andrology_coverage
          : 0)
      if (required <= 0) continue

      const eligible = staff
        .filter((s) => {
          if (s.onboarding_status === "inactive" || s.role !== role) return false
          if (s.start_date > date || (s.end_date && s.end_date < date)) return false
          if (leaveMap[s.id]?.has(date)) return false
          return (reservedCount[s.id] ?? 0) < (s.days_per_week ?? 5)
        })
        .sort((a, b) => {
          const aRes = reservedCount[a.id] ?? 0
          const bRes = reservedCount[b.id] ?? 0
          if (aRes !== bRes) return aRes - bRes
          const aInPattern = !a.working_pattern?.length || a.working_pattern.includes(dayCode) ? 0 : 1
          const bInPattern = !b.working_pattern?.length || b.working_pattern.includes(dayCode) ? 0 : 1
          if (aInPattern !== bInPattern) return aInPattern - bInPattern
          if (daysOffPref === "prefer_weekend" && wknd) {
            const aWknd = reservedWeekendCount[a.id] ?? 0
            const bWknd = reservedWeekendCount[b.id] ?? 0
            if (aWknd !== bWknd) return aWknd - bWknd
          }
          return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
        })

      for (let i = 0; i < Math.min(required, eligible.length); i++) {
        const id = eligible[i].id
        minCoverageReserved[date].add(id)
        reservedCount[id] = (reservedCount[id] ?? 0) + 1
        if (wknd) reservedWeekendCount[id] = (reservedWeekendCount[id] ?? 0) + 1
      }
    }
  }

  return minCoverageReserved
}
