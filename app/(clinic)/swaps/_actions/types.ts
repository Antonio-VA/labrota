import type { SwapRequest } from "@/lib/types/database"

export interface SwapCandidate {
  staffId: string
  firstName: string
  lastName: string
  role: string
  shiftType: string | null  // their current shift on swap_date (null = day off)
  assignmentId: string | null
  coverageWarning: string | null
}

export interface DayOffCandidate {
  staffId: string
  firstName: string
  lastName: string
  role: string
  weeklyAssignments: Array<{ date: string; shiftType: string; assignmentId: string }>
}

export interface SwapRequestWithNames extends SwapRequest {
  initiatorName: string
  targetName: string | null
}

export interface ExchangeOption {
  date: string
  shiftType: string
  assignmentId: string
}
