import type { Leave } from "@/lib/types/database"
import { toISODate } from "@/lib/format-date"

export interface LeaveLookup {
  leaveMap: Record<string, Set<string>>
  // Per-staff count of leave days that fall within allWeekDates.
  // Used to discount their shift budget so weeks with leave aren't flagged
  // as under-scheduled.
  leaveThisWeek: Record<string, number>
}

export function buildLeaveMap(leaves: Leave[], allWeekDates: string[]): LeaveLookup {
  const leaveMap: Record<string, Set<string>> = {}
  for (const leave of leaves) {
    const s = new Date(leave.start_date + "T12:00:00")
    const e = new Date(leave.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = toISODate(d)
      if (!leaveMap[leave.staff_id]) leaveMap[leave.staff_id] = new Set()
      leaveMap[leave.staff_id].add(iso)
    }
  }

  const leaveThisWeek: Record<string, number> = {}
  for (const staffId in leaveMap) {
    leaveThisWeek[staffId] = allWeekDates.filter((d) => leaveMap[staffId].has(d)).length
  }

  return { leaveMap, leaveThisWeek }
}
