import type { StaffWithSkills, ShiftType, ShiftTypeDefinition, LabConfig, RotaRule } from "@/lib/types/database"
import { getDayCode } from "@/lib/engine-helpers"
import type { DayPlan, TaskAssignment } from "./types"

interface TaskAssignmentParams {
  days: DayPlan[]
  staff: StaffWithSkills[]
  rules: RotaRule[]
  labConfig: LabConfig
  tecnicas: { codigo: string; department?: string; typical_shifts: string[]; avoid_shifts?: string[] }[]
  shiftTypes: ShiftTypeDefinition[]
  taskCoverageByDay: Record<string, Record<string, number>>
  leaveMap: Record<string, Set<string>>
  weeklyShiftCount: Record<string, number>
  workloadScore: Record<string, number>
  trainingTecnicaMap: Record<string, string>
  taskAssignments: TaskAssignment[]
  warnings: string[]
}

// Phase 4: assign tecnicas to staff already scheduled for the day. Only runs
// when explicit task coverage is configured. By_task orgs use the task engine
// instead; by_shift orgs without task coverage should not produce task-level
// rows even if they have active técnicas.
export function assignTasksToShifts({
  days,
  staff,
  rules,
  labConfig,
  tecnicas,
  shiftTypes,
  taskCoverageByDay,
  leaveMap,
  weeklyShiftCount,
  workloadScore,
  trainingTecnicaMap,
  taskAssignments,
  warnings,
}: TaskAssignmentParams): void {
  const taskConflictThreshold = labConfig.task_conflict_threshold ?? 3

  for (const dayPlan of days) {
    const date = dayPlan.date
    const dayCode = getDayCode(date)
    const assignedStaff = dayPlan.assignments.map((a) => {
      const s = staff.find((st) => st.id === a.staff_id)
      return s ? { ...a, staff: s } : null
    }).filter(Boolean) as { staff_id: string; shift_type: ShiftType; staff: StaffWithSkills }[]

    if (assignedStaff.length === 0) continue

    const taskDemand: { code: string; needed: number; typical_shifts: Set<string>; avoid_shifts: Set<string> }[] = []
    for (const [tecCode, dayCov] of Object.entries(taskCoverageByDay)) {
      const needed = dayCov[dayCode] ?? 0
      if (needed <= 0) continue
      const tec = tecnicas.find((t) => t.codigo === tecCode)
      taskDemand.push({
        code: tecCode,
        needed,
        typical_shifts: new Set(tec?.typical_shifts ?? []),
        avoid_shifts: new Set(tec?.avoid_shifts ?? []),
      })
    }

    for (const rule of rules.filter((r) => r.enabled && r.type === "restriccion_dia_tecnica")) {
      const tecCode = rule.params.tecnica_code as string | undefined
      const dayMode = rule.params.dayMode as string | undefined
      const restrictedDays = (rule.params.restrictedDays as string[] | undefined) ?? []
      if (!tecCode || restrictedDays.length === 0) continue
      const blocked = dayMode === "only"
        ? !restrictedDays.includes(dayCode)
        : restrictedDays.includes(dayCode)
      if (blocked) {
        const idx = taskDemand.findIndex((td) => td.code === tecCode)
        if (idx !== -1) {
          taskDemand.splice(idx, 1)
          warnings.push(`[rule] ${tecCode} blocked on ${dayCode} by restriccion_dia_tecnica`)
        }
      }
    }

    if (taskDemand.length === 0) continue

    const staffTaskCount: Record<string, number> = {}
    const staffSkillMap: Record<string, { certified: Set<string>; training: Set<string> }> = {}
    for (const { staff_id, staff: s } of assignedStaff) {
      staffTaskCount[staff_id] = 0
      const certified = new Set<string>()
      const training = new Set<string>()
      for (const sk of s.staff_skills) {
        if (sk.level === "certified") certified.add(sk.skill)
        else if (sk.level === "training") training.add(sk.skill)
      }
      staffSkillMap[staff_id] = { certified, training }
    }

    const qualifiedCount = (code: string): number => {
      return assignedStaff.filter(({ staff_id }) => {
        const skills = staffSkillMap[staff_id]
        return skills?.certified.has(code) || skills?.training.has(code)
      }).length
    }
    taskDemand.sort((a, b) => qualifiedCount(a.code) - qualifiedCount(b.code))

    const dayTaskMap: Record<string, Set<string>> = {}

    for (const { staff_id } of assignedStaff) {
      const forcedTec = trainingTecnicaMap[staff_id]
      if (!forcedTec) continue
      const demandEntry = taskDemand.find((td) => td.code === forcedTec)
      if (!demandEntry) continue
      taskAssignments.push({ staff_id, tecnica_code: forcedTec, date })
      staffTaskCount[staff_id] = (staffTaskCount[staff_id] ?? 0) + 1
      if (!dayTaskMap[staff_id]) dayTaskMap[staff_id] = new Set()
      dayTaskMap[staff_id].add(forcedTec)
      demandEntry.needed = Math.max(0, demandEntry.needed - 1)
    }

    for (const task of taskDemand) {
      const candidates = assignedStaff.filter(({ staff_id }) => {
        if (staffTaskCount[staff_id] >= taskConflictThreshold) return false
        const skills = staffSkillMap[staff_id]
        return skills?.certified.has(task.code) || skills?.training.has(task.code)
      })

      candidates.sort((a, b) => {
        const aShiftOk = task.typical_shifts.size === 0 || task.typical_shifts.has(a.shift_type) ? 0 : 1
        const bShiftOk = task.typical_shifts.size === 0 || task.typical_shifts.has(b.shift_type) ? 0 : 1
        if (aShiftOk !== bShiftOk) return aShiftOk - bShiftOk
        const aAvoid = task.avoid_shifts.has(a.shift_type) ? 1 : 0
        const bAvoid = task.avoid_shifts.has(b.shift_type) ? 1 : 0
        if (aAvoid !== bAvoid) return aAvoid - bAvoid
        const aCert = staffSkillMap[a.staff_id]?.certified.has(task.code) ? 0 : 1
        const bCert = staffSkillMap[b.staff_id]?.certified.has(task.code) ? 0 : 1
        if (aCert !== bCert) return aCert - bCert
        const aCount = staffTaskCount[a.staff_id]
        const bCount = staffTaskCount[b.staff_id]
        if (aCount !== bCount) return aCount - bCount
        return (workloadScore[a.staff_id] ?? 0) - (workloadScore[b.staff_id] ?? 0)
      })

      let filled = 0
      for (const candidate of candidates) {
        if (filled >= task.needed) break
        taskAssignments.push({ staff_id: candidate.staff_id, tecnica_code: task.code, date })
        staffTaskCount[candidate.staff_id]++
        if (!dayTaskMap[candidate.staff_id]) dayTaskMap[candidate.staff_id] = new Set()
        dayTaskMap[candidate.staff_id].add(task.code)
        filled++
      }

      if (filled < task.needed) {
        const unassignedQualified = staff.filter((s) => {
          if (assignedStaff.some((a) => a.staff_id === s.id)) return false
          if (s.onboarding_status === "inactive") return false
          if (s.start_date > date || (s.end_date && s.end_date < date)) return false
          if (leaveMap[s.id]?.has(date)) return false
          if ((weeklyShiftCount[s.id] ?? 0) >= (s.days_per_week ?? 5)) return false
          const skills = staffSkillMap[s.id] ?? {
            certified: new Set(s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill)),
            training: new Set(s.staff_skills.filter((sk) => sk.level === "training").map((sk) => sk.skill)),
          }
          return skills.certified.has(task.code) || skills.training.has(task.code)
        }).sort((a, b) => (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0))

        for (const pick of unassignedQualified) {
          if (filled >= task.needed) break
          const dayShiftCodes = shiftTypes
            .filter((st) => st.active !== false && (!st.active_days || st.active_days.length === 0 || st.active_days.includes(dayCode)))
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((st) => st.code)
          const compatibleShift = (task.typical_shifts.size > 0
            ? dayShiftCodes.find((sc) => task.typical_shifts.has(sc))
            : null) ?? dayShiftCodes[0] ?? "T1"

          dayPlan.assignments.push({ staff_id: pick.id, shift_type: compatibleShift as ShiftType })
          assignedStaff.push({ staff_id: pick.id, shift_type: compatibleShift as ShiftType, staff: pick })
          staffTaskCount[pick.id] = 1
          staffSkillMap[pick.id] = {
            certified: new Set(pick.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill)),
            training: new Set(pick.staff_skills.filter((sk) => sk.level === "training").map((sk) => sk.skill)),
          }
          if (!dayTaskMap[pick.id]) dayTaskMap[pick.id] = new Set()
          dayTaskMap[pick.id].add(task.code)
          taskAssignments.push({ staff_id: pick.id, tecnica_code: task.code, date })
          weeklyShiftCount[pick.id] = (weeklyShiftCount[pick.id] ?? 0) + 1
          workloadScore[pick.id] = (workloadScore[pick.id] ?? 0) + 1
          filled++
          warnings.push(`${date}: ${pick.first_name} ${pick.last_name} añadido para cubrir tarea ${task.code} (supera mínimo departamento)`)
        }
      }

      if (filled < task.needed) {
        warnings.push(`${date}: COBERTURA INSUFICIENTE — ${task.code} necesita ${task.needed}, asignados ${filled}`)
      }

      const assignedForTask = taskAssignments.filter((ta) => ta.date === date && ta.tecnica_code === task.code)
      const allTraining = assignedForTask.length > 0 && assignedForTask.every((ta) => {
        return !staffSkillMap[ta.staff_id]?.certified.has(task.code)
      })
      if (allTraining && assignedForTask.length > 0) {
        warnings.push(`${date}: solo personal en formación para ${task.code}`)
      }
    }

    for (const rule of rules.filter((r) => r.enabled && r.type === "no_misma_tarea")) {
      const ruleStaffIds = new Set(rule.staff_ids)
      const taskToStaff: Record<string, string[]> = {}
      for (const ta of taskAssignments.filter((ta) => ta.date === date)) {
        if (!taskToStaff[ta.tecnica_code]) taskToStaff[ta.tecnica_code] = []
        taskToStaff[ta.tecnica_code].push(ta.staff_id)
      }

      for (const [taskCode, staffIds] of Object.entries(taskToStaff)) {
        const conflicting = staffIds.filter((id) => ruleStaffIds.has(id))
        if (conflicting.length <= 1) continue

        if (rule.is_hard) {
          for (let i = 1; i < conflicting.length; i++) {
            const staffId = conflicting[i]
            const skills = staffSkillMap[staffId]
            const currentTasks = dayTaskMap[staffId] ?? new Set()
            const altTask = taskDemand.find((t) =>
              t.code !== taskCode &&
              !currentTasks.has(t.code) &&
              (skills?.certified.has(t.code) || skills?.training.has(t.code))
            )
            if (altTask) {
              const idx = taskAssignments.findIndex((ta) => ta.date === date && ta.staff_id === staffId && ta.tecnica_code === taskCode)
              if (idx >= 0) {
                taskAssignments[idx].tecnica_code = altTask.code
                currentTasks.delete(taskCode)
                currentTasks.add(altTask.code)
              }
            } else {
              const idx = taskAssignments.findIndex((ta) => ta.date === date && ta.staff_id === staffId && ta.tecnica_code === taskCode)
              if (idx >= 0) {
                taskAssignments.splice(idx, 1)
                staffTaskCount[staffId]--
                currentTasks.delete(taskCode)
              }
              warnings.push(`${date}: ${staff.find((s) => s.id === staffId)?.first_name ?? staffId} retirado de ${taskCode} (no_misma_tarea)`)
            }
          }
        } else {
          const names = conflicting.map((id) => staff.find((s) => s.id === id)?.first_name ?? id)
          warnings.push(`${date}: ${names.join(" + ")} asignados a ${taskCode} (no_misma_tarea, soft)`)
        }
      }
    }
  }
}
