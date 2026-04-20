import type {
  StaffWithSkills,
  Leave,
  RotaAssignment,
  LabConfig,
  RotaRule,
  ShiftType,
  ShiftTypeDefinition,
  ShiftCoverageByDay,
  SkillName,
} from "@/lib/types/database"

export interface DayPlan {
  date: string
  assignments: { staff_id: string; shift_type: ShiftType }[]
  skillGaps: SkillName[]
}

export interface TaskAssignment {
  staff_id: string
  tecnica_code: string
  date: string
}

export interface RotaEngineResult {
  days: DayPlan[]
  taskAssignments: TaskAssignment[]
  warnings: string[]
}

export interface EngineParams {
  weekStart: string              // ISO Monday
  staff: StaffWithSkills[]
  leaves: Leave[]
  recentAssignments: RotaAssignment[]  // last ~4 weeks, used for workload scoring
  labConfig: LabConfig
  shiftTypes?: ShiftTypeDefinition[]   // org shift catalogue — used to fill all shifts
  punctionsOverride?: Record<string, number>  // per-date overrides from rota record
  rules?: RotaRule[]             // enabled scheduling rules
  tecnicas?: { codigo: string; department?: string; typical_shifts: string[]; avoid_shifts?: string[] }[]
  shiftRotation?: "stable" | "weekly" | "daily"
  taskCoverageEnabled?: boolean
  taskCoverageByDay?: Record<string, Record<string, number>> | null  // tecnica_code → { mon: N, ... }
  shiftCoverageEnabled?: boolean
  shiftCoverageByDay?: ShiftCoverageByDay | null // shift_code → { day: { lab, andrology, admin } }
  publicHolidays?: Record<string, string>  // date → holiday name
}
