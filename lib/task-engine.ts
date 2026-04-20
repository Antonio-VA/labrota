/**
 * LabRota task-based scheduling engine.
 * Pure function — no DB calls, fully testable.
 *
 * Unlike the shift engine (rota-engine.ts) which assigns staff to shifts,
 * this engine assigns staff directly to tasks (técnicas). Shifts are irrelevant
 * in by_task mode — a dummy shift code is used for all assignments.
 *
 * Algorithm:
 *  1. Determine eligible staff per day (active, in employment window, works that
 *     weekday, not on leave, has weekly budget remaining)
 *  2. Build task demand per day from task_coverage_by_day (explicit) or
 *     department minimums (fallback: distribute tasks evenly across dept staff)
 *  3. Pre-plan minimum department coverage across all 7 days (budget reservation)
 *  4. Day-by-day: assign staff to tasks using rarest-task-first heuristic
 *  5. Apply scheduling rules (max consecutive days, weekend distribution, etc.)
 *  6. Task rotation: stable / weekly / daily within departments with >1 task
 */

import type { SkillName, StaffWithSkills } from "@/lib/types/database"

import { getDayCode, isWeekend, addDays, getWeekDates } from "@/lib/engine-helpers"
import { toISODate } from "@/lib/format-date"

import type { TaskDayPlan, TaskEngineResult, TaskEngineParams } from "./task-engine/types"
import { reserveMinCoverage } from "./task-engine/min-coverage"
import { checkNoLibrarMismoDia } from "./task-engine/no-librar-check"
import { applyDayRules } from "./task-engine/apply-day-rules"
import { fillBudgets } from "./task-engine/budget-fill"

export type { TaskDayPlan, TaskEngineResult, TaskEngineParams }

// ── Engine ────────────────────────────────────────────────────────────────────

