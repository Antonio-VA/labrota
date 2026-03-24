import * as XLSX from "xlsx"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedStaff {
  initials: string
  firstName: string
  lastName: string
  department: string
}

export interface ParsedLeave {
  initials: string
  from: string
  to: string
  type: string
}

export interface ParsedTechnique {
  name: string
  qualifiedInitials: string[]
  order: number
}

export interface ParsedShift {
  name: string
  start: string
  end: string
}

export interface ParsedRota {
  mode: "by_task" | "by_shift"
  weekStart: string
  staff: ParsedStaff[]
  techniques: ParsedTechnique[]
  shifts: ParsedShift[]
  leaves: ParsedLeave[]
  assignments: { date: string; initials: string; task?: string; shift?: string }[]
}

// ── Detection constants ───────────────────────────────────────────────────────

// Technique/procedure keywords — matched case-insensitively against header cells
const TASK_HEADERS = new Set([
  "qc", "fert", "fert check", "opu", "icsi", "ov", "ov / icsi", "ov/icsi",
  "keep", "keep timing", "thaw", "freeze", "thaw / freeze", "thaw/freeze",
  "biopsy", "biopsy + tubing", "biopsy+tubing", "tubing",
  "et", "fet", "et / fet", "et/fet",
  "dish", "dish & media prep", "media prep", "prep",
  "genomix", "transport", "tesa", "admin", "off",
  "denudation", "denudación", "vitrification", "vitrificación",
  "congelación", "análisis seminal", "preparación",
  "transferencia", "punción", "control de calidad",
])

