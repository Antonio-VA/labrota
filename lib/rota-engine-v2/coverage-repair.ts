import type { StaffWithSkills, ShiftType, ShiftTypeDefinition, ShiftCoverageByDay } from "@/lib/types/database"
import type { DayPlan } from "./types"

interface CoverageRepairParams {
  days: DayPlan[]
  staff: StaffWithSkills[]
  activeShiftTypes: ShiftTypeDefinition[]
  shiftCoverageByDay: ShiftCoverageByDay
}

const DAY_CODES = ["sun","mon","tue","wed","thu","fri","sat"] as const

// Coverage minimums are hard constraints. Post-distribution passes (supervisor
// co-location, technique alignment, Phase 3) can break them. This final pass
// verifies each shift×role meets its minimum and force-moves surplus staff.
export function repairShiftCoverage({
  days,
  staff,
  activeShiftTypes,
  shiftCoverageByDay,
}: CoverageRepairParams): void {
  const staffById = new Map(staff.map((s) => [s.id, s]))
  for (const dayPlan of days) {
    const dc = DAY_CODES[new Date(dayPlan.date + "T12:00:00").getDay()] as string
    const dayShiftCodes = activeShiftTypes
      .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dc))
      .map((st) => st.code)
    for (const role of ["lab", "andrology", "admin"] as const) {
      for (const shiftCode of dayShiftCodes) {
        const cov = shiftCoverageByDay[shiftCode]?.[dc]
        const covEntry = cov == null ? { lab: 0, andrology: 0, admin: 0 }
          : typeof cov === "number" ? { lab: cov, andrology: 0, admin: 0 } : cov as { lab: number; andrology: number; admin: number }
        const min = covEntry[role] ?? 0
        if (min === 0) continue
        const inShift = dayPlan.assignments.filter((a) => a.shift_type === shiftCode && staffById.get(a.staff_id)?.role === role)
        let deficit = min - inShift.length
        if (deficit <= 0) continue
        for (const srcShift of dayShiftCodes) {
          if (srcShift === shiftCode || deficit <= 0) continue
          const srcCov = shiftCoverageByDay[srcShift]?.[dc]
          const srcEntry = srcCov == null ? { lab: 0, andrology: 0, admin: 0 }
            : typeof srcCov === "number" ? { lab: srcCov, andrology: 0, admin: 0 } : srcCov as { lab: number; andrology: number; admin: number }
          const srcMin = srcEntry[role] ?? 0
          const srcInShift = dayPlan.assignments.filter((a) => a.shift_type === srcShift && staffById.get(a.staff_id)?.role === role)
          const surplus = srcInShift.length - srcMin
          if (surplus <= 0) continue
          const toMove = Math.min(deficit, surplus)
          let moved = 0
          for (const a of srcInShift) {
            if (moved >= toMove) break
            a.shift_type = shiftCode as ShiftType
            moved++
          }
          deficit -= moved
        }
      }
    }
  }
}
