// ============================================================
// LabRota — HR Balance Engine
// Pure utility module for leave day counting and balance calculation.
// No UI or database dependencies in the pure functions.
// ============================================================

import type { CountingMethod } from "@/lib/types/database"

// ── Types ────────────────────────────────────────────────────────────────────

export interface DayCountConfig {
  counting_method: CountingMethod
  public_holidays_deducted: boolean
}

export interface BalanceResult {
  entitlement: number
  carried_forward: number
  cf_expiry_date: string | null
  cf_expired: boolean
  cf_available: number
  manual_adjustment: number
  booked: number
  taken: number
  total_used: number
  available: number
  in_overflow: boolean
  overflow_days: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function formatDateISO(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

function isWorkingDay(date: Date): boolean {
  return !isWeekend(date)
}

function normalizeHoliday(h: string): string {
  return h.slice(0, 10) // ensure YYYY-MM-DD
}

// ── countDays ────────────────────────────────────────────────────────────────

/**
 * Count leave days between fromDate and toDate (inclusive).
 *
 * @param fromDate - ISO date string (YYYY-MM-DD)
 * @param toDate - ISO date string (YYYY-MM-DD)
 * @param config - counting method configuration
 * @param publicHolidays - array of ISO date strings for public holidays
 * @returns integer day count
 */
export function countDays(
  fromDate: string,
  toDate: string,
  config: DayCountConfig,
  publicHolidays: string[] = []
): number {
  const start = parseDate(fromDate)
  const end = parseDate(toDate)

  if (end < start) return 0

  const holidays = new Set(publicHolidays.map(normalizeHoliday))

  let count = 0
  const current = new Date(start)

  while (current <= end) {
    const dateStr = formatDateISO(current)

    if (config.counting_method === "working_days") {
      // Working days: count Mon-Fri, then subtract public holidays that fall on working days
      if (isWorkingDay(current)) {
        let include = true
        if (config.public_holidays_deducted && holidays.has(dateStr)) {
          include = false
        }
        if (include) count++
      }
    } else {
      // Calendar days: count all days, subtract public holidays if configured
      let include = true
      if (config.public_holidays_deducted && holidays.has(dateStr)) {
        include = false
      }
      if (include) count++
    }

    current.setDate(current.getDate() + 1)
  }

  return count
}

// ── calculateBalance ─────────────────────────────────────────────────────────

/**
 * Calculate the leave balance for a staff member, leave type, and year.
 * This is a pure function — all data must be passed in.
 *
 * @param params.entitlement - annual entitlement from holiday_balance or default_days
 * @param params.carried_forward - CF days from holiday_balance record
 * @param params.cf_expiry_date - when CF expires (ISO date or null)
 * @param params.manual_adjustment - manual ± adjustment
 * @param params.today - current date for determining taken vs booked
 * @param params.leaveEntries - all approved/pending leave entries for this type+year
 * @param params.config - day counting configuration
 * @param params.publicHolidays - public holiday dates
 */
export function calculateBalance(params: {
  entitlement: number
  carried_forward: number
  cf_expiry_date: string | null
  manual_adjustment: number
  today: string
  leaveEntries: Array<{
    start_date: string
    end_date: string
    status: string
    days_counted: number | null
  }>
  config: DayCountConfig
  publicHolidays: string[]
}): BalanceResult {
  const {
    entitlement,
    carried_forward,
    cf_expiry_date,
    manual_adjustment,
    today,
    leaveEntries,
    config,
    publicHolidays,
  } = params

  const todayDate = parseDate(today)

  // Determine if carry-forward has expired
  const cf_expired = cf_expiry_date ? parseDate(cf_expiry_date) < todayDate : false
  const cf_available = cf_expired ? 0 : carried_forward

  // Split entries into taken (completed) and booked (future/ongoing)
  let taken = 0
  let booked = 0

  for (const entry of leaveEntries) {
    if (entry.status === "cancelled" || entry.status === "rejected") continue

    const days = entry.days_counted ?? countDays(entry.start_date, entry.end_date, config, publicHolidays)
    const entryEnd = parseDate(entry.end_date)

    if (entryEnd < todayDate) {
      taken += days
    } else {
      booked += days
    }
  }

  const total_used = taken + booked
  const available = entitlement + cf_available + manual_adjustment - total_used

  return {
    entitlement,
    carried_forward,
    cf_expiry_date,
    cf_expired,
    cf_available,
    manual_adjustment,
    booked,
    taken,
    total_used,
    available,
    in_overflow: available < 0,
    overflow_days: available < 0 ? Math.abs(available) : 0,
  }
}

// ── getLeaveYear ─────────────────────────────────────────────────────────────

/**
 * Determine which leave year a date falls into given the leave year start config.
 */
export function getLeaveYear(
  date: string,
  startMonth: number,
  startDay: number
): number {
  const d = parseDate(date)
  const year = d.getFullYear()
  const yearStart = new Date(year, startMonth - 1, startDay)

  // If the date is before this year's leave year start, it belongs to previous year
  if (d < yearStart) {
    return year - 1
  }
  return year
}

// ── getCarryForwardExpiryDate ────────────────────────────────────────────────

/**
 * Calculate the CF expiry date for a given leave year.
 */
export function getCarryForwardExpiryDate(
  leaveYear: number,
  expiryMonth: number,
  expiryDay: number
): string {
  // CF from year X expires in year X+1
  const d = new Date(leaveYear + 1, expiryMonth - 1, expiryDay)
  return formatDateISO(d)
}

// ── Default leave types seed data ────────────────────────────────────────────

export const DEFAULT_LEAVE_TYPES = [
  { name: "Vacaciones", name_en: "Annual Leave", has_balance: true, default_days: 25, allows_carry_forward: true, overflow_to: null, is_paid: true, color: "#3b82f6", sort_order: 0 },
  { name: "Baja por enfermedad", name_en: "Sick Leave", has_balance: true, default_days: 10, allows_carry_forward: false, overflow_to: "Baja no remunerada", is_paid: true, color: "#ef4444", sort_order: 1 },
  { name: "Baja no remunerada", name_en: "Unpaid Sick Leave", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to: null, is_paid: false, color: "#f97316", sort_order: 2 },
  { name: "Permiso no remunerado", name_en: "Unpaid Leave", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to: null, is_paid: false, color: "#a855f7", sort_order: 3 },
  { name: "Festivo", name_en: "Public Holiday", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to: null, is_paid: true, color: "#06b6d4", sort_order: 4 },
  { name: "Formacion", name_en: "Training", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to: null, is_paid: true, color: "#8b5cf6", sort_order: 5 },
  { name: "Baja por maternidad", name_en: "Maternity Leave", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to: null, is_paid: true, color: "#ec4899", sort_order: 6 },
  { name: "Baja por paternidad", name_en: "Paternity Leave", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to: null, is_paid: true, color: "#14b8a6", sort_order: 7 },
] as const
