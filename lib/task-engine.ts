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

import type {
  StaffWithSkills,
  Leave,
  RotaAssignment,
  LabConfig,
  RotaRule,
  ShiftTypeDefinition,
  SkillName,
  WorkingDay,
} from "@/lib/types/database"

import { getWeekDates } from "@/lib/rota-engine"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TaskDayPlan {
  date: string
  /** Every assignment has a task (function_label). One staff can appear multiple times. */
  assignments: { staff_id: string; shift_type: string; function_label: string }[]
  /** Staff available but not assigned to any task */
  offStaff: string[]
  skillGaps: SkillName[]
}

export interface TaskEngineResult {
  days: TaskDayPlan[]
  warnings: string[]
}

export interface TaskEngineParams {
  weekStart: string
  staff: StaffWithSkills[]
  leaves: Leave[]
  recentAssignments: RotaAssignment[]
  labConfig: LabConfig
  shiftTypes?: ShiftTypeDefinition[]
  rules?: RotaRule[]
  tecnicas: {
    codigo: string
    department: string
    typical_shifts?: string[]
    avoid_shifts?: string[]
  }[]
  taskRotation?: "stable" | "weekly" | "daily"
  taskCoverageEnabled?: boolean
  taskCoverageByDay?: Record<string, Record<string, number>> | null
  /** Recent task assignments for rotation inference: staff_id → tecnica_code[] */
  recentTaskAssignments?: { staff_id: string; tecnica_code: string; date: string }[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const WEEKDAY_CODES: WorkingDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

function getDayCode(isoDate: string): WorkingDay {
  return WEEKDAY_CODES[new Date(isoDate + "T12:00:00").getDay()]
}

function isWeekend(isoDate: string): boolean {
  const code = getDayCode(isoDate)
  return code === "sat" || code === "sun"
}

function addDaysStr(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

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

  // Active técnicas grouped by department
  const tecByDept: Record<string, typeof tecnicas> = {}
  for (const t of tecnicas) {
    const dept = t.department || "lab"
    if (!tecByDept[dept]) tecByDept[dept] = []
    tecByDept[dept].push(t)
  }

  // Task conflict threshold (soft)
  const taskConflictThreshold = (labConfig as any).task_conflict_threshold ?? 3

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
      const iso = d.toISOString().split("T")[0]
      if (!leaveMap[leave.staff_id]) leaveMap[leave.staff_id] = new Set()
      leaveMap[leave.staff_id].add(iso)
    }
  }

  // Days-off preference
  const daysOffPref = (labConfig as any).days_off_preference as
    | "always_weekend"
    | "prefer_weekend"
    | "any_day"
    | undefined ?? "prefer_weekend"

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
      const iso = d.toISOString().split("T")[0]
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
  // Reserve budget so every day meets its department minimums before tasks
  // are distributed. Same approach as the shift engine's Phase 1.

  const minCoverageReserved: Record<string, Set<string>> = {}

