export interface ExtractedAssignment {
  staff_name: string
  date: string
  shift_code: string
  task_codes?: string[]
}

export interface ExtractedDayOff {
  staff_name: string
  date: string
}

export interface ExtractedRota {
  assignments: ExtractedAssignment[]
  date_range: { start: string; end: string }
  days_off: ExtractedDayOff[]
  unrecognised_shifts: string[]
}

export interface StaffMatch {
  file_name: string
  staff_id: string
  staff_label: string
  confidence: "exact" | "fuzzy" | "none"
}

export interface ShiftMatch {
  file_code: string
  db_code: string
  db_label: string
  confidence: "exact" | "name" | "none"
}

export interface DbStaff {
  id: string
  first_name: string
  last_name: string
  role: string
}

export interface DbShift {
  code: string
  name_es: string
}
