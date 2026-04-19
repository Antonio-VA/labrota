import { describe, it, expect } from "vitest"
import { formatDate, formatDateWithYear, formatDateRange, getMondayOf } from "../format-date"

// Use fixed dates to avoid timezone issues — noon UTC
const MAR_17 = new Date("2026-03-17T12:00:00Z")
const MAR_19 = new Date("2026-03-19T12:00:00Z")
const JAN_1 = new Date("2026-01-01T12:00:00Z")
const DEC_31 = new Date("2026-12-31T12:00:00Z")

describe("formatDate", () => {
  it("formats date in English", () => {
    const result = formatDate(MAR_17, "en")
    expect(result).toContain("17")
    expect(result).toContain("Mar")
  })

  it("formats date in Spanish", () => {
    const result = formatDate(MAR_17, "es")
    expect(result).toContain("17")
    expect(result).toContain("mar")
  })

  it("accepts ISO string input", () => {
    const result = formatDate("2026-03-17", "en")
    expect(result).toContain("17")
    expect(result).toContain("Mar")
  })

  it("includes weekday abbreviation", () => {
    const enResult = formatDate(MAR_17, "en")
    // Mar 17 2026 is a Tuesday
    expect(enResult).toMatch(/Tue/i)
  })

  it("includes weekday in Spanish", () => {
    const esResult = formatDate(MAR_17, "es")
    expect(esResult).toMatch(/mar/i) // martes
  })

  it("formats January 1st correctly", () => {
    const result = formatDate(JAN_1, "en")
    expect(result).toContain("1")
    expect(result).toContain("Jan")
  })

  it("formats December 31st correctly", () => {
    const result = formatDate(DEC_31, "en")
    expect(result).toContain("31")
    expect(result).toContain("Dec")
  })
})

describe("formatDateWithYear", () => {
  it("includes year in English", () => {
    const result = formatDateWithYear(MAR_17, "en")
    expect(result).toContain("17")
    expect(result).toContain("Mar")
    expect(result).toContain("2026")
  })

  it("includes year in Spanish", () => {
    const result = formatDateWithYear(MAR_17, "es")
    expect(result).toContain("17")
    expect(result).toContain("2026")
  })

  it("accepts ISO string input", () => {
    const result = formatDateWithYear("2026-12-31", "en")
    expect(result).toContain("31")
    expect(result).toContain("Dec")
    expect(result).toContain("2026")
  })
})

describe("formatDateRange", () => {
  it("formats range with en-dash separator", () => {
    const result = formatDateRange(MAR_17, MAR_19, "en")
    expect(result).toContain("–")
  })

  it("start date has no year, end date has year", () => {
    const result = formatDateRange(MAR_17, MAR_19, "en")
    // Start part (before –) should not have 2026
    const [start, end] = result.split("–").map((s) => s.trim())
    expect(start).not.toContain("2026")
    expect(end).toContain("2026")
  })

  it("works with string inputs", () => {
    const result = formatDateRange("2026-03-17", "2026-03-19", "en")
    expect(result).toContain("17")
    expect(result).toContain("19")
    expect(result).toContain("–")
  })

  it("works in Spanish", () => {
    const result = formatDateRange(MAR_17, MAR_19, "es")
    expect(result).toContain("17")
    expect(result).toContain("19")
    expect(result).toContain("2026")
  })

  it("handles cross-month range", () => {
    const result = formatDateRange(MAR_17, DEC_31, "en")
    expect(result).toContain("Mar")
    expect(result).toContain("Dec")
    expect(result).toContain("2026")
  })

  it("handles same-day range", () => {
    const result = formatDateRange(MAR_17, MAR_17, "en")
    const parts = result.split("–")
    expect(parts).toHaveLength(2)
  })
})

describe("getMondayOf", () => {
  it("returns Monday for a Monday input", () => {
    expect(getMondayOf("2026-03-16")).toBe("2026-03-16")
  })
  it("returns Monday for a Wednesday input", () => {
    expect(getMondayOf("2026-03-18")).toBe("2026-03-16")
  })
  it("returns Monday for a Sunday input", () => {
    expect(getMondayOf("2026-03-22")).toBe("2026-03-16")
  })
  it("accepts a Date input", () => {
    expect(getMondayOf(new Date("2026-03-18T12:00:00Z"))).toBe("2026-03-16")
  })
})