  for (const date of allWeekDates) {
    minCoverageReserved[date] = new Set()
    const dayCode = getDayCode(date)
    const wknd = isWeekend(date)
    const dayCoverage = labConfig.coverage_by_day?.[dayCode]

    for (const role of ["lab", "andrology", "admin"] as const) {
      const required = dayCoverage?.[role] ?? (role === "lab" ? labConfig.min_lab_coverage : role === "andrology" ? labConfig.min_andrology_coverage : 0)
      if (required <= 0) continue

      const eligible = staff.filter((s) => {
        if (s.onboarding_status === "inactive" || s.role !== role) return false
        if (s.start_date > date || (s.end_date && s.end_date < date)) return false
        if (leaveMap[s.id]?.has(date)) return false
        const reserved = Object.values(minCoverageReserved).filter((set) => set.has(s.id)).length
        return reserved < (s.days_per_week ?? 5)
      }).sort((a, b) => {
        const aRes = Object.values(minCoverageReserved).filter((set) => set.has(a.id)).length
        const bRes = Object.values(minCoverageReserved).filter((set) => set.has(b.id)).length
        if (aRes !== bRes) return aRes - bRes
        const aInPattern = (!a.working_pattern?.length || a.working_pattern.includes(dayCode)) ? 0 : 1
        const bInPattern = (!b.working_pattern?.length || b.working_pattern.includes(dayCode)) ? 0 : 1
        if (aInPattern !== bInPattern) return aInPattern - bInPattern
        if (daysOffPref === "prefer_weekend" && wknd) {
          const aWknd = Object.entries(minCoverageReserved).filter(([d, s]) => isWeekend(d) && s.has(a.id)).length
          const bWknd = Object.entries(minCoverageReserved).filter(([d, s]) => isWeekend(d) && s.has(b.id)).length
          if (aWknd !== bWknd) return aWknd - bWknd
        }
        return (workloadScore[a.id] ?? 0) - (workloadScore[b.id] ?? 0)
      })

      for (let i = 0; i < Math.min(required, eligible.length); i++) {
        minCoverageReserved[date].add(eligible[i].id)
      }
    }
  }

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

    const hardRemovals = new Set<string>()

