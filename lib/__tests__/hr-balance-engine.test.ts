import { describe, it, expect } from "vitest"
import { countDays, calculateBalance, getLeaveYear, getCarryForwardExpiryDate } from "../hr-balance-engine"
import type { DayCountConfig } from "../hr-balance-engine"

// ── countDays ────────────────────────────────────────────────────────────────

describe("countDays", () => {
  const workingDays: DayCountConfig = {
    counting_method: "working_days",
    public_holidays_deducted: true,
  }

  const calendarDays: DayCountConfig = {
    counting_method: "calendar_days",
    public_holidays_deducted: true,
  }

  const calendarNoPH: DayCountConfig = {
    counting_method: "calendar_days",
    public_holidays_deducted: false,
  }

  // Working days tests

  it("counts working days only (Mon-Fri)", () => {
    // Mon 2026-03-16 to Fri 2026-03-20 = 5 working days
    expect(countDays("2026-03-16", "2026-03-20", workingDays)).toBe(5)
  })

  it("excludes weekends in working_days mode", () => {
    // Mon 2026-03-16 to Sun 2026-03-22 = 5 working days (Sat+Sun excluded)
    expect(countDays("2026-03-16", "2026-03-22", workingDays)).toBe(5)
  })

  it("counts a full week with one public holiday mid-week", () => {
    // Mon 2026-03-16 to Fri 2026-03-20, with Wed 2026-03-18 being a public holiday
    expect(countDays("2026-03-16", "2026-03-20", workingDays, ["2026-03-18"])).toBe(4)
  })

  it("handles single day (from === to), included day (weekday)", () => {
    // Mon 2026-03-16
    expect(countDays("2026-03-16", "2026-03-16", workingDays)).toBe(1)
  })

  it("handles single day (from === to), excluded day (weekend in working_days mode)", () => {
    // Sat 2026-03-21
    expect(countDays("2026-03-21", "2026-03-21", workingDays)).toBe(0)
  })

  it("handles two full weeks", () => {
    // Mon 2026-03-16 to Fri 2026-03-27 = 10 working days
    expect(countDays("2026-03-16", "2026-03-27", workingDays)).toBe(10)
  })

  // Calendar days tests

  it("counts all calendar days including weekends", () => {
    // Mon 2026-03-16 to Sun 2026-03-22 = 7 calendar days
    expect(countDays("2026-03-16", "2026-03-22", calendarDays)).toBe(7)
  })

  it("counts calendar days with public holidays deducted", () => {
    // Mon 2026-03-16 to Fri 2026-03-20 = 5 days, Wed is PH = 4
    expect(countDays("2026-03-16", "2026-03-20", calendarDays, ["2026-03-18"])).toBe(4)
  })

  it("deducts public holiday on weekend in calendar mode", () => {
    // Mon 2026-03-16 to Sun 2026-03-22 = 7 days, Sat is PH = 6
    expect(countDays("2026-03-16", "2026-03-22", calendarDays, ["2026-03-21"])).toBe(6)
  })

  it("ignores public holidays when not configured", () => {
    // Mon 2026-03-16 to Fri 2026-03-20, Wed is PH but PH deduction off
    expect(countDays("2026-03-16", "2026-03-20", calendarNoPH, ["2026-03-18"])).toBe(5)
  })

  it("counts single weekend day in calendar mode", () => {
    expect(countDays("2026-03-21", "2026-03-21", calendarDays)).toBe(1)
  })

  // Range crossing year boundary

  it("counts across year boundary", () => {
    // Wed 2025-12-31 to Fri 2026-01-02 = 3 calendar days, 2 PH = 1
    const holidays = ["2025-12-31", "2026-01-01"]
    expect(countDays("2025-12-31", "2026-01-02", calendarDays, holidays)).toBe(1)
  })

  it("counts across year boundary with working days", () => {
    // Wed 2025-12-31 to Fri 2026-01-02
    // Dec 31 (Wed) = working day, Jan 1 (Thu) = PH, Jan 2 (Fri) = working day
    expect(countDays("2025-12-31", "2026-01-02", workingDays, ["2026-01-01"])).toBe(2)
  })

  // Edge cases

  it("returns 0 when end < start", () => {
    expect(countDays("2026-03-20", "2026-03-16", workingDays)).toBe(0)
  })

  it("handles empty public holidays array", () => {
    expect(countDays("2026-03-16", "2026-03-20", workingDays, [])).toBe(5)
  })
})

// ── calculateBalance ─────────────────────────────────────────────────────────

