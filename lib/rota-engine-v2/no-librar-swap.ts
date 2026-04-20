import type { StaffWithSkills, RotaRule } from "@/lib/types/database"
import type { DayPlan } from "./types"

interface NoLibrarSwapParams {
  days: DayPlan[]
  rules: RotaRule[]
  staff: StaffWithSkills[]
  leaveMap: Record<string, Set<string>>
  warnings: string[]
}

// After all days are planned, find days where ALL conflict group members are off.
// Fix by swapping a conflict member's off day with a non-conflict same-role member.
export function repairNoLibrarMismoDia({
  days,
  rules,
  staff,
  leaveMap,
  warnings,
}: NoLibrarSwapParams): void {
  for (const rule of rules.filter((r) => r.enabled && r.type === "no_librar_mismo_dia" && r.is_hard && r.staff_ids.length >= 2)) {
    for (const dayPlan of days) {
      const assignedIds = new Set(dayPlan.assignments.map((a) => a.staff_id))
      const conflictOff = rule.staff_ids.filter((id) => !assignedIds.has(id))
      if (conflictOff.length < rule.staff_ids.length) continue

      const conflictCandidates = conflictOff
        .map((id) => staff.find((s) => s.id === id))
        .filter((s): s is StaffWithSkills => !!s && s.onboarding_status !== "inactive" && !leaveMap[s.id]?.has(dayPlan.date))
        .sort((a, b) => {
          const aTotal = days.filter((d) => d.assignments.some((x) => x.staff_id === a.id)).length
          const bTotal = days.filter((d) => d.assignments.some((x) => x.staff_id === b.id)).length
          return bTotal - aTotal
        })

      let fixed = false
      for (const conflictPerson of conflictCandidates) {
        if (fixed) break
        for (const asg of dayPlan.assignments) {
          if (fixed) break
          if (rule.staff_ids.includes(asg.staff_id)) continue
          const donor = staff.find((s) => s.id === asg.staff_id)
          if (!donor || donor.role !== conflictPerson.role) continue

          const swapDay = days.find((d) => {
            if (d.date === dayPlan.date) return false
            const cpWorking = d.assignments.some((x) => x.staff_id === conflictPerson.id)
            const donorOff = !d.assignments.some((x) => x.staff_id === donor.id)
            if (!cpWorking || !donorOff) return false
            if (leaveMap[donor.id]?.has(d.date)) return false
            if (donor.start_date > d.date || (donor.end_date && donor.end_date < d.date)) return false
            const otherConflictWorking = d.assignments.some((x) =>
              rule.staff_ids.includes(x.staff_id) && x.staff_id !== conflictPerson.id
            )
            if (!otherConflictWorking) {
              const anyConflictAssigned = rule.staff_ids.some((id) =>
                id !== conflictPerson.id && d.assignments.some((x) => x.staff_id === id)
              )
              if (!anyConflictAssigned) return false
            }
            return true
          })

          if (!swapDay) continue

          const donorShift = asg.shift_type
          dayPlan.assignments = dayPlan.assignments.filter((a) => a.staff_id !== donor.id)
          dayPlan.assignments.push({ staff_id: conflictPerson.id, shift_type: donorShift })

          const cpAsg = swapDay.assignments.find((a) => a.staff_id === conflictPerson.id)
          const cpShift = cpAsg?.shift_type ?? donorShift
          swapDay.assignments = swapDay.assignments.filter((a) => a.staff_id !== conflictPerson.id)
          swapDay.assignments.push({ staff_id: donor.id, shift_type: cpShift })

          warnings.push(
            `[engine] ${dayPlan.date}: no_librar_mismo_dia — swapped ${conflictPerson.first_name} ↔ ${donor.first_name}`
          )
          fixed = true
        }
      }

      if (!fixed) {
        warnings.push(
          `${dayPlan.date}: no_librar_mismo_dia — could not resolve: ${conflictOff.map((id) => staff.find((s) => s.id === id)?.first_name ?? id).join(" + ")} all off`
        )
      }
    }
  }
}
