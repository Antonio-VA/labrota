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

const TASK_KEYWORDS = new Set([
  "opu", "icsi", "biopsy", "fert check", "fert", "denudation", "et", "fet",
  "thaw", "freeze", "tesa", "genomix", "transport", "admin", "off",
  "qc", "keep timing", "dish", "media prep", "ov", "tubing",
  "egg collection", "embryo transfer", "denudación",
])

const SHIFT_KEYWORDS = new Set([
  "morning", "afternoon", "evening", "night", "am", "pm", "day",
  "mañana", "tarde", "noche", "completo", "full",
  "t1", "t2", "t3", "t4", "t5", "t6",
])

const DAY_NAMES = new Set([
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "mon", "tue", "wed", "thu", "fri", "sat", "sun",
  "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo",
  "lun", "mar", "mié", "jue", "vie", "sáb", "dom",
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalise(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-záéíóúñü0-9\s]/g, "")
}

function isDate(cell: unknown): Date | null {
  if (cell instanceof Date) return cell
  if (typeof cell === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(cell)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  if (typeof cell === "string") {
    const d = new Date(cell)
    if (!isNaN(d.getTime())) return d
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
  return /^[A-Z]{2,4}$/.test(s.trim())
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

  // Find the header row — first row with multiple non-empty cells
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const nonEmpty = (data[i] ?? []).filter((c) => String(c ?? "").trim()).length
    if (nonEmpty >= 3) { headerRowIdx = i; break }
  }

  const headerRow = (data[headerRowIdx] ?? []).map((c) => String(c ?? "").trim())

  // Detect mode from headers
  let taskCount = 0
  let shiftCount = 0
  for (const h of headerRow) {
    const norm = normalise(h)
    if (norm.length < 2) continue
    for (const kw of TASK_KEYWORDS) {
      if (norm.includes(kw)) { taskCount++; break }
    }
    for (const kw of SHIFT_KEYWORDS) {
      if (norm.includes(kw)) { shiftCount++; break }
    }
  }

  const mode: "by_task" | "by_shift" = taskCount > shiftCount ? "by_task" : "by_shift"

  // Extract column indices — find date columns and task/shift columns
  const staffSet = new Map<string, ParsedStaff>()
  const techniques: ParsedTechnique[] = []
  const shifts: ParsedShift[] = []
  const leaves: ParsedLeave[] = []
  const assignments: { date: string; initials: string; task?: string; shift?: string }[] = []

  // Detect date columns or row dates
  const dates: string[] = []
  let dateColumnIndices: number[] = []

  // Check if dates are in the header (columns = days)
  for (let col = 0; col < headerRow.length; col++) {
    const d = isDate(data[headerRowIdx]?.[col])
    if (d) {
      dates.push(toISO(d))
      dateColumnIndices.push(col)
    }
  }

  // If dates are in a column (rows = days), detect differently
  let dateRowMode = false
  if (dates.length < 3) {
    dates.length = 0
    dateColumnIndices = []
    dateRowMode = true
    // Look for dates in first column
    for (let row = headerRowIdx + 1; row < data.length; row++) {
      const cell = data[row]?.[0]
      const d = isDate(cell)
      if (d) {
        dates.push(toISO(d))
      } else if (typeof cell === "string" && DAY_NAMES.has(normalise(cell))) {
        // Day name without date — try to infer
      }
    }
  }

  const weekStart = dates.length > 0 ? getMondayOfWeek(new Date(dates[0] + "T12:00:00")) : toISO(new Date())

  if (mode === "by_task") {
    // Headers are technique names
    let order = 0
    for (let col = 1; col < headerRow.length; col++) {
      const h = headerRow[col]
      if (!h || h.length < 2) continue
      const norm = normalise(h)
      let isTask = false
      for (const kw of TASK_KEYWORDS) {
        if (norm.includes(kw)) { isTask = true; break }
      }
      if (isTask || col <= headerRow.length) {
        techniques.push({ name: h, qualifiedInitials: [], order: order++ })
      }
    }

    // Parse body rows — each row is a day, cells contain initials
    for (let row = headerRowIdx + 1; row < data.length; row++) {
      const rowData = data[row] ?? []
      let rowDate = ""

      // First cell might be a date or day name
      const firstCell = rowData[0]
      const d = isDate(firstCell)
      if (d) {
        rowDate = toISO(d)
      } else if (typeof firstCell === "string" && firstCell.trim()) {
        // Try to match to a date from the dates array
        if (dates[row - headerRowIdx - 1]) rowDate = dates[row - headerRowIdx - 1]
      }

      if (!rowDate && dates.length > row - headerRowIdx - 1) {
        rowDate = dates[row - headerRowIdx - 1] ?? ""
      }

      // Parse cells
      for (let col = 1; col < rowData.length && col - 1 < techniques.length; col++) {
        const cellValue = String(rowData[col] ?? "").trim()
        if (!cellValue) continue

        const technique = techniques[col - 1]

        // Cell might contain multiple initials separated by / , or space
        const parts = cellValue.split(/[\/,\s]+/).filter((p) => p.length >= 2)
        for (const part of parts) {
          const upper = part.toUpperCase()
          if (looksLikeInitials(upper) || part.length >= 2) {
            const initials = upper.slice(0, 3)
            if (!staffSet.has(initials)) {
              staffSet.set(initials, { initials, firstName: "", lastName: "", department: "lab" })
            }
            if (!technique.qualifiedInitials.includes(initials)) {
              technique.qualifiedInitials.push(initials)
            }
            if (rowDate) {
              assignments.push({ date: rowDate, initials, task: technique.name })
            }
          }
        }

        // Check for "All" / "Todo"
        if (normalise(cellValue) === "all" || normalise(cellValue) === "todo" || normalise(cellValue) === "todos") {
          if (rowDate) {
            assignments.push({ date: rowDate, initials: "ALL", task: technique.name })
          }
        }
      }
    }
  } else {
    // By shift mode — detect shift labels from headers or row groupings
    for (let col = 1; col < headerRow.length; col++) {
      const h = headerRow[col]
      if (!h) continue
      const norm = normalise(h)
      let isShift = false
      for (const kw of SHIFT_KEYWORDS) {
        if (norm.includes(kw)) { isShift = true; break }
      }
      if (isShift) {
        shifts.push({ name: h, start: "", end: "" })
      }
    }

    if (shifts.length === 0) {
      shifts.push({ name: "T1", start: "07:30", end: "15:30" })
    }

    // Parse body — cells contain staff initials
    for (let row = headerRowIdx + 1; row < data.length; row++) {
      const rowData = data[row] ?? []
      for (let col = 0; col < rowData.length; col++) {
        const cellValue = String(rowData[col] ?? "").trim()
        if (!cellValue) continue
        const parts = cellValue.split(/[\/,\s]+/).filter((p) => looksLikeInitials(p.toUpperCase()))
        for (const part of parts) {
          const initials = part.toUpperCase()
          if (!staffSet.has(initials)) {
            staffSet.set(initials, { initials, firstName: "", lastName: "", department: "lab" })
          }
        }
      }
    }
  }

  // Detect leave — look for cells containing "leave", "off", "annual", "baja", "vacaciones"
  const TODAY = toISO(new Date())
  for (let row = 0; row < data.length; row++) {
    for (let col = 0; col < (data[row]?.length ?? 0); col++) {
      const cell = String(data[row]?.[col] ?? "").toLowerCase()
      if (cell.includes("leave") || cell.includes("baja") || cell.includes("vacaciones") || cell.includes("annual")) {
        // Try to find initials and dates nearby
        // Simple heuristic: look for initials in same row
        for (let c2 = 0; c2 < (data[row]?.length ?? 0); c2++) {
          const v = String(data[row]?.[c2] ?? "").trim()
          if (looksLikeInitials(v.toUpperCase()) && staffSet.has(v.toUpperCase())) {
            const from = TODAY
            const to = "" // Can't determine without more context
            leaves.push({ initials: v.toUpperCase(), from, to, type: "annual" })
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
