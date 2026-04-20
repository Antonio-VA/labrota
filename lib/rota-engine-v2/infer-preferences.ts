import type { RotaAssignment, StaffWithSkills } from "@/lib/types/database"

export interface InferredPreferences {
  inferredShiftPref: Record<string, string>
  inferredDayPref: Record<string, Set<string>>
  inferredDayAvoid: Record<string, Set<string>>
}

// Scan recent assignments for implicit patterns; only fill in when no explicit
// preference is set. Thresholds: shift ≥70%, preferred day ≥60%, avoid day ≤15%
// (and at least 3 weeks of history).
export function inferPreferences(
  recentAssignments: RotaAssignment[],
  staff: StaffWithSkills[],
): InferredPreferences {
  const inferredShiftPref: Record<string, string> = {}
  const inferredDayPref: Record<string, Set<string>> = {}
  const inferredDayAvoid: Record<string, Set<string>> = {}

  if (recentAssignments.length === 0) {
    return { inferredShiftPref, inferredDayPref, inferredDayAvoid }
  }

  const byStaff: Record<string, RotaAssignment[]> = {}
  for (const a of recentAssignments) {
    if (!byStaff[a.staff_id]) byStaff[a.staff_id] = []
    byStaff[a.staff_id].push(a)
  }

  for (const [staffId, assignments] of Object.entries(byStaff)) {
    const person = staff.find((s) => s.id === staffId)
    if (!person) continue
    const totalAssignments = assignments.length

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

    if (!(person.preferred_days?.length) && !(person.avoid_days?.length)) {
      const totalWeeks = Math.max(1, Math.ceil(totalAssignments / 5))
      const dayCounts: Record<string, number> = {}
      for (const a of assignments) {
        const dow = new Date(a.date + "T12:00:00").getDay()
        const dayCode = (["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const)[dow]
        dayCounts[dayCode] = (dayCounts[dayCode] ?? 0) + 1
      }
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

  return { inferredShiftPref, inferredDayPref, inferredDayAvoid }
}
