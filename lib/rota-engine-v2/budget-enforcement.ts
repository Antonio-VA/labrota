import type { StaffWithSkills, ShiftType, ShiftTypeDefinition } from "@/lib/types/database"
import { getDayCode } from "@/lib/engine-helpers"
import type { DayPlan } from "./types"

interface BudgetEnforcementParams {
  days: DayPlan[]
  staff: StaffWithSkills[]
  warnings: string[]
  activeShiftTypes: ShiftTypeDefinition[]
  shiftCodes: string[]
  leaveMap: Record<string, Set<string>>
  getEffectiveBudget: (s: StaffWithSkills) => number
}

// Hard guarantee: every active staff member must have exactly their effective
// budget shifts. Recount from actual dayPlan.assignments (not weeklyShiftCount,
// which can drift after Phase 3 swaps).
export function enforceFinalBudget({
  days,
  staff,
  warnings,
  activeShiftTypes,
  shiftCodes,
  leaveMap,
  getEffectiveBudget,
}: BudgetEnforcementParams): void {
  const finalCount: Record<string, number> = {}
  for (const dayPlan of days) {
    for (const a of dayPlan.assignments) {
      finalCount[a.staff_id] = (finalCount[a.staff_id] ?? 0) + 1
    }
  }

  for (const s of staff) {
    if (s.onboarding_status === "inactive") continue
    const target = getEffectiveBudget(s)
    if (target <= 0) continue
    const actual = finalCount[s.id] ?? 0
    if (actual >= target) continue

    const needed = target - actual
    const candidateDays = days
      .filter((dayPlan) => {
        if (dayPlan.assignments.some((a) => a.staff_id === s.id)) return false
        if (leaveMap[s.id]?.has(dayPlan.date)) return false
        if (s.start_date > dayPlan.date) return false
        if (s.end_date && s.end_date < dayPlan.date) return false
        return true
      })
      .sort((a, b) => a.assignments.length - b.assignments.length)

    let added = 0
    for (const dayPlan of candidateDays) {
      if (added >= needed) break
      const dc = getDayCode(dayPlan.date)
      const dayShiftCodes = activeShiftTypes
        .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dc))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((st) => st.code)
      const fallback = dayShiftCodes.length > 0 ? dayShiftCodes : (shiftCodes.length > 0 ? shiftCodes : ["T1"])
      const shiftCount: Record<string, number> = {}
      for (const sc of fallback) shiftCount[sc] = 0
      for (const a of dayPlan.assignments) {
        if (shiftCount[a.shift_type] !== undefined) shiftCount[a.shift_type]++
      }
      const prefShifts = s.preferred_shift ? s.preferred_shift.split(",").filter(Boolean) : []
      let bestShift = prefShifts.find((ps) => fallback.includes(ps))
      if (!bestShift) {
        bestShift = fallback.reduce((best, sc) =>
          (shiftCount[sc] ?? 0) < (shiftCount[best] ?? 0) ? sc : best
        , fallback[0])
      }
      dayPlan.assignments.push({ staff_id: s.id, shift_type: bestShift as ShiftType })
      finalCount[s.id] = (finalCount[s.id] ?? 0) + 1
      added++
      warnings.push(`[engine] BUDGET ENFORCEMENT: ${s.first_name} ${s.last_name} added to ${dayPlan.date} (${actual + added}/${target})`)
    }

    if (added < needed) {
      warnings.push(`[engine] BUDGET ENFORCEMENT FAILED: ${s.first_name} ${s.last_name} reached only ${actual + added}/${target} — not enough available days`)
    }
  }
}
