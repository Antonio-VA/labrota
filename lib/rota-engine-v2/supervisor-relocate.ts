import type { RotaRule, ShiftType, ShiftTypeDefinition } from "@/lib/types/database"
import type { DayPlan } from "./types"

interface SupervisorRelocateParams {
  days: DayPlan[]
  rules: RotaRule[]
  activeShiftTypes: ShiftTypeDefinition[]
  tecnicaTypicalShifts: Record<string, Set<string>>
}

const DAY_CODES = ["sun","mon","tue","wed","thu","fri","sat"] as const

// Phase 3 (no_librar_mismo_dia) swaps staff between days, potentially splitting
// supervised pairs. Re-apply co-location for all supervisor rules.
export function reEnforceSupervisorColocation({
  days,
  rules,
  activeShiftTypes,
  tecnicaTypicalShifts,
}: SupervisorRelocateParams): void {
  for (const rule of rules.filter((r) => r.enabled && r.type === "supervisor_requerido")) {
    const supervisorId = rule.params.supervisor_id as string | undefined
    if (!supervisorId) continue
    const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
    const supervisedIds = rule.staff_ids.filter((id) => id !== supervisorId)
    const trainingTec = rule.params.training_tecnica_code as string | undefined
    const validShifts = trainingTec ? tecnicaTypicalShifts[trainingTec] : null

    for (const dayPlan of days) {
      const dc = DAY_CODES[new Date(dayPlan.date + "T12:00:00").getDay()] as string
      if (supDays.length > 0 && !supDays.includes(dc)) continue
      const supAsg = dayPlan.assignments.find((a) => a.staff_id === supervisorId)
      if (!supAsg) continue
      const traineeAsg = dayPlan.assignments.find((a) => supervisedIds.includes(a.staff_id))
      if (!traineeAsg) continue
      if (supAsg.shift_type === traineeAsg.shift_type) continue

      const dayShiftSet = new Set(activeShiftTypes
        .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dc))
        .map((st) => st.code))

      if (validShifts && validShifts.size > 0) {
        const traineeInValid = validShifts.has(traineeAsg.shift_type)
        const supInValid = validShifts.has(supAsg.shift_type)
        if (traineeInValid) {
          supAsg.shift_type = traineeAsg.shift_type
        } else if (supInValid) {
          traineeAsg.shift_type = supAsg.shift_type
        } else {
          const shiftCounts: Record<string, number> = {}
          for (const a of dayPlan.assignments) shiftCounts[a.shift_type] = (shiftCounts[a.shift_type] ?? 0) + 1
          const bestShift = [...validShifts]
            .filter((s) => dayShiftSet.has(s))
            .sort((a, b) => (shiftCounts[b] ?? 0) - (shiftCounts[a] ?? 0))[0]
          if (bestShift) {
            supAsg.shift_type = bestShift as ShiftType
            traineeAsg.shift_type = bestShift as ShiftType
          } else {
            supAsg.shift_type = traineeAsg.shift_type
          }
        }
      } else {
        supAsg.shift_type = traineeAsg.shift_type
      }
    }
  }
}

export function collectTrainingTecnicaMap(rules: RotaRule[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const rule of rules.filter((r) => r.enabled && r.type === "supervisor_requerido")) {
    const trainingTecCode = rule.params.training_tecnica_code as string | undefined
    if (!trainingTecCode) continue
    const supervisorId = rule.params.supervisor_id as string | undefined
    const traineeIds = rule.staff_ids.filter((id) => id !== supervisorId)
    for (const id of traineeIds) {
      map[id] = trainingTecCode
    }
  }
  return map
}