    if (rules.length > 0) {
      const dateMonth = date.slice(0, 7)
      const weekendCountThisMonth: Record<string, number> = {}
      for (const a of recentAssignments) {
        if (a.date.slice(0, 7) === dateMonth && isWeekend(a.date)) {
          weekendCountThisMonth[a.staff_id] = (weekendCountThisMonth[a.staff_id] ?? 0) + 1
        }
      }

      for (const rule of rules.filter((r) => r.enabled)) {
        const affectedIds = rule.staff_ids.length > 0 ? new Set(rule.staff_ids) : null
        const affects = (id: string) => affectedIds === null || affectedIds.has(id)

        if (rule.type === "max_dias_consecutivos") {
          const maxDays = (rule.params.maxDays as number) ?? 5
          for (const s of eligibleStaff) {
            if (!affects(s.id)) continue
            if (consecutiveDaysBefore(s.id, date) >= maxDays) {
              if (rule.is_hard) {
                hardRemovals.add(s.id)
                warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — ${maxDays} días consecutivos (regla obligatoria)`)
              } else {
                warnings.push(`${date}: ${s.first_name} ${s.last_name} lleva ${maxDays} días consecutivos`)
              }
            }
          }
        }

        if (rule.type === "distribucion_fines_semana" && weekend) {
          const maxPerMonth = (rule.params.maxPerMonth as number) ?? 2
          for (const s of eligibleStaff) {
            if (!affects(s.id)) continue
            if ((weekendCountThisMonth[s.id] ?? 0) >= maxPerMonth) {
              if (rule.is_hard) {
                hardRemovals.add(s.id)
                warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — ${maxPerMonth} fines de semana este mes (regla obligatoria)`)
              } else {
                warnings.push(`${date}: ${s.first_name} ${s.last_name} lleva ${maxPerMonth} fines de semana este mes`)
              }
            }
          }
        }

        if (rule.type === "no_coincidir") {
          const ruleStaff = rule.staff_ids
          if (ruleStaff.length >= 2) {
            const present = eligibleStaff.filter((s) => ruleStaff.includes(s.id) && !hardRemovals.has(s.id))
            if (present.length >= 2 && rule.is_hard) {
              // Remove the one with lower workload (keep the busier one)
              present.sort((a, b) => (workloadScore[b.id] ?? 0) - (workloadScore[a.id] ?? 0))
              for (let i = 1; i < present.length; i++) {
                if (!reservedIds.has(present[i].id)) {
                  hardRemovals.add(present[i].id)
                }
              }
              const removedNames = present.slice(1).filter((s) => !reservedIds.has(s.id)).map((s) => s.first_name)
              if (removedNames.length > 0) {
                warnings.push(`${date}: ${removedNames.join(", ")} retirado — no coincidir con ${present[0].first_name} (regla obligatoria)`)
              }
            } else if (present.length >= 2) {
              warnings.push(`${date}: ${present.map((s) => s.first_name).join(" + ")} assigned together (no_coincidir, soft)`)
            }
          }
        }

        if (rule.type === "descanso_fin_de_semana" && weekend) {
          const recovery = (rule.params.recovery as string) ?? "following"
          const restDays = (rule.params.restDays as number) ?? 2

          for (const s of eligibleStaff) {
            if (!affects(s.id)) continue
            const dayCode = getDayCode(date)
            const prevSat = addDaysStr(date, -(dayCode === "sat" ? 7 : 8))
            const prevSun = addDaysStr(date, -(dayCode === "sun" ? 7 : 6))
            const workedLastWeekend = recentAssignments.some(
              (a) => a.staff_id === s.id && (a.date === prevSat || a.date === prevSun)
            )

            if (recovery === "following" && workedLastWeekend) {
              if (rule.is_hard) {
                hardRemovals.add(s.id)
                warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — trabajó el fin de semana pasado (regla obligatoria)`)
              } else {
                warnings.push(`${date}: ${s.first_name} ${s.last_name} worked last weekend — needs rest (descanso_fin_de_semana)`)
              }
            } else if (recovery === "previous" && workedLastWeekend) {
              if (rule.is_hard) {
                hardRemovals.add(s.id)
                warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — fines de semana alternos (regla obligatoria)`)
              } else {
                warnings.push(`${date}: ${s.first_name} ${s.last_name} worked last weekend — alternating weekends required`)
              }
            }
          }

          // Rest days after weekend (weekday check)
          if (restDays > 0 && !weekend) {
            for (const s of eligibleStaff) {
              if (!affects(s.id)) continue
              const lastWorkedWeekend = [...recentAssignments]
                .filter((a) => a.staff_id === s.id && isWeekend(a.date))
                .sort((a, b) => b.date.localeCompare(a.date))[0]
              if (!lastWorkedWeekend) continue
              const diffMs = new Date(date + "T12:00:00").getTime() - new Date(lastWorkedWeekend.date + "T12:00:00").getTime()
              const diffDays = Math.round(diffMs / 86400000)
              if (diffDays > 0 && diffDays <= restDays) {
                if (rule.is_hard) {
                  hardRemovals.add(s.id)
                  warnings.push(`${date}: ${s.first_name} ${s.last_name} descansa — necesita ${restDays} días de descanso tras fin de semana (regla obligatoria)`)
                } else {
                  warnings.push(`${date}: ${s.first_name} ${s.last_name} needs ${restDays} rest days after weekend`)
                }
              }
            }
          }
        }
      }
    }

    // asignacion_fija: force-include staff on specified days, prevent hard removals
    const fixedShiftOverrides: Record<string, string> = {} // staff_id → forced shift code
    for (const rule of rules.filter((r) => r.enabled && r.type === "asignacion_fija")) {
      const fixedShift = rule.params.fixedShift as string | undefined
      const fixedDays = (rule.params.fixedDays as string[] | undefined) ?? []
      if (fixedDays.length > 0 && !fixedDays.includes(dayCode)) continue
      for (const staffId of rule.staff_ids) {
        const s = eligibleStaff.find((st) => st.id === staffId)
        if (!s) continue
        if (rule.is_hard) {
          hardRemovals.delete(staffId) // override any earlier hard removal
          if (fixedShift) fixedShiftOverrides[staffId] = fixedShift
          warnings.push(`${date}: ${s.first_name} ${s.last_name} — asignación fija${fixedShift ? ` (${fixedShift})` : ""}`)
        } else if (hardRemovals.has(staffId)) {
          warnings.push(`${date}: ${s.first_name} ${s.last_name} no asignado — asignación fija no cumplida (regla blanda)`)
        }
      }
    }

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
      code: string
      department: string
      needed: number
    }

    const taskDemand: TaskDemand[] = []

    if (taskCoverageEnabled && taskCoverageByDay && Object.keys(taskCoverageByDay).length > 0) {
      // Explicit per-task coverage
      for (const [tecCode, dayCov] of Object.entries(taskCoverageByDay)) {
        const needed = dayCov[dayCode] ?? 0
        if (needed <= 0) continue
        const tec = tecnicas.find((t) => t.codigo === tecCode)
        if (!tec) continue
        taskDemand.push({ code: tecCode, needed, department: tec.department || "lab" })
      }
    } else {
      // Fallback: at least 1 person per active technique
      for (const tec of tecnicas) {
        taskDemand.push({
          code: tec.codigo,
          needed: 1,
          department: tec.department || "lab",
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
        dayAssignments.push({ staff_id: traineeId, shift_type: dummyShift, function_label: trainingTecCode })
        staffTaskCount[traineeId] = (staffTaskCount[traineeId] ?? 0) + 1
        if (!staffTasks[traineeId]) staffTasks[traineeId] = new Set()
        staffTasks[traineeId].add(trainingTecCode)
        assignedStaffIds.add(traineeId)
        demandEntry.needed = Math.max(0, demandEntry.needed - 1)
      }
    }

    for (const task of taskDemand) {
      // Find qualified candidates
      const candidates = workingStaff.filter((s) => {
        if (s.role !== task.department) return false
        const skills = staffSkillsCache[s.id]
        return skills && isQualified(skills, task.code)
      })

      // Sort candidates
      candidates.sort((a, b) => {
        // Certified > training
        const aCert = staffSkillsCache[a.id]?.certified.has(task.code) ? 0 : 1
        const bCert = staffSkillsCache[b.id]?.certified.has(task.code) ? 0 : 1
        if (aCert !== bCert) return aCert - bCert
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

      let filled = 0
      for (const candidate of candidates) {
        if (filled >= task.needed) break

        const currentCount = staffTaskCount[candidate.id] ?? 0
        if (currentCount >= taskConflictThreshold) {
          // Soft: warn but still allow
          warnings.push(`${date}: ${candidate.first_name} ${candidate.last_name} exceeds task threshold (${currentCount + 1} > ${taskConflictThreshold})`)
        }

        dayAssignments.push({
          staff_id: candidate.id,
          shift_type: dummyShift,
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

  // ── Post-plan: Repair no_librar_mismo_dia violations ──────────────────────
  for (const rule of rules.filter((r) => r.enabled && r.type === "no_librar_mismo_dia" && r.is_hard && r.staff_ids.length >= 2)) {
    for (const dayPlan of days) {
      const assignedIds = new Set(dayPlan.assignments.map((a) => a.staff_id))
      const offIds = new Set(dayPlan.offStaff)
      const conflictOff = rule.staff_ids.filter((id) => !assignedIds.has(id) && offIds.has(id))
      // Only act if ALL conflict members are off
      if (conflictOff.length < rule.staff_ids.length) continue

      warnings.push(
        `${dayPlan.date}: no_librar_mismo_dia — ${conflictOff.map((id) => staff.find((s) => s.id === id)?.first_name ?? id).join(" + ")} todos libres`
      )
    }
  }
  // Soft no_librar_mismo_dia: just warn
  for (const rule of rules.filter((r) => r.enabled && r.type === "no_librar_mismo_dia" && !r.is_hard && r.staff_ids.length >= 2)) {
    for (const dayPlan of days) {
      const assignedIds = new Set(dayPlan.assignments.map((a) => a.staff_id))
      const offIds = new Set(dayPlan.offStaff)
      const conflictOff = rule.staff_ids.filter((id) => !assignedIds.has(id) && offIds.has(id))
      if (conflictOff.length < rule.staff_ids.length) continue
      warnings.push(
        `${dayPlan.date}: no_librar_mismo_dia — ${conflictOff.map((id) => staff.find((s) => s.id === id)?.first_name ?? id).join(" + ")} todos libres (regla blanda)`
      )
    }
  }

  return { days, warnings }
}