describe("calculateBalance", () => {
  const config: DayCountConfig = {
    counting_method: "working_days",
    public_holidays_deducted: true,
  }

  it("calculates basic balance with no leave taken", () => {
    const result = calculateBalance({
      entitlement: 25,
      carried_forward: 0,
      cf_expiry_date: null,
      manual_adjustment: 0,
      today: "2026-06-15",
      leaveEntries: [],
      config,
      publicHolidays: [],
    })

    expect(result.entitlement).toBe(25)
    expect(result.available).toBe(25)
    expect(result.taken).toBe(0)
    expect(result.booked).toBe(0)
    expect(result.total_used).toBe(0)
  })

  it("separates taken and booked leave", () => {
    const result = calculateBalance({
      entitlement: 25,
      carried_forward: 0,
      cf_expiry_date: null,
      manual_adjustment: 0,
      today: "2026-06-15",
      leaveEntries: [
        { start_date: "2026-03-16", end_date: "2026-03-20", status: "approved", days_counted: 5 },
        { start_date: "2026-08-10", end_date: "2026-08-14", status: "approved", days_counted: 5 },
      ],
      config,
      publicHolidays: [],
    })

    expect(result.taken).toBe(5)
    expect(result.booked).toBe(5)
    expect(result.total_used).toBe(10)
    expect(result.available).toBe(15)
  })

  it("includes carry-forward when not expired", () => {
    const result = calculateBalance({
      entitlement: 25,
      carried_forward: 3,
      cf_expiry_date: "2026-03-31",
      manual_adjustment: 0,
      today: "2026-02-15",
      leaveEntries: [],
      config,
      publicHolidays: [],
    })

    expect(result.cf_expired).toBe(false)
    expect(result.cf_available).toBe(3)
    expect(result.available).toBe(28)
  })

  it("zeroes carry-forward when expired", () => {
    const result = calculateBalance({
      entitlement: 25,
      carried_forward: 3,
      cf_expiry_date: "2026-03-31",
      manual_adjustment: 0,
      today: "2026-04-01",
      leaveEntries: [],
      config,
      publicHolidays: [],
    })

    expect(result.cf_expired).toBe(true)
    expect(result.cf_available).toBe(0)
    expect(result.available).toBe(25)
  })

  it("applies manual adjustment", () => {
    const result = calculateBalance({
      entitlement: 25,
      carried_forward: 0,
      cf_expiry_date: null,
      manual_adjustment: -7,
      today: "2026-06-15",
      leaveEntries: [],
      config,
      publicHolidays: [],
    })

    expect(result.available).toBe(18)
  })

  it("detects overflow when balance goes negative", () => {
    const result = calculateBalance({
      entitlement: 10,
      carried_forward: 0,
      cf_expiry_date: null,
      manual_adjustment: 0,
      today: "2026-06-15",
      leaveEntries: [
        { start_date: "2026-03-02", end_date: "2026-03-13", status: "approved", days_counted: 10 },
        { start_date: "2026-04-06", end_date: "2026-04-08", status: "approved", days_counted: 3 },
      ],
      config,
      publicHolidays: [],
    })

    expect(result.total_used).toBe(13)
    expect(result.available).toBe(-3)
    expect(result.in_overflow).toBe(true)
    expect(result.overflow_days).toBe(3)
  })

  it("ignores cancelled and rejected entries", () => {
    const result = calculateBalance({
      entitlement: 25,
      carried_forward: 0,
      cf_expiry_date: null,
      manual_adjustment: 0,
      today: "2026-06-15",
      leaveEntries: [
        { start_date: "2026-03-16", end_date: "2026-03-20", status: "approved", days_counted: 5 },
        { start_date: "2026-04-06", end_date: "2026-04-10", status: "cancelled", days_counted: 5 },
        { start_date: "2026-05-04", end_date: "2026-05-08", status: "rejected", days_counted: 5 },
      ],
      config,
      publicHolidays: [],
    })

    expect(result.total_used).toBe(5)
    expect(result.available).toBe(20)
  })

  it("falls back to countDays when days_counted is null", () => {
    const result = calculateBalance({
      entitlement: 25,
      carried_forward: 0,
      cf_expiry_date: null,
      manual_adjustment: 0,
      today: "2026-06-15",
      leaveEntries: [
        { start_date: "2026-03-16", end_date: "2026-03-20", status: "approved", days_counted: null },
      ],
      config,
      publicHolidays: [],
    })

    // Mon-Fri = 5 working days
    expect(result.taken).toBe(5)
    expect(result.available).toBe(20)
  })
})

// ── getLeaveYear ─────────────────────────────────────────────────────────────

describe("getLeaveYear", () => {
  it("returns current year when date is after leave year start", () => {
    expect(getLeaveYear("2026-06-15", 1, 1)).toBe(2026)
  })

  it("returns previous year when date is before leave year start", () => {
    expect(getLeaveYear("2026-03-15", 4, 1)).toBe(2025)
  })

  it("returns current year when date is exactly leave year start", () => {
    expect(getLeaveYear("2026-04-01", 4, 1)).toBe(2026)
  })

  it("works for Jan 1 start (default)", () => {
    expect(getLeaveYear("2026-01-01", 1, 1)).toBe(2026)
    expect(getLeaveYear("2025-12-31", 1, 1)).toBe(2025)
  })
})

// ── getCarryForwardExpiryDate ────────────────────────────────────────────────

describe("getCarryForwardExpiryDate", () => {
  it("returns expiry date in the next year", () => {
    expect(getCarryForwardExpiryDate(2025, 3, 31)).toBe("2026-03-31")
  })

  it("handles year boundary", () => {
    expect(getCarryForwardExpiryDate(2025, 12, 31)).toBe("2026-12-31")
  })
})
