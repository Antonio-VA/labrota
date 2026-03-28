import { describe, it, expect } from "vitest"
import {
  parseDate,
  parseDateRange,
  detectLeaveType,
  matchStaff,
  type StaffRecord,
} from "../parse-leave-file"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STAFF: StaffRecord[] = [
  { id: "s1", first_name: "Ana", last_name: "García", initials: "AG" },
  { id: "s2", first_name: "Carlos", last_name: "López", initials: "CL" },
  { id: "s3", first_name: "María", last_name: "Ruiz", initials: "MR" },
  { id: "s4", first_name: "José", last_name: "Martínez", initials: "JM" },
]

// ── parseDate ─────────────────────────────────────────────────────────────────

describe("parseDate", () => {
  it("returns empty for empty input", () => {
    expect(parseDate("")).toBe("")
  })

  it("returns empty for whitespace", () => {
    expect(parseDate("   ")).toBe("")
  })

  it("parses ISO format (YYYY-MM-DD)", () => {
    expect(parseDate("2026-03-17")).toBe("2026-03-17")
  })

  it("parses DD/MM/YYYY", () => {
    expect(parseDate("17/03/2026")).toBe("2026-03-17")
  })

  it("parses DD-MM-YYYY", () => {
    expect(parseDate("17-03-2026")).toBe("2026-03-17")
  })

  it("parses DD.MM.YYYY", () => {
    expect(parseDate("17.03.2026")).toBe("2026-03-17")
  })

  it("parses single-digit day and month (1/3/2026)", () => {
    expect(parseDate("1/3/2026")).toBe("2026-03-01")
  })

  it("parses DD/MM without year (assumes current year)", () => {
    const result = parseDate("17/03")
    const year = new Date().getFullYear()
    expect(result).toBe(`${year}-03-17`)
  })

  it("parses Spanish text date '24 mar 2026'", () => {
    expect(parseDate("24 mar 2026")).toBe("2026-03-24")
  })

  it("parses Spanish full month '24 marzo 2026'", () => {
    expect(parseDate("24 marzo 2026")).toBe("2026-03-24")
  })

  it("parses Spanish with 'de': '24 de marzo de 2026'", () => {
    expect(parseDate("24 de marzo de 2026")).toBe("2026-03-24")
  })

  it("parses English text date 'March 24, 2026'", () => {
    expect(parseDate("March 24, 2026")).toBe("2026-03-24")
  })

  it("parses English without comma 'March 24 2026'", () => {
    expect(parseDate("March 24 2026")).toBe("2026-03-24")
  })

  it("parses abbreviated English month 'Mar 24, 2026'", () => {
    expect(parseDate("Mar 24, 2026")).toBe("2026-03-24")
  })

  it("handles December correctly", () => {
    expect(parseDate("25/12/2026")).toBe("2026-12-25")
  })

  it("handles January correctly", () => {
    expect(parseDate("01/01/2026")).toBe("2026-01-01")
  })

  it("returns empty for unrecognized format", () => {
    expect(parseDate("not a date")).toBe("")
  })

  it("returns empty for random text", () => {
    expect(parseDate("hello world 123")).toBe("")
  })
})

// ── parseDateRange ────────────────────────────────────────────────────────────

describe("parseDateRange", () => {
  it("returns empty for empty input", () => {
    expect(parseDateRange("")).toEqual({ from: "", to: "" })
  })

  it("parses dash-separated range", () => {
    const result = parseDateRange("17/03/2026 - 19/03/2026")
    expect(result.from).toBe("2026-03-17")
    expect(result.to).toBe("2026-03-19")
  })

  it("parses en-dash separated range", () => {
    const result = parseDateRange("17/03/2026 – 19/03/2026")
    expect(result.from).toBe("2026-03-17")
    expect(result.to).toBe("2026-03-19")
  })

  it("parses 'al' separator (Spanish)", () => {
    const result = parseDateRange("17/03/2026 al 19/03/2026")
    expect(result.from).toBe("2026-03-17")
    expect(result.to).toBe("2026-03-19")
  })

  it("parses 'to' separator (English)", () => {
    const result = parseDateRange("17/03/2026 to 19/03/2026")
    expect(result.from).toBe("2026-03-17")
    expect(result.to).toBe("2026-03-19")
  })

  it("parses 'hasta' separator (Spanish)", () => {
    const result = parseDateRange("17/03/2026 hasta 19/03/2026")
    expect(result.from).toBe("2026-03-17")
    expect(result.to).toBe("2026-03-19")
  })

  it("treats single date as same from/to", () => {
    const result = parseDateRange("17/03/2026")
    expect(result.from).toBe("2026-03-17")
    expect(result.to).toBe("2026-03-17")
  })

  it("handles ISO date range with 'to' separator", () => {
    // Note: dash separator conflicts with ISO date dashes, so use 'to'
    const result = parseDateRange("2026-03-17 to 2026-03-24")
    expect(result.from).toBe("2026-03-17")
    expect(result.to).toBe("2026-03-24")
  })
})

