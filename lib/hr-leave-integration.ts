/**
 * HR Module — Leave Entry Integration
 *
 * Computes HR module fields (days_counted, balance_year, cf_days, overflow)
 * when saving a leave entry. Called from leave actions when HR module is active.
 */

import { createAdminClient } from "@/lib/supabase/admin"
import { countDays, getLeaveYear, calculateBalance } from "@/lib/hr-balance-engine"
import type {
  HolidayConfig,
  CompanyLeaveType,
  HolidayBalance,
  Leave,
} from "@/lib/types/database"
import type { DayCountConfig } from "@/lib/hr-balance-engine"

export interface HrLeaveFields {
  leave_type_id: string | null
  days_counted: number | null
  balance_year: number | null
  uses_cf_days: boolean
  cf_days_used: number
}

export interface OverflowResult {
  needed: boolean
  overflowDays: number
  overflowTypeId: string | null
  overflowTypeName: string | null
  mainDays: number
}

/**
 * Check if HR module is active for this org.
 */
export async function isHrModuleActive(orgId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("hr_module")
    .select("status")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { status: string } | null }

  return data?.status === "active"
}

/**
 * Compute HR fields for a leave entry being saved.
 */
export async function computeHrLeaveFields(params: {
  orgId: string
  staffId: string
  leaveTypeId: string
  startDate: string
  endDate: string
}): Promise<HrLeaveFields & { overflow: OverflowResult }> {
  const admin = createAdminClient()

  // Get config
  const { data: config } = await admin
    .from("holiday_config")
    .select("*")
    .eq("organisation_id", params.orgId)
    .single() as { data: HolidayConfig | null }

  if (!config) {
    return {
      leave_type_id: params.leaveTypeId,
      days_counted: null,
      balance_year: null,
      uses_cf_days: false,
      cf_days_used: 0,
      overflow: { needed: false, overflowDays: 0, overflowTypeId: null, overflowTypeName: null, mainDays: 0 },
    }
  }

  const dayConfig: DayCountConfig = {
    counting_method: config.counting_method,
    weekends_deducted: config.weekends_deducted,
    public_holidays_deducted: config.public_holidays_deducted,
  }

  // Count days
  const daysCounted = countDays(params.startDate, params.endDate, dayConfig, [])

  // Get leave year
  const balanceYear = getLeaveYear(
    params.startDate,
    config.leave_year_start_month,
    config.leave_year_start_day
  )

  // Get leave type info
  const { data: leaveType } = await admin
    .from("company_leave_types")
    .select("*")
    .eq("id", params.leaveTypeId)
    .single() as { data: CompanyLeaveType | null }

  if (!leaveType || !leaveType.has_balance) {
    return {
      leave_type_id: params.leaveTypeId,
      days_counted: daysCounted,
      balance_year: balanceYear,
      uses_cf_days: false,
      cf_days_used: 0,
      overflow: { needed: false, overflowDays: 0, overflowTypeId: null, overflowTypeName: null, mainDays: daysCounted },
    }
  }

  // Get balance record
  const { data: balance } = await admin
    .from("holiday_balance")
    .select("*")
    .eq("organisation_id", params.orgId)
    .eq("staff_id", params.staffId)
    .eq("leave_type_id", params.leaveTypeId)
    .eq("year", balanceYear)
    .maybeSingle() as { data: HolidayBalance | null }

  // Get existing leave entries for balance calc
  const { data: existingLeaves } = await admin
    .from("leaves")
    .select("start_date, end_date, status, days_counted")
    .eq("organisation_id", params.orgId)
    .eq("staff_id", params.staffId)
    .eq("leave_type_id", params.leaveTypeId)
    .eq("balance_year", balanceYear)
    .in("status", ["approved", "pending"]) as { data: Array<{ start_date: string; end_date: string; status: string; days_counted: number | null }> | null }

  const today = new Date().toISOString().slice(0, 10)

  const currentBalance = calculateBalance({
    entitlement: balance?.entitlement ?? leaveType.default_days ?? 0,
    carried_forward: balance?.carried_forward ?? 0,
    cf_expiry_date: balance?.cf_expiry_date ?? null,
    manual_adjustment: balance?.manual_adjustment ?? 0,
    today,
    leaveEntries: existingLeaves ?? [],
    config: dayConfig,
    publicHolidays: [],
  })

  // CF deduction logic
  let usesCfDays = false
  let cfDaysUsed = 0

  if (
    currentBalance.cf_available > 0 &&
    config.carry_forward_allowed &&
    balance?.cf_expiry_date
  ) {
    const cfExpiry = new Date(balance.cf_expiry_date)
    const startDate = new Date(params.startDate)
    if (startDate <= cfExpiry) {
      usesCfDays = true
      cfDaysUsed = Math.min(currentBalance.cf_available, daysCounted)
    }
  }

  // Overflow check
  const availableAfter = currentBalance.available - daysCounted
  let overflow: OverflowResult = {
    needed: false,
    overflowDays: 0,
    overflowTypeId: null,
    overflowTypeName: null,
    mainDays: daysCounted,
  }

  if (availableAfter < 0 && leaveType.overflow_to_type_id) {
    const { data: overflowType } = await admin
      .from("company_leave_types")
      .select("id, name")
      .eq("id", leaveType.overflow_to_type_id)
      .single() as { data: { id: string; name: string } | null }

    if (overflowType) {
      const overflowDays = Math.abs(availableAfter)
      const mainDays = daysCounted - overflowDays
      overflow = {
        needed: true,
        overflowDays,
        overflowTypeId: overflowType.id,
        overflowTypeName: overflowType.name,
        mainDays: Math.max(mainDays, 0),
      }
    }
  }

  return {
    leave_type_id: params.leaveTypeId,
    days_counted: daysCounted,
    balance_year: balanceYear,
    uses_cf_days: usesCfDays,
    cf_days_used: cfDaysUsed,
    overflow,
  }
}

/**
 * Create an overflow companion leave entry.
 */
export async function createOverflowEntry(params: {
  orgId: string
  staffId: string
  parentLeaveId: string
  overflowTypeId: string
  startDate: string
  endDate: string
  overflowDays: number
  balanceYear: number
  notes: string | null
}): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { error } = await admin.from("leaves").insert({
    organisation_id: params.orgId,
    staff_id: params.staffId,
    type: "other",
    start_date: params.startDate,
    end_date: params.endDate,
    status: "approved",
    leave_type_id: params.overflowTypeId,
    days_counted: params.overflowDays,
    balance_year: params.balanceYear,
    parent_leave_id: params.parentLeaveId,
    notes: params.notes,
  })

  if (error) return { error: error.message }
  return {}
}