const SHIFT_KEYWORDS = new Set([
  "morning", "afternoon", "evening", "night", "am", "pm", "day",
  "mañana", "tarde", "noche", "completo", "full",
  "t1", "t2", "t3", "t4", "t5", "t6",
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function norm(s: string): string {
  return s.toLowerCase().trim()
}

function isDate(cell: unknown): Date | null {
  if (cell instanceof Date) return cell
  if (typeof cell === "number") {
    const d = XLSX.SSF.parse_date_code(cell)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  if (typeof cell === "string") {
    const d = new Date(cell)
    if (!isNaN(d.getTime()) && cell.length > 4) return d
  }
  return null
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0]
}

function getMondayOfWeek(d: Date): string {
  const copy = new Date(d)
  copy.setHours(12, 0, 0, 0)
  const day = copy.getDay()
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return toISO(copy)
}

function looksLikeInitials(s: string): boolean {
  return /^[A-Z]{2,3}$/.test(s.trim())
}

function isTaskHeader(s: string): boolean {
  const n = norm(s)
  if (TASK_HEADERS.has(n)) return true
  // Also match partial: "OPU 1", "ICSI AM", etc.
  for (const kw of TASK_HEADERS) {
    if (n.startsWith(kw + " ") || n.startsWith(kw + "/") || n === kw) return true
  }
  return false
}

// ── Main parser ───────────────────────────────────────────────────────────────

export function getSheetNames(buffer: ArrayBuffer): string[] {
  const wb = XLSX.read(buffer, { type: "array" })
  return wb.SheetNames
}

export function parseSheet(buffer: ArrayBuffer, sheetName: string): ParsedRota {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error("Sheet not found")

  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })
  if (data.length < 2) throw new Error("Sheet has insufficient data")

  // Find the header row — first row with multiple non-empty cells (at least 5)
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const nonEmpty = (data[i] ?? []).filter((c) => String(c ?? "").trim()).length
    if (nonEmpty >= 5) { headerRowIdx = i; break }
  }

  const headerRow = (data[headerRowIdx] ?? []).map((c) => String(c ?? "").trim())

  // ── Mode detection ──────────────────────────────────────────────────────
  // Count how many header cells match task vs shift patterns
  let taskCount = 0
  let shiftCount = 0
  const headerTexts: string[] = []

  for (const h of headerRow) {
    if (!h) continue
    headerTexts.push(h)
    if (isTaskHeader(h)) taskCount++
    const n = norm(h)
    for (const kw of SHIFT_KEYWORDS) {
      if (n === kw || n.includes(kw)) { shiftCount++; break }
    }
  }

  const mode: "by_task" | "by_shift" = taskCount >= 3 ? "by_task" : shiftCount > taskCount ? "by_shift" : taskCount > 0 ? "by_task" : "by_shift"

  // ── Build header → column index map ─────────────────────────────────────
  // Collect all header values that are technique names (to exclude from staff)
  const headerValueSet = new Set(headerRow.map((h) => h.toUpperCase()).filter((h) => h.length >= 2))

  const staffSet = new Map<string, ParsedStaff>()
  const techniques: ParsedTechnique[] = []
  const shifts: ParsedShift[] = []
  const leaves: ParsedLeave[] = []
  const assignments: { date: string; initials: string; task?: string; shift?: string }[] = []

  // Detect dates in first column (rows = days)
  const dates: string[] = []
  for (let row = headerRowIdx + 1; row < data.length; row++) {
    const cell = data[row]?.[0]
    const d = isDate(cell)
    if (d) dates.push(toISO(d))
  }

  const weekStart = dates.length > 0 ? getMondayOfWeek(new Date(dates[0] + "T12:00:00")) : toISO(new Date())

  if (mode === "by_task") {
    // ── By task: headers are technique names ────────────────────────────
    // Find technique columns (skip first column which is dates/day names)
    let order = 0
    const techColumns: { col: number; name: string }[] = []

    for (let col = 1; col < headerRow.length; col++) {
      const h = headerRow[col]
      if (!h || h.length < 2) continue
      // If it looks like a task header, add it
      if (isTaskHeader(h) || taskCount >= 3) {
        techniques.push({ name: h, qualifiedInitials: [], order: order })
        techColumns.push({ col, name: h })
        order++
      }
    }

    // Parse body rows — each row is a day, cells contain staff initials
    for (let row = headerRowIdx + 1; row < data.length; row++) {
      const rowData = data[row] ?? []
      const rowDate = dates[row - headerRowIdx - 1] ?? ""

      for (const tc of techColumns) {
        const cellValue = String(rowData[tc.col] ?? "").trim()
        if (!cellValue) continue

        // "All" / "Todo" detection
        const cellNorm = norm(cellValue)
        if (cellNorm === "all" || cellNorm === "todo" || cellNorm === "todos") {
          if (rowDate) assignments.push({ date: rowDate, initials: "ALL", task: tc.name })
          continue
        }

        // Split cell into individual initials/names
        const parts = cellValue.split(/[\/,\n]+/).map((p) => p.trim()).filter(Boolean)
        for (const part of parts) {
          const upper = part.toUpperCase().replace(/[^A-Z]/g, "")
          // Must be 2-3 uppercase letters AND not a header/technique name
          if (upper.length >= 2 && upper.length <= 3 && !headerValueSet.has(upper) && !isTaskHeader(part)) {
            if (!staffSet.has(upper)) {
              staffSet.set(upper, { initials: upper, firstName: "", lastName: "", department: "lab" })
            }
            // Track qualified staff per technique
            const tech = techniques.find((t) => t.name === tc.name)
            if (tech && !tech.qualifiedInitials.includes(upper)) {
              tech.qualifiedInitials.push(upper)
            }
            if (rowDate) {
              assignments.push({ date: rowDate, initials: upper, task: tc.name })
            }
          }
        }
      }
    }
  } else {
    // ── By shift: detect staff from cells ────────────────────────────────
    for (let col = 1; col < headerRow.length; col++) {
      const h = headerRow[col]
      if (!h) continue
      const n = norm(h)
      let isShift = false
      for (const kw of SHIFT_KEYWORDS) {
        if (n === kw || n.includes(kw)) { isShift = true; break }
      }
      if (isShift) shifts.push({ name: h, start: "", end: "" })
    }

    if (shifts.length === 0) shifts.push({ name: "T1", start: "07:30", end: "15:30" })

    // Parse body — cells contain staff initials
    for (let row = headerRowIdx + 1; row < data.length; row++) {
      const rowData = data[row] ?? []
      for (let col = 0; col < rowData.length; col++) {
        const cellValue = String(rowData[col] ?? "").trim()
        if (!cellValue) continue
        const parts = cellValue.split(/[\/,\n\s]+/).filter((p) => looksLikeInitials(p.toUpperCase()))
        for (const part of parts) {
          const upper = part.toUpperCase()
          if (!headerValueSet.has(upper)) {
            if (!staffSet.has(upper)) {
              staffSet.set(upper, { initials: upper, firstName: "", lastName: "", department: "lab" })
            }
          }
        }
      }
    }
  }

  // Detect leave from cells
  const TODAY = toISO(new Date())
  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < (data[row]?.length ?? 0); col++) {
      const cell = norm(String(data[row]?.[col] ?? ""))
      if (cell.includes("leave") || cell.includes("baja") || cell.includes("vacaciones") || cell.includes("annual")) {
        for (let c2 = 0; c2 < (data[row]?.length ?? 0); c2++) {
          const v = String(data[row]?.[c2] ?? "").trim().toUpperCase()
          if (looksLikeInitials(v) && staffSet.has(v)) {
            leaves.push({ initials: v, from: TODAY, to: "", type: "annual" })
          }
        }
      }
    }
  }

  return {
    mode,
    weekStart,
    staff: Array.from(staffSet.values()),
    techniques,
    shifts,
    leaves: leaves.filter((l) => !l.to || l.to >= TODAY),
    assignments,
  }
}