// ── detectLeaveType ───────────────────────────────────────────────────────────

describe("detectLeaveType", () => {
  it("defaults to annual for unknown text", () => {
    expect(detectLeaveType("some random text")).toBe("annual")
  })

  it("detects sick leave (English)", () => {
    expect(detectLeaveType("sick leave from March")).toBe("sick")
  })

  it("detects sick leave (Spanish: baja)", () => {
    expect(detectLeaveType("baja médica")).toBe("sick")
  })

  it("detects sick leave (Spanish: enfermedad)", () => {
    expect(detectLeaveType("enfermedad")).toBe("sick")
  })

  it("detects training (English)", () => {
    expect(detectLeaveType("training course")).toBe("training")
  })

  it("detects training (Spanish: formación)", () => {
    expect(detectLeaveType("formación continua")).toBe("training")
  })

  it("detects training (Spanish: curso)", () => {
    expect(detectLeaveType("curso de laboratorio")).toBe("training")
  })

  it("detects maternity (English)", () => {
    expect(detectLeaveType("maternity leave")).toBe("maternity")
  })

  it("detects paternity (Spanish)", () => {
    expect(detectLeaveType("paternidad")).toBe("maternity")
  })

  it("detects annual leave (vacation)", () => {
    expect(detectLeaveType("vacation")).toBe("annual")
  })

  it("detects annual leave (Spanish: vacaciones)", () => {
    expect(detectLeaveType("vacaciones de verano")).toBe("annual")
  })

  it("detects personal leave (English)", () => {
    expect(detectLeaveType("personal day")).toBe("personal")
  })

  it("detects personal leave (Spanish: asuntos propios)", () => {
    expect(detectLeaveType("asuntos propios")).toBe("personal")
  })

  it("is case-insensitive", () => {
    expect(detectLeaveType("SICK LEAVE")).toBe("sick")
    expect(detectLeaveType("TRAINING")).toBe("training")
  })

  it("prioritizes first match (sick before annual)", () => {
    expect(detectLeaveType("sick vacation")).toBe("sick")
  })
})

// ── matchStaff ────────────────────────────────────────────────────────────────

describe("matchStaff", () => {
  it("returns null for empty staff list", () => {
    expect(matchStaff("Ana García", [])).toBeNull()
  })

  it("matches by exact initials (uppercase)", () => {
    const result = matchStaff("AG", STAFF)
    expect(result?.id).toBe("s1")
  })

  it("matches by initials case-insensitive input", () => {
    // Input is lowercased but compared as uppercase
    const result = matchStaff("ag", STAFF)
    // The function uppercases and checks /^[A-Z]{2,3}$/
    // "ag" uppercased is "AG" which matches
    expect(result?.id).toBe("s1")
  })

  it("matches by full name (exact, case-insensitive)", () => {
    const result = matchStaff("Ana García", STAFF)
    expect(result?.id).toBe("s1")
  })

  it("matches by full name lowercase", () => {
    const result = matchStaff("ana garcía", STAFF)
    expect(result?.id).toBe("s1")
  })

  it("matches by last name only", () => {
    const result = matchStaff("García", STAFF)
    expect(result?.id).toBe("s1")
  })

  it("matches by last name case-insensitive", () => {
    const result = matchStaff("garcía", STAFF)
    expect(result?.id).toBe("s1")
  })

  it("matches by first name only", () => {
    const result = matchStaff("Carlos", STAFF)
    expect(result?.id).toBe("s2")
  })

  it("matches partial name (name contains input)", () => {
    const result = matchStaff("Ana García Fernández", STAFF)
    // "ana garcía" is contained in "ana garcía fernández"
    expect(result?.id).toBe("s1")
  })

  it("returns null for no match", () => {
    expect(matchStaff("Unknown Person", STAFF)).toBeNull()
  })

  it("returns null for very short non-initials", () => {
    // "XY" would try initials match but no staff has XY
    expect(matchStaff("XY", STAFF)).toBeNull()
  })

  it("matches 3-letter initials", () => {
    const staffWith3 = [...STAFF, { id: "s5", first_name: "Pedro", last_name: "Sánchez Ruiz", initials: "PSR" }]
    const result = matchStaff("PSR", staffWith3)
    expect(result?.id).toBe("s5")
  })

  it("prefers initials over name match for 2-3 char input", () => {
    // "MR" should match initials for María Ruiz, not partial name
    const result = matchStaff("MR", STAFF)
    expect(result?.id).toBe("s3")
  })
})
