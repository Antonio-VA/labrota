import type { StaffWithSkills, RotaRule } from "@/lib/types/database"
import type { TaskDayPlan } from "./types"

/**
 * Post-plan no_librar_mismo_dia check: warns when a configured set of staff
 * all end up off on the same day. Task engine cannot repair this (all-off is
 * hard to fix after the fact), so we only emit warnings.
 */
export function checkNoLibrarMismoDia(
  days: TaskDayPlan[],
  rules: RotaRule[],
  staff: StaffWithSkills[],
  warnings: string[]
): void {
  const emit = (rule: RotaRule, hardSuffix: string) => {
    for (const dayPlan of days) {
      const assignedIds = new Set(dayPlan.assignments.map((a) => a.staff_id))
      const offIds = new Set(dayPlan.offStaff)
      const conflictOff = rule.staff_ids.filter((id) => !assignedIds.has(id) && offIds.has(id))
      if (conflictOff.length < rule.staff_ids.length) continue
      const names = conflictOff
        .map((id) => staff.find((s) => s.id === id)?.first_name ?? id)
        .join(" + ")
      warnings.push(`${dayPlan.date}: no_librar_mismo_dia — ${names} todos libres${hardSuffix}`)
    }
  }

  for (const rule of rules.filter(
    (r) => r.enabled && r.type === "no_librar_mismo_dia" && r.is_hard && r.staff_ids.length >= 2
  )) {
    emit(rule, "")
  }
  for (const rule of rules.filter(
    (r) => r.enabled && r.type === "no_librar_mismo_dia" && !r.is_hard && r.staff_ids.length >= 2
  )) {
    emit(rule, " (regla blanda)")
  }
}
