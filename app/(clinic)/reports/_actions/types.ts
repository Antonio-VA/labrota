export interface StaffReportRow {
  staffId: string
  firstName: string
  lastName: string
  department: string
  color: string
  assignments: number // days with at least one assignment (by_shift) or total technique assignments (by_task)
  daysOff: number     // days with no assignment and no leave
  daysLeave: number   // days covered by leave
  vsMean: number      // difference from average
}

export interface StaffReportData {
  orgName: string
  periodLabel: string
  from: string
  to: string
  totalDays: number
  meanAssignments: number
  activeStaff: number
  rows: StaffReportRow[]
  mode: "by_shift" | "by_task"
}

export interface TechReportRow {
  codigo: string
  nombre: string
  color: string
  daysCovered: number
  daysUncovered: number
  coveragePct: number
  qualifiedStaff: number
}

export interface TechReportData {
  orgName: string
  periodLabel: string
  from: string
  to: string
  totalDays: number
  techniqueCount: number
  daysWithGaps: number
  rows: TechReportRow[]
}
export interface ExtraDaysRow {
  staffId: string
  firstName: string
  lastName: string
  department: string
  color: string
  daysPerWeek: number
  totalExtra: number
  weeks: { weekStart: string; assigned: number; extra: number }[]
}

export interface ExtraDaysData {
  orgName: string
  periodLabel: string
  month: string
  totalStaffWithExtra: number
  totalExtraDays: number
  rows: ExtraDaysRow[]
}

export interface LeaveReportRow {
  leaveId: string
  staffName: string
  department: string
  color: string
  type: string
  startDate: string
  endDate: string
  days: number
  notes: string | null
}

export interface LeaveReportData {
  orgName: string
  periodLabel: string
  from: string
  to: string
  totalLeaves: number
  totalDays: number
  rows: LeaveReportRow[]
}

export interface SwapReportRow {
  id: string
  initiatorName: string
  targetName: string | null
  swapType: string       // "shift_swap" | "day_off"
  swapDate: string
  shiftType: string
  status: string
  requestedAt: string
  managerReviewedAt: string | null
  targetRespondedAt: string | null
}

export interface SwapReportData {
  orgName: string
  periodLabel: string
  from: string
  to: string
  totalRequests: number
  approved: number
  rejected: number
  pending: number
  cancelled: number
  rows: SwapReportRow[]
}

export interface UnpaidLeaveReportRow {
  staffId: string
  staffName: string
  department: string
  color: string
  unpaidLeaveDays: number
  unpaidSickDays: number
  totalUnpaid: number
}

export interface UnpaidLeaveReportData {
  orgName: string
  periodLabel: string
  from: string
  to: string
  totalStaff: number
  totalUnpaidDays: number
  rows: UnpaidLeaveReportRow[]
}

