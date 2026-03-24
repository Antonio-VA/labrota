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
  // Check headers AND first column for task/shift/day patterns
  let headerTaskCount = 0
  let headerShiftCount = 0
  let headerDayCount = 0
  let col0TaskCount = 0

  const DAY_NAMES = new Set([
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "mon", "tue", "wed", "thu", "fri", "sat", "sun",
    "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo",
    "lun", "mar", "mié", "jue", "vie", "sáb", "dom",
  ])

  for (const h of headerRow) {
    if (!h) continue
    if (isTaskHeader(h)) headerTaskCount++
    if (DAY_NAMES.has(norm(h))) headerDayCount++
    const n = norm(h)
    for (const kw of SHIFT_KEYWORDS) {
      if (n === kw || n.includes(kw)) { headerShiftCount++; break }
    }
  }

  // Check first column for task names (rows = tasks, columns = days)
  for (let row = headerRowIdx + 1; row < Math.min(data.length, 30); row++) {
    const cell = String(data[row]?.[0] ?? "").trim()
    if (cell && isTaskHeader(cell)) col0TaskCount++
  }

  // Determine orientation: if days are columns and tasks are in first column, flip
  const columnsAreDays = headerDayCount >= 3 || headerRow.some((h) => isDate(h) !== null)
  const rowsAreTasks = col0TaskCount >= 3

  const mode: "by_task" | "by_shift" =
    (headerTaskCount >= 3) ? "by_task" :
    (columnsAreDays && rowsAreTasks) ? "by_task" :
    headerShiftCount > headerTaskCount ? "by_shift" :
    headerTaskCount > 0 ? "by_task" :
    col0TaskCount > 0 ? "by_task" :
    "by_shift"

  // ── Build exclusion set from all known non-staff values ──────────────────
  const headerValueSet = new Set(headerRow.map((h) => h.toUpperCase()).filter((h) => h.length >= 2))
  // Also exclude first-column task names
  for (let row = headerRowIdx + 1; row < Math.min(data.length, 30); row++) {
    const cell = String(data[row]?.[0] ?? "").trim().toUpperCase()
    if (cell.length >= 2) headerValueSet.add(cell)
  }

  const staffSet = new Map<string, ParsedStaff>()
  const techniques: ParsedTechnique[] = []
  const shifts: ParsedShift[] = []
  const leaves: ParsedLeave[] = []
  const assignments: { date: string; initials: string; task?: string; shift?: string }[] = []

  // Detect dates — could be in first column (rows=days) or header row (columns=days)
  const dates: string[] = []
  const headerDates: string[] = []

  // Check header for dates
  for (let col = 1; col < headerRow.length; col++) {
    const d = isDate(data[headerRowIdx]?.[col])
    if (d) headerDates.push(toISO(d))
    else if (DAY_NAMES.has(norm(headerRow[col]))) headerDates.push("") // placeholder
  }

  // Check first column for dates
  for (let row = headerRowIdx + 1; row < data.length; row++) {
    const cell = data[row]?.[0]
    const d = isDate(cell)
    if (d) dates.push(toISO(d))
  }

  const allDates = dates.length > 0 ? dates : headerDates.filter(Boolean)
  const weekStart = allDates.length > 0 ? getMondayOfWeek(new Date(allDates[0] + "T12:00:00")) : toISO(new Date())

  if (mode === "by_task") {
    // Determine orientation
    const transposed = columnsAreDays && rowsAreTasks // rows=tasks, cols=days

    if (transposed) {
      // ── Transposed: rows = tasks, columns = days ──────────────────────
      // First column = technique names, header row = day names/dates
      let order = 0
      const techRows: { row: number; name: string }[] = []

      for (let row = headerRowIdx + 1; row < data.length; row++) {
        const cell = String(data[row]?.[0] ?? "").trim()
        if (!cell) continue
        if (isTaskHeader(cell)) {
          techniques.push({ name: cell, qualifiedInitials: [], order: order })
          techRows.push({ row, name: cell })
          order++
          headerValueSet.add(cell.toUpperCase())
        }
      }

      // Parse body — each column (after first) is a day, cells contain staff initials
      for (const tr of techRows) {
        const rowData = data[tr.row] ?? []
        for (let col = 1; col < rowData.length; col++) {
          const colDate = headerDates[col - 1] ?? ""
          const cellValue = String(rowData[col] ?? "").trim()
          if (!cellValue) continue

          const cellNorm = norm(cellValue)
          if (cellNorm === "all" || cellNorm === "todo" || cellNorm === "todos") {
            if (colDate) assignments.push({ date: colDate, initials: "ALL", task: tr.name })
            continue
          }

          const parts = cellValue.split(/[\/,\n]+/).map((p) => p.trim()).filter(Boolean)
          for (const part of parts) {
            const upper = part.toUpperCase().replace(/[^A-Z]/g, "")
            if (upper.length >= 2 && upper.length <= 3 && !headerValueSet.has(upper) && !isTaskHeader(part)) {
              if (!staffSet.has(upper)) {
                staffSet.set(upper, { initials: upper, firstName: "", lastName: "", department: "lab" })
              }
              const tech = techniques.find((t) => t.name === tr.name)
              if (tech && !tech.qualifiedInitials.includes(upper)) {
                tech.qualifiedInitials.push(upper)
              }
              if (colDate) assignments.push({ date: colDate, initials: upper, task: tr.name })
            }
          }
        }
      }
    } else {
      // ── Standard: headers = technique names, rows = days ──────────────
      let order = 0
      const techColumns: { col: number; name: string }[] = []

      for (let col = 1; col < headerRow.length; col++) {
        const h = headerRow[col]
        if (!h || h.length < 2) continue
        if (isTaskHeader(h) || headerTaskCount >= 3) {
          techniques.push({ name: h, qualifiedInitials: [], order: order })
          techColumns.push({ col, name: h })
          order++
        }
      }

      for (let row = headerRowIdx + 1; row < data.length; row++) {
        const rowData = data[row] ?? []
        const rowDate = dates[row - headerRowIdx - 1] ?? ""

        for (const tc of techColumns) {
          const cellValue = String(rowData[tc.col] ?? "").trim()
          if (!cellValue) continue

          const cellNorm = norm(cellValue)
          if (cellNorm === "all" || cellNorm === "todo" || cellNorm === "todos") {
            if (rowDate) assignments.push({ date: rowDate, initials: "ALL", task: tc.name })
            continue
          }

          const parts = cellValue.split(/[\/,\n]+/).map((p) => p.trim()).filter(Boolean)
          for (const part of parts) {
            const upper = part.toUpperCase().replace(/[^A-Z]/g, "")
            if (upper.length >= 2 && upper.length <= 3 && !headerValueSet.has(upper) && !isTaskHeader(part)) {
              if (!staffSet.has(upper)) {
                staffSet.set(upper, { initials: upper, firstName: "", lastName: "", department: "lab" })
              }
              const tech = techniques.find((t) => t.name === tc.name)
              if (tech && !tech.qualifiedInitials.includes(upper)) {
                tech.qualifiedInitials.push(upper)
              }
              if (rowDate) assignments.push({ date: rowDate, initials: upper, task: tc.name })
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
