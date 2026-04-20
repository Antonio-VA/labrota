import type { StaffWithSkills, RotaRule } from "@/lib/types/database"
import { isQualified, type StaffSkillSets } from "./skills"

export interface BudgetFillParams {
  workingStaff: StaffWithSkills[]
  staffSkillsCache: Record<string, StaffSkillSets>
  tecnicas: { codigo: string; department: string }[]
  rules: RotaRule[]
  linkedGroups: string[][]
  taskConflictThreshold: number
  dummyShift: string
  workloadScore: Record<string, number>
  /* Mutable state shared with caller — updated in place */
  dayAssignments: { staff_id: string; shift_type: string; function_label: string }[]
  staffTaskCount: Record<string, number>
  staffTasks: Record<string, Set<string>>
  assignedStaffIds: Set<string>
}

/**
 * After minimum demand is met, assign remaining unassigned working staff to
 * their best-fit linked group (or least-covered standalone task), then extend
 * already-assigned group members to other tasks in their group.
 *
 * Mutates `dayAssignments`, `staffTaskCount`, `staffTasks`, `assignedStaffIds`
 * in place.
 */
export function fillBudgets({
  workingStaff,
  staffSkillsCache,
  tecnicas,
  rules,
  linkedGroups,
  taskConflictThreshold,
  dummyShift,
  workloadScore,
  dayAssignments,
  staffTaskCount,
  staffTasks,
  assignedStaffIds,
}: BudgetFillParams): void {
  // Build no_misma_tarea conflict lookup
  const noMismaTareaGroups: { staffIds: Set<string> }[] = []
  for (const rule of rules.filter((r) => r.enabled && r.type === "no_misma_tarea" && r.is_hard)) {
    noMismaTareaGroups.push({ staffIds: new Set(rule.staff_ids) })
  }

  function wouldConflictNoMismaTarea(staffId: string, taskCode: string): boolean {
    for (const group of noMismaTareaGroups) {
      if (!group.staffIds.has(staffId)) continue
      const otherOnTask = dayAssignments.some(
        (a) => a.function_label === taskCode && a.staff_id !== staffId && group.staffIds.has(a.staff_id)
      )
      if (otherOnTask) return true
    }
    return false
  }

  // Collect working staff qualifications
  const allQualifiedTasks: Record<string, string[]> = {}
  for (const s of workingStaff) {
    const skills = staffSkillsCache[s.id]
    if (!skills) continue
    const qualifiedFor = tecnicas.filter((t) => isQualified(skills, t.codigo)).map((t) => t.codigo)
    if (qualifiedFor.length > 0) allQualifiedTasks[s.id] = qualifiedFor
  }

  // Task-to-group lookup
  const taskToLinkedGroup = new Map<string, string[]>()
  for (const g of linkedGroups) {
    for (const c of g) taskToLinkedGroup.set(c, g)
  }

  // Initial task-assign counts
  const taskAssignCount: Record<string, number> = {}
  for (const a of dayAssignments) {
    taskAssignCount[a.function_label] = (taskAssignCount[a.function_label] ?? 0) + 1
  }

  // Staff sorted by fewest tasks assigned today (prioritise idle staff)
  const staffByLoad = [...workingStaff].sort((a, b) => {
    const aCount = staffTaskCount[a.id] ?? 0
    const bCount = staffTaskCount[b.id] ?? 0
    if (aCount !== bCount) return aCount - bCount
    return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
  })

  // ── Budget-filling pass ───────────────────────────────────────────────────
  // Assign every unassigned working staff to their best-fit technique group.
  // "Best fit" = the linked group (tecnicas_juntas rule) for which the staff
  // is qualified for the most tasks. Staff with no matching group get the
  // least-covered standalone task instead.
  for (const s of staffByLoad) {
    if (assignedStaffIds.has(s.id) && (staffTaskCount[s.id] ?? 0) >= 1) continue
    const qualified = allQualifiedTasks[s.id]
    if (!qualified || qualified.length === 0) continue

    let bestGroup: string[] | null = null
    let bestScore = 0
    for (const g of linkedGroups) {
      const score = g.filter((t) => qualified.includes(t)).length
      if (score > bestScore) {
        bestScore = score
        bestGroup = g
      }
    }

    if (bestGroup && bestScore > 0) {
      for (const taskCode of bestGroup) {
        if (!qualified.includes(taskCode)) continue
        if (wouldConflictNoMismaTarea(s.id, taskCode)) continue
        if ((staffTaskCount[s.id] ?? 0) >= taskConflictThreshold) break
        dayAssignments.push({ staff_id: s.id, shift_type: dummyShift, function_label: taskCode })
        staffTaskCount[s.id] = (staffTaskCount[s.id] ?? 0) + 1
        if (!staffTasks[s.id]) staffTasks[s.id] = new Set()
        staffTasks[s.id].add(taskCode)
        assignedStaffIds.add(s.id)
        taskAssignCount[taskCode] = (taskAssignCount[taskCode] ?? 0) + 1
      }
    } else {
      const pick = [...qualified]
        .filter((t) => !wouldConflictNoMismaTarea(s.id, t))
        .sort((a, b) => {
          const aGrouped = taskToLinkedGroup.has(a) ? 1 : 0
          const bGrouped = taskToLinkedGroup.has(b) ? 1 : 0
          if (aGrouped !== bGrouped) return aGrouped - bGrouped
          return (taskAssignCount[a] ?? 0) - (taskAssignCount[b] ?? 0)
        })[0]
      if (!pick) continue
      dayAssignments.push({ staff_id: s.id, shift_type: dummyShift, function_label: pick })
      staffTaskCount[s.id] = (staffTaskCount[s.id] ?? 0) + 1
      if (!staffTasks[s.id]) staffTasks[s.id] = new Set()
      staffTasks[s.id].add(pick)
      assignedStaffIds.add(s.id)
      taskAssignCount[pick] = (taskAssignCount[pick] ?? 0) + 1
    }
  }

  // ── Group-extension pass ──────────────────────────────────────────────────
  // Staff already assigned to any task in a linked group should also cover
  // the other tasks in that same group they're qualified for. Staff NOT in
  // any linked group do NOT get additional tasks — this prevents multi-skilled
  // staff from flooding every task row.
  for (const s of staffByLoad) {
    const qualified = allQualifiedTasks[s.id]
    if (!qualified) continue
    const currentTasks = staffTasks[s.id]
    if (!currentTasks || currentTasks.size === 0) continue

    let myGroup: string[] | null = null
    for (const taskCode of currentTasks) {
      const g = taskToLinkedGroup.get(taskCode)
      if (g) {
        myGroup = g
        break
      }
    }
    if (!myGroup) continue

    for (const taskCode of myGroup) {
      if (currentTasks.has(taskCode)) continue
      if (!qualified.includes(taskCode)) continue
      if (wouldConflictNoMismaTarea(s.id, taskCode)) continue
      if ((staffTaskCount[s.id] ?? 0) >= taskConflictThreshold) break
      dayAssignments.push({ staff_id: s.id, shift_type: dummyShift, function_label: taskCode })
      staffTaskCount[s.id] = (staffTaskCount[s.id] ?? 0) + 1
      currentTasks.add(taskCode)
      taskAssignCount[taskCode] = (taskAssignCount[taskCode] ?? 0) + 1
    }
  }
}
