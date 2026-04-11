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

/** LEGACY type string → name fragments to match against company_leave_type names */
const LEGACY_NAME_MAP: Record<string, string[]> = {
  annual:    ["vacaciones", "annual", "vacation", "holiday"],
  sick:      ["enfermedad", "sick", "illness"],
  personal:  ["personal"],
  training:  ["formaci", "training"],
  maternity: ["maternidad", "maternity", "paternidad", "paternity"],
}

function legacyTypeMatchesCompanyType(lt: CompanyLeaveType, legacyType: string): boolean {
  const frags = LEGACY_NAME_MAP[legacyType] ?? []
  if (!frags.length) return false
  const n = lt.name.toLowerCase()
  const ne = (lt.name_en ?? "").toLowerCase()
  return frags.some((f) => n.includes(f) || ne.includes(f))
}

export interface BalanceCheckResult {
  found: boolean
  leaveTypeId: string | null
  leaveTypeName: string | null
  available: number
  daysCounted: number
  overflow: OverflowResult
  /** true = controlled, no overflow type, request exceeds available → block */
  blocked: boolean
}

/**
 * Check whether a leave request from a viewer would exceed the available balance.
 * Uses the legacy `type` string to find the matching company_leave_type.
 */
export async function checkLeaveRequestBalance(params: {
  orgId: string
  staffId: string
  legacyType: string
  startDate: string
  endDate: string
}): Promise<BalanceCheckResult> {
  const empty: BalanceCheckResult = {
    found: false, leaveTypeId: null, leaveTypeName: null,
    available: 0, daysCounted: 0,
    overflow: { needed: false, overflowDays: 0, overflowTypeId: null, overflowTypeName: null, mainDays: 0 },
    blocked: false,
  }

  const admin = createAdminClient()

  const { data: config } = await admin
    .from("holiday_config")
    .select("*")
    .eq("organisation_id", params.orgId)
    .single() as { data: HolidayConfig | null }
  if (!config) return empty

  const { data: leaveTypes } = await admin
    .from("company_leave_types")
    .select("*")
    .eq("organisation_id", params.orgId)
    .eq("has_balance", true)
    .eq("is_archived", false)
    .order("sort_order") as { data: CompanyLeaveType[] | null }
  if (!leaveTypes?.length) return empty

  const leaveType = leaveTypes.find((lt) => legacyTypeMatchesCompanyType(lt, params.legacyType))
  if (!leaveType) return empty

  const dayConfig: DayCountConfig = {
    counting_method: config.counting_method,
    public_holidays_deducted: config.public_holidays_deducted,
  }
  const daysCounted = countDays(params.startDate, params.endDate, dayConfig, [])
  const balanceYear = getLeaveYear(params.startDate, config.leave_year_start_month, config.leave_year_start_day)
  const today = new Date().toISOString().slice(0, 10)

  const [{ data: balance }, { data: existingLeaves }] = await Promise.all([
    admin.from("holiday_balance").select("*")
      .eq("organisation_id", params.orgId).eq("staff_id", params.staffId)
      .eq("leave_type_id", leaveType.id).eq("year", balanceYear)
      .maybeSingle() as unknown as Promise<{ data: HolidayBalance | null }>,
    admin.from("leaves").select("start_date, end_date, status, days_counted")
      .eq("organisation_id", params.orgId).eq("staff_id", params.staffId)
      .eq("leave_type_id", leaveType.id).eq("balance_year", balanceYear)
      .in("status", ["approved", "pending"]) as unknown as Promise<{ data: Array<{ start_date: string; end_date: string; status: string; days_counted: number | null }> | null }>,
  ])

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

  const available = currentBalance.available
  const shortfall = daysCounted - available

  let overflow: OverflowResult = {
    needed: false, overflowDays: 0, overflowTypeId: null, overflowTypeName: null, mainDays: daysCounted,
  }

  if (shortfall > 0 && leaveType.overflow_to_type_id) {
    const { data: overflowType } = await admin
      .from("company_leave_types").select("id, name")
      .eq("id", leaveType.overflow_to_type_id)
      .single() as { data: { id: string; name: string } | null }
    if (overflowType) {
      overflow = {
        needed: true,
        overflowDays: shortfall,
        overflowTypeId: overflowType.id,
        overflowTypeName: overflowType.name,
        mainDays: Math.max(daysCounted - shortfall, 0),
      }
    }
  }

  return {
    found: true,
    leaveTypeId: leaveType.id,
    leaveTypeName: leaveType.name,
    available,
    daysCounted,
    overflow,
    blocked: shortfall > 0 && !leaveType.overflow_to_type_id,
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
