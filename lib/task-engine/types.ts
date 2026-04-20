import type {
  StaffWithSkills,
  Leave,
  RotaAssignment,
  LabConfig,
  RotaRule,
  ShiftTypeDefinition,
  SkillName,
} from "@/lib/types/database"

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