export function runTaskEngine(params: TaskEngineParams): TaskEngineResult {
  const {
    weekStart,
    staff,
    leaves,
    recentAssignments,
    labConfig,
    shiftTypes = [],
    rules = [],
    tecnicas,
    taskRotation = "stable",
    taskCoverageEnabled = false,
    taskCoverageByDay,
    recentTaskAssignments = [],
  } = params

  const days: TaskDayPlan[] = []
  const warnings: string[] = []

  // Dummy shift: first active shift code (by_task mode doesn't use shifts meaningfully)
  const dummyShift = shiftTypes
    .filter((st) => st.active !== false)
    .sort((a, b) => a.sort_order - b.sort_order)[0]?.code ?? "T1"

  // Active técnicas grouped by department (comma-separated departments distribute to each)
  const tecByDept: Record<string, typeof tecnicas> = {}
  for (const t of tecnicas) {
    const depts = (t.department || "lab").split(",").filter(Boolean)
    for (const dept of depts) {
      if (!tecByDept[dept]) tecByDept[dept] = []
      tecByDept[dept].push(t)
    }
  }

  // Task conflict threshold (soft)
  const taskConflictThreshold = labConfig.task_conflict_threshold ?? 3

  // Historical workload scores
  const workloadScore: Record<string, number> = {}
  for (const a of recentAssignments) {
    workloadScore[a.staff_id] = (workloadScore[a.staff_id] ?? 0) + 1
  }

  // Recent task map for rotation: staff_id → last week's task codes
  const lastTasksByStaff: Record<string, string[]> = {}
  for (const ta of recentTaskAssignments) {
    if (!lastTasksByStaff[ta.staff_id]) lastTasksByStaff[ta.staff_id] = []
    if (!lastTasksByStaff[ta.staff_id].includes(ta.tecnica_code)) {
      lastTasksByStaff[ta.staff_id].push(ta.tecnica_code)
    }
  }

  const allWeekDates = getWeekDates(weekStart)

  // Weekly shift counter
  const weeklyDayCount: Record<string, number> = {}

  // Leave map: staff_id → set of dates on leave
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

  // Days-off preference
  const daysOffPref = labConfig.days_off_preference ?? "prefer_weekend"

  // Assignment lookup for rules: date → set of staff_ids (recent + generated)
  const assignedByDate: Record<string, Set<string>> = {}
  for (const a of recentAssignments) {
    if (!assignedByDate[a.date]) assignedByDate[a.date] = new Set()
    assignedByDate[a.date].add(a.staff_id)
  }

  function consecutiveDaysBefore(staffId: string, date: string): number {
    let count = 0
    const d = new Date(date + "T12:00:00")
    for (let i = 0; i < 30; i++) {
      d.setDate(d.getDate() - 1)
      const iso = toISODate(d)
      if (!assignedByDate[iso]?.has(staffId)) break
      count++
    }
    return count
  }

  // ── Availability helpers ──────────────────────────────────────────────────

  function isAvailable(s: StaffWithSkills, date: string): boolean {
    if (s.onboarding_status === "inactive") return false
    if (s.start_date > date) return false
    if (s.end_date && s.end_date < date) return false
    if (leaveMap[s.id]?.has(date)) return false
    return true
  }

  function hasBudget(s: StaffWithSkills): boolean {
    const used = weeklyDayCount[s.id] ?? 0
    const cap = s.days_per_week ?? 5
    return used < cap
  }

  // ── Skill helpers ─────────────────────────────────────────────────────────

  function getStaffSkills(s: StaffWithSkills): { certified: Set<string>; training: Set<string> } {
    const certified = new Set<string>()
    const training = new Set<string>()
    for (const sk of s.staff_skills) {
      if (sk.level === "certified") certified.add(sk.skill)
      else if (sk.level === "training") training.add(sk.skill)
    }
    return { certified, training }
  }

  function isQualified(skills: { certified: Set<string>; training: Set<string> }, taskCode: string): boolean {
    return skills.certified.has(taskCode) || skills.training.has(taskCode)
  }

  // ── PHASE 1: Pre-plan minimum department coverage ────────────────────────
  const minCoverageReserved = reserveMinCoverage({
    staff,
    allWeekDates,
    labConfig,
    leaveMap,
    workloadScore,
    daysOffPref,
  })

  // ── Task rotation helper ──────────────────────────────────────────────────
  // Returns a sorting score for a candidate+task combo based on rotation mode.
  // Lower = preferred.

  function taskRotationScore(staffId: string, taskCode: string, dayIndex: number, deptTasks: string[]): number {
    if (deptTasks.length <= 1) return 0 // no rotation possible with single task

    const lastTasks = lastTasksByStaff[staffId] ?? []

    switch (taskRotation) {
      case "stable": {
        // Prefer same tasks as last week
        if (lastTasks.includes(taskCode)) return 0
        return lastTasks.length > 0 ? 1 : 0 // new staff: no preference
      }
      case "weekly": {
        // Prefer DIFFERENT tasks from last week
        if (lastTasks.includes(taskCode)) return 1
        return 0
      }
      case "daily": {
        // Rotate based on day index — spread tasks across the week
        const taskIdx = deptTasks.indexOf(taskCode)
        if (taskIdx < 0) return 0
        // Staff gets a "slot" that shifts each day
        const staffIdx = staff.findIndex((s) => s.id === staffId)
        const preferredTaskIdx = (staffIdx + dayIndex) % deptTasks.length
        return taskIdx === preferredTaskIdx ? 0 : 1
      }
      default:
        return 0
    }
  }

  // ── PHASE 2: Day-by-day task assignment ──────────────────────────────────
  // Intentionally kept inline. The loop reads and writes ~10 mutable maps
  // (weeklyDayCount, assignedByDate, minCoverageReserved, workloadScore,
  // leaveMap, lastTasksByStaff, tecByDept, …) and many closures
  // (isAvailable, hasBudget, getStaffSkills, isQualified, taskRotationScore,
  // consecutiveDaysBefore). Extracting it would require threading all of that
  // through a params object or refactoring the loop into a stateful class —
  // not a size-only win. Do not flag in file-size audits.

  for (let dayIndex = 0; dayIndex < allWeekDates.length; dayIndex++) {
    const date = allWeekDates[dayIndex]
    const dayCode = getDayCode(date)
    const weekend = isWeekend(date)

    // Department minimums for this day
    const dayCoverage = labConfig.coverage_by_day?.[dayCode]
    const deptMins: Record<string, number> = {
      lab: dayCoverage?.lab ?? labConfig.min_lab_coverage,
      andrology: dayCoverage?.andrology ?? labConfig.min_andrology_coverage,
      admin: dayCoverage?.admin ?? 0,
    }

    // ── 2a: Determine which staff work today ────────────────────────────

    const reservedIds = minCoverageReserved[date]

    // All eligible staff with budget, sorted by preference
    const eligibleStaff = staff.filter((s) => {
      if (!isAvailable(s, date)) return false
      if (reservedIds.has(s.id)) return true // reserved always work
      if (!hasBudget(s)) return false
      // "always_weekend": on weekends only reserved staff work
      if (daysOffPref === "always_weekend" && weekend) return false
      // Account for future reservations
      const futureReserved = allWeekDates
        .filter((d) => d > date && minCoverageReserved[d]?.has(s.id))
        .length
      const used = weeklyDayCount[s.id] ?? 0
      const cap = s.days_per_week ?? 5
      return (used + 1 + futureReserved) <= cap
    }).sort((a, b) => {
      // Reserved first
      const aReserved = reservedIds.has(a.id) ? 0 : 1
      const bReserved = reservedIds.has(b.id) ? 0 : 1
      if (aReserved !== bReserved) return aReserved - bReserved
      // Working pattern match
      const aInPattern = (!a.working_pattern?.length || a.working_pattern.includes(dayCode)) ? 0 : 1
      const bInPattern = (!b.working_pattern?.length || b.working_pattern.includes(dayCode)) ? 0 : 1
      if (aInPattern !== bInPattern) return aInPattern - bInPattern
      // Weekend deprioritization
      if (daysOffPref === "prefer_weekend" && weekend) {
        const aRemaining = (a.days_per_week ?? 5) - (weeklyDayCount[a.id] ?? 0)
        const bRemaining = (b.days_per_week ?? 5) - (weeklyDayCount[b.id] ?? 0)
        if (aRemaining !== bRemaining) return bRemaining - aRemaining
      }
      return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
    })

    // ── 2b: Apply scheduling rules to filter staff ──────────────────────
    const { hardRemovals, fixedShiftOverrides } = applyDayRules({
      date,
      dayCode,
      weekend,
      rules,
      eligibleStaff,
      reservedIds,
      recentAssignments,
      workloadScore,
      consecutiveDaysBefore,
      warnings,
    })

    // Working staff for today (after rule removals)
    const workingStaff = eligibleStaff.filter((s) => !hardRemovals.has(s.id))

    // Check department minimums
    for (const [role, minRequired] of Object.entries(deptMins)) {
      const count = workingStaff.filter((s) => s.role === role).length
      if (count < minRequired) {
        warnings.push(`${date}: COBERTURA INSUFICIENTE — ${count} ${role} (mínimo ${minRequired})`)
      }
    }

    // ── 2c: Build task demand for this day ──────────────────────────────

    interface TaskDemand {
      key: string  // unique: "QCO" or "QCO__AND" for per-shift entries
      code: string
      department: string
      needed: number
      typical_shifts: string[]
    }

    const taskDemand: TaskDemand[] = []

    if (taskCoverageEnabled && taskCoverageByDay && Object.keys(taskCoverageByDay).length > 0) {
      // Explicit per-task coverage — keys may be "QCO" or "QCO__AND" (per-shift)
      // Aggregate entries: per-shift keys pin to that shift, plain keys use tecnica defaults
      const seenTecCodes = new Set<string>()
      for (const [rawKey, dayCov] of Object.entries(taskCoverageByDay)) {
        const needed = dayCov[dayCode] ?? 0
        if (needed <= 0) continue
        const [tecCode, shiftCode] = rawKey.split("__")
        const tec = tecnicas.find((t) => t.codigo === tecCode)
        if (!tec) continue
        seenTecCodes.add(tecCode)
        taskDemand.push({
          key: rawKey,
          code: tecCode,
          needed,
          department: tec.department || "lab",
          // Per-shift key pins to that single shift; plain key uses tecnica defaults
          typical_shifts: shiftCode ? [shiftCode] : (tec.typical_shifts ?? []),
        })
      }
    } else {
      // Fallback: at least 1 person per active technique
      for (const tec of tecnicas) {
        taskDemand.push({
          key: tec.codigo,
          code: tec.codigo,
          needed: 1,
          department: tec.department || "lab",
          typical_shifts: tec.typical_shifts ?? [],
        })
      }
    }

    if (taskDemand.length === 0 && workingStaff.length > 0) {
      // No task demand but staff are working — still record them as working
      // (they'll show as assigned with no specific task, which shouldn't happen
      // in a well-configured org, but we handle it gracefully)
      warnings.push(`${date}: No task demand configured — staff have no tasks to fill`)
    }

    // ── 2d: Assign staff to tasks (rarest-task-first) ───────────────────

    const staffSkillsCache: Record<string, { certified: Set<string>; training: Set<string> }> = {}
    for (const s of workingStaff) {
      staffSkillsCache[s.id] = getStaffSkills(s)
    }

    // Count qualified staff per task (for rarity sorting)
    function qualifiedCount(taskCode: string): number {
      return workingStaff.filter((s) => {
        const skills = staffSkillsCache[s.id]
        return skills && isQualified(skills, taskCode)
      }).length
    }

    // Sort tasks: rarest first (fewest qualified staff)
    taskDemand.sort((a, b) => qualifiedCount(a.code) - qualifiedCount(b.code))

    const staffTaskCount: Record<string, number> = {} // staff_id → tasks today
    const staffTasks: Record<string, Set<string>> = {} // staff_id → set of task codes
    const dayAssignments: { staff_id: string; shift_type: string; function_label: string }[] = []
    const assignedStaffIds = new Set<string>() // staff who got at least one task

    // Department task lists (for rotation scoring)
    const deptTaskCodes: Record<string, string[]> = {}
    for (const [dept, tecs] of Object.entries(tecByDept)) {
      deptTaskCodes[dept] = tecs.map((t) => t.codigo)
    }

    // ── tecnicas_juntas: build linked groups ──────────────────────────────
    // Each group = set of technique codes that must go to the same person on this day
    const linkedGroups: string[][] = []
    for (const rule of rules.filter((r) => r.enabled && r.type === "tecnicas_juntas")) {
      const codes = (rule.params.tecnica_codes as string[] | undefined) ?? []
      if (codes.length < 2) continue
      const ruleDays = (rule.params.days as string[] | undefined) ?? []
      if (ruleDays.length > 0 && !ruleDays.includes(dayCode)) continue
      linkedGroups.push(codes)
    }

    // Force training technique assignments from supervisor rules
    for (const rule of rules.filter((r) => r.enabled && r.type === "supervisor_requerido")) {
      const trainingTecCode = rule.params.training_tecnica_code as string | undefined
      if (!trainingTecCode) continue
      const supervisorId = rule.params.supervisor_id as string | undefined
      const traineeIds = rule.staff_ids.filter((id) => id !== supervisorId)
      for (const traineeId of traineeIds) {
        if (!workingStaff.some((s) => s.id === traineeId)) continue
        if (hardRemovals.has(traineeId)) continue
        const demandEntry = taskDemand.find((td) => td.code === trainingTecCode)
        if (!demandEntry) continue
        const traineeShift = demandEntry.typical_shifts.length > 0 ? demandEntry.typical_shifts[0] : dummyShift
        dayAssignments.push({ staff_id: traineeId, shift_type: traineeShift, function_label: trainingTecCode })
        staffTaskCount[traineeId] = (staffTaskCount[traineeId] ?? 0) + 1
        if (!staffTasks[traineeId]) staffTasks[traineeId] = new Set()
        staffTasks[traineeId].add(trainingTecCode)
        assignedStaffIds.add(traineeId)
        demandEntry.needed = Math.max(0, demandEntry.needed - 1)
      }
    }

    // Track which tasks have already been assigned via a linked group
    const assignedViaGroup = new Set<string>()

    for (const task of taskDemand) {
      // Skip tasks already filled as part of a linked group
      if (assignedViaGroup.has(task.key)) continue

      // Check if this task belongs to a linked group
      const group = linkedGroups.find((g) => g.includes(task.code))

      if (group) {
        // ── Linked group assignment: assign all grouped tasks to the same person
        const groupTasks = taskDemand.filter((td) => group.includes(td.code))
        const maxNeeded = Math.max(...groupTasks.map((td) => td.needed))

        // Find candidates qualified for ALL tasks in the group
        const candidates = workingStaff.filter((s) => {
          const skills = staffSkillsCache[s.id]
          if (!skills) return false
          return groupTasks.every((gt) => isQualified(skills, gt.code))
        })

        // Fallback: if no one is qualified for ALL, find candidates for the most tasks
        let bestCandidates = candidates
        if (candidates.length === 0) {
          const scored = workingStaff
            .map((s) => {
              const skills = staffSkillsCache[s.id]
              if (!skills) return { s, count: 0 }
              const count = groupTasks.filter((gt) => isQualified(skills, gt.code)).length
              return { s, count }
            })
            .filter((x) => x.count > 0)
            .sort((a, b) => b.count - a.count)
          bestCandidates = scored.map((x) => x.s)
          if (bestCandidates.length > 0) {
            warnings.push(`${date}: tecnicas_juntas — nadie cualificado para todas (${group.join("+")})`)
          }
        }

        // Sort candidates
        bestCandidates.sort((a, b) => {
          const aCount = staffTaskCount[a.id] ?? 0
          const bCount = staffTaskCount[b.id] ?? 0
          if (aCount !== bCount) return aCount - bCount
          return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
        })

        let filled = 0
        for (const candidate of bestCandidates) {
          if (filled >= maxNeeded) break
          const skills = staffSkillsCache[candidate.id]
          if (!skills) continue

          // Assign all group tasks this candidate is qualified for
          for (const gt of groupTasks) {
            if (!isQualified(skills, gt.code)) continue
            // Use the task's typical_shifts for shift_type, prefer candidate's preferred_shift
            const gtShift = gt.typical_shifts.length > 0
              ? (candidate.preferred_shift && gt.typical_shifts.includes(candidate.preferred_shift)
                ? candidate.preferred_shift
                : gt.typical_shifts[0])
              : dummyShift
            dayAssignments.push({
              staff_id: candidate.id,
              shift_type: gtShift,
              function_label: gt.code,
            })
            staffTaskCount[candidate.id] = (staffTaskCount[candidate.id] ?? 0) + 1
            if (!staffTasks[candidate.id]) staffTasks[candidate.id] = new Set()
            staffTasks[candidate.id].add(gt.code)
            assignedStaffIds.add(candidate.id)
          }
          filled++
        }

        // Mark all group tasks as handled
        for (const gt of groupTasks) {
          assignedViaGroup.add(gt.key)
          gt.needed = Math.max(0, gt.needed - filled)
        }

        if (filled < maxNeeded) {
          warnings.push(`${date}: COBERTURA INSUFICIENTE — ${group.join("+")} necesita ${maxNeeded}, asignados ${filled}`)
        }
        continue
      }

      // ── Standard (non-grouped) assignment
      // Resolve which shift this task belongs to: typical_shifts first, fallback to dummy
      const taskShiftCode = task.typical_shifts.length > 0
        ? task.typical_shifts[0]
        : dummyShift

      // Find qualified candidates (skill-based, no department filter)
      const candidates = workingStaff.filter((s) => {
        const skills = staffSkillsCache[s.id]
        return skills && isQualified(skills, task.code)
      })

      // Sort candidates
      candidates.sort((a, b) => {
        // Certified > training
        const aCert = staffSkillsCache[a.id]?.certified.has(task.code) ? 0 : 1
        const bCert = staffSkillsCache[b.id]?.certified.has(task.code) ? 0 : 1
        if (aCert !== bCert) return aCert - bCert
        // Prefer staff whose preferred_shift matches this task's shift
        if (task.typical_shifts.length > 0) {
          const aPref = a.preferred_shift === taskShiftCode ? 0 : 1
          const bPref = b.preferred_shift === taskShiftCode ? 0 : 1
          if (aPref !== bPref) return aPref - bPref
        }
        // Task rotation preference
        const aRot = taskRotationScore(a.id, task.code, dayIndex, deptTaskCodes[task.department] ?? [])
        const bRot = taskRotationScore(b.id, task.code, dayIndex, deptTaskCodes[task.department] ?? [])
        if (aRot !== bRot) return aRot - bRot
        // Fewest tasks assigned so far today
        const aCount = staffTaskCount[a.id] ?? 0
        const bCount = staffTaskCount[b.id] ?? 0
        if (aCount !== bCount) return aCount - bCount
        // Lowest workload
        return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
      })

      // For multi-shift tasks, distribute assignments across shifts
      // using round-robin or preferred_shift to balance rows
      const shiftCounters: Record<string, number> = {}
      if (task.typical_shifts.length > 1) {
        for (const sc of task.typical_shifts) shiftCounters[sc] = 0
      }

      let filled = 0
      for (const candidate of candidates) {
        if (filled >= task.needed) break

        const currentCount = staffTaskCount[candidate.id] ?? 0
        if (currentCount >= taskConflictThreshold) {
          // Soft: warn but still allow
          warnings.push(`${date}: ${candidate.first_name} ${candidate.last_name} exceeds task threshold (${currentCount + 1} > ${taskConflictThreshold})`)
        }

        // Pick shift_type: preferred_shift if it matches, otherwise round-robin across typical_shifts
        let assignShift = taskShiftCode
        if (task.typical_shifts.length > 1) {
          if (candidate.preferred_shift && task.typical_shifts.includes(candidate.preferred_shift)) {
            assignShift = candidate.preferred_shift
          } else {
            // Round-robin: pick the shift with fewest assignments so far
            assignShift = task.typical_shifts.reduce((best, sc) =>
              (shiftCounters[sc] ?? 0) < (shiftCounters[best] ?? 0) ? sc : best
            )
          }
          shiftCounters[assignShift] = (shiftCounters[assignShift] ?? 0) + 1
        }

        dayAssignments.push({
          staff_id: candidate.id,
          shift_type: assignShift,
          function_label: task.code,
        })
        staffTaskCount[candidate.id] = currentCount + 1
        if (!staffTasks[candidate.id]) staffTasks[candidate.id] = new Set()
        staffTasks[candidate.id].add(task.code)
        assignedStaffIds.add(candidate.id)
        filled++
      }

      if (filled < task.needed) {
        warnings.push(`${date}: COBERTURA INSUFICIENTE — ${task.code} necesita ${task.needed}, asignados ${filled}`)
      }

      // Warn if only training-level staff cover this task
      const assignedForTask = dayAssignments.filter((a) => a.function_label === task.code)
      if (assignedForTask.length > 0) {
        const allTraining = assignedForTask.every((a) => {
          return !staffSkillsCache[a.staff_id]?.certified.has(task.code)
        })
        if (allTraining) {
          warnings.push(`${date}: solo personal en formación para ${task.code}`)
        }
      }
    }

    // ── 2e-pre: tarea_multidepartamento — ensure departments are represented
    for (const rule of rules.filter((r) => r.enabled && r.type === "tarea_multidepartamento")) {
      const tecCode = rule.params.tecnica_code as string | undefined
      if (!tecCode) continue
      const requiredDepts = (rule.params.departments as string[] | undefined) ?? []
      if (requiredDepts.length === 0) continue
      const ruleDays = (rule.params.days as string[] | undefined) ?? []
      if (ruleDays.length > 0 && !ruleDays.includes(dayCode)) continue

      // Which departments already have someone assigned to this task?
      const assignedDepts = new Set<string>()
      for (const a of dayAssignments) {
        if (a.function_label !== tecCode) continue
        const s = workingStaff.find((st) => st.id === a.staff_id)
        if (s) assignedDepts.add(s.role)
      }

      for (const dept of requiredDepts) {
        if (assignedDepts.has(dept)) continue
        // Need to add someone from this department
        const candidates = workingStaff.filter((s) => {
          if (s.role !== dept) return false
          if (dayAssignments.some((a) => a.staff_id === s.id && a.function_label === tecCode)) return false
          const skills = staffSkillsCache[s.id]
          return skills && isQualified(skills, tecCode)
        }).sort((a, b) => {
          const aCount = staffTaskCount[a.id] ?? 0
          const bCount = staffTaskCount[b.id] ?? 0
          if (aCount !== bCount) return aCount - bCount
          return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
        })

        if (candidates.length > 0) {
          const pick = candidates[0]
          dayAssignments.push({ staff_id: pick.id, shift_type: dummyShift, function_label: tecCode })
          staffTaskCount[pick.id] = (staffTaskCount[pick.id] ?? 0) + 1
          if (!staffTasks[pick.id]) staffTasks[pick.id] = new Set()
          staffTasks[pick.id].add(tecCode)
          assignedStaffIds.add(pick.id)
          assignedDepts.add(dept)
        } else if (rule.is_hard) {
          warnings.push(`${date}: tarea_multidepartamento — no hay personal de ${dept} cualificado para ${tecCode} (regla obligatoria)`)
        } else {
          warnings.push(`${date}: tarea_multidepartamento — no hay personal de ${dept} cualificado para ${tecCode}`)
        }
      }
    }

    // ── 2e: Apply no_misma_tarea rules ──────────────────────────────────

    for (const rule of rules.filter((r) => r.enabled && r.type === "no_misma_tarea")) {
      const ruleStaffIds = new Set(rule.staff_ids)
      const taskToStaff: Record<string, string[]> = {}
      for (const a of dayAssignments) {
        if (!taskToStaff[a.function_label]) taskToStaff[a.function_label] = []
        taskToStaff[a.function_label].push(a.staff_id)
      }

      for (const [taskCode, staffIds] of Object.entries(taskToStaff)) {
        const conflicting = staffIds.filter((id) => ruleStaffIds.has(id))
        if (conflicting.length <= 1) continue

        if (rule.is_hard) {
          for (let i = 1; i < conflicting.length; i++) {
            const staffId = conflicting[i]
            const skills = staffSkillsCache[staffId]
            const currentTasks = staffTasks[staffId] ?? new Set()
            // Try reassign to another task
            const altTask = taskDemand.find((t) =>
              t.code !== taskCode &&
              !currentTasks.has(t.code) &&
              skills && isQualified(skills, t.code)
            )
            const idx = dayAssignments.findIndex((a) => a.staff_id === staffId && a.function_label === taskCode)
            if (altTask && idx >= 0) {
              dayAssignments[idx].function_label = altTask.code
              currentTasks.delete(taskCode)
              currentTasks.add(altTask.code)
            } else if (idx >= 0) {
              dayAssignments.splice(idx, 1)
              staffTaskCount[staffId] = (staffTaskCount[staffId] ?? 1) - 1
              currentTasks.delete(taskCode)
              const name = staff.find((s) => s.id === staffId)?.first_name ?? staffId
              warnings.push(`${date}: ${name} retirado de ${taskCode} (no_misma_tarea)`)
            }
          }
        } else {
          const names = conflicting.map((id) => staff.find((s) => s.id === id)?.first_name ?? id)
          warnings.push(`${date}: ${names.join(" + ")} asignados a ${taskCode} (no_misma_tarea, soft)`)
        }
      }
    }

    // ── 2f: Budget-filling + group-extension passes ─────────────────────────
    fillBudgets({
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
    })

    // ── 2f: Determine OFF staff ─────────────────────────────────────────

    const offStaff = staff.filter((s) => {
      if (!isAvailable(s, date)) return false
      return !assignedStaffIds.has(s.id)
    }).map((s) => s.id)

    // ── 2g: Skill gap detection ─────────────────────────────────────────

    const skillGaps: SkillName[] = []
    for (const tec of tecnicas) {
      const hasAssigned = dayAssignments.some((a) => a.function_label === tec.codigo)
      if (!hasAssigned) {
        // Check if any working staff could do it (even if no demand)
        const anyQualified = workingStaff.some((s) => {
          const skills = staffSkillsCache[s.id]
          return skills && isQualified(skills, tec.codigo)
        })
        if (!anyQualified) {
          skillGaps.push(tec.codigo as SkillName)
        }
      }
    }

    // Apply asignacion_fija shift overrides
    for (const a of dayAssignments) {
      const overrideShift = fixedShiftOverrides[a.staff_id]
      if (overrideShift) a.shift_type = overrideShift
    }

    days.push({ date, assignments: dayAssignments, offStaff, skillGaps })

    // Update counters
    for (const staffId of assignedStaffIds) {
      weeklyDayCount[staffId] = (weeklyDayCount[staffId] ?? 0) + 1
      workloadScore[staffId] = (workloadScore[staffId] ?? 0) + 1
    }

    // Update assignment lookup for consecutive-days rule
    if (!assignedByDate[date]) assignedByDate[date] = new Set()
    for (const staffId of assignedStaffIds) {
      assignedByDate[date].add(staffId)
    }
  }

  // ── Post-plan: no_librar_mismo_dia warnings ───────────────────────────────
  checkNoLibrarMismoDia(days, rules, staff, warnings)

  return { days, warnings }
}
