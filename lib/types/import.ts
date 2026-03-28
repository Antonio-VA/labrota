export interface ExtractedStaff {
  name: string
  department: string
  shift_preference: string
  observed_days: string[]
  included: boolean
}

export interface ExtractedShift {
  code: string
  name: string
  start: string
  end: string
  included: boolean
}

export interface ExtractedTechnique {
  name: string
  code: string
  department: string
  included: boolean
}

export interface ExtractedRule {
  type: string
  description: string
  staff_involved: string[]
  confidence: number
  observed_count: number
  total_weeks: number
  accepted: boolean
}

export interface ExtractedRotaMode {
  type: "by_task" | "by_shift"
  confidence: number
  reasoning: string
}

export interface ExtractedTaskCoverage {
  task_code: string
  typical_staff_count: number
  min_observed: number
  max_observed: number
}

export interface ExtractedData {
  staff: ExtractedStaff[]
  shifts: ExtractedShift[]
  techniques: ExtractedTechnique[]
  rules: ExtractedRule[]
  rota_mode?: ExtractedRotaMode
  task_coverage?: ExtractedTaskCoverage[]
}

export interface ProcessedFile {
  type: "text" | "image"
  content?: string
  base64?: string
  mediaType?: string
  fileName: string
}

export interface ImportResult {
  success: boolean
  counts?: { staff: number; shifts: number; techniques: number; rules: number }
  error?: string
}
