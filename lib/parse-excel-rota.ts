import type * as XLSXType from "xlsx"
import { getMondayOf, toISODate } from "@/lib/format-date"

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
  "genomix", "transport", "tesa",
  "admin", "off", "holiday", "holidays", "sick", "leave", "annual",
  "denudation", "denudación", "vitrification", "vitrificación",
  "congelación", "análisis seminal", "preparación",
  "transferencia", "punción", "control de calidad",
])

// Headers that are NOT real techniques — recognized for mode detection but excluded from technique list
const NON_TECHNIQUE_HEADERS = new Set([
  "off", "admin", "holiday", "holidays", "sick", "leave", "annual",
  "transport", "day off", "free", "libre", "vacaciones", "baja",
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

function isDate(cell: unknown, SSF?: typeof XLSXType.SSF): Date | null {
  if (cell instanceof Date) return cell
  if (typeof cell === "number" && SSF) {
    const d = SSF.parse_date_code(cell)
    if (d) return new Date(d.y, d.m - 1, d.d)
  }
  if (typeof cell === "string") {
    const d = new Date(cell)
    if (!isNaN(d.getTime()) && cell.length > 4) return d
  }
  return null
}

function toISO(d: Date): string {
  return toISODate(d)
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

export async function getSheetNames(buffer: ArrayBuffer): Promise<string[]> {
  const XLSX = await import("xlsx")
  const wb = XLSX.read(buffer, { type: "array" })
  return wb.SheetNames
}

export async function parseSheet(buffer: ArrayBuffer, sheetName: string): Promise<ParsedRota> {
  const XLSX = await import("xlsx")
  const wb = XLSX.read(buffer, { type: "array", cellDates: true })
  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error("Sheet not found")

  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" })
  if (data.length < 2) throw new Error("Sheet has insufficient data")

  // Find the header row — the row with the MOST task/shift keyword matches
  // This handles title rows ("OT 1", "QC", "TEAM A") that precede the real header
  let headerRowIdx = 0
  let bestHeaderScore = 0
  for (let i = 0; i < Math.min(data.length, 15); i++) {
    const row = (data[i] ?? []).map((c) => String(c ?? "").trim())
    const nonEmpty = row.filter((c) => c).length
    if (nonEmpty < 3) continue
    let score = 0
    for (const cell of row) {
      if (isTaskHeader(cell)) score += 2
      const n = norm(cell)
      for (const kw of SHIFT_KEYWORDS) { if (n === kw || n.includes(kw)) { score++; break } }
    }
    if (score > bestHeaderScore) { bestHeaderScore = score; headerRowIdx = i }
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
  const columnsAreDays = headerDayCount >= 3 || headerRow.some((h) => isDate(h, XLSX.SSF) !== null)
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
    const d = isDate(data[headerRowIdx]?.[col], XLSX.SSF)
    if (d) headerDates.push(toISO(d))
    else if (DAY_NAMES.has(norm(headerRow[col]))) headerDates.push("") // placeholder
  }

  // Check first column for dates — handle "MONDAY 23", plain dates, or "23" embedded in text
  // Also scan title rows for date ranges like "23-29 MARCH" to establish the month/year
  let refMonth = new Date().getMonth()
  let refYear = new Date().getFullYear()
  for (let i = 0; i <= headerRowIdx; i++) {
    for (let c = 0; c < (data[i]?.length ?? 0); c++) {
      const cell = String(data[i]?.[c] ?? "")
      // Match patterns like "23-29 MARCH", "23-29 MARCH 2026"
      const rangeMatch = cell.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-záéíóúñ]+)\s*(\d{4})?/i)
      if (rangeMatch) {
        const monthNames: Record<string, number> = {
          january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
          july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
          enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
          julio: 6, agosto: 7, septiembre: 8, octubre: 9, noviembre: 10, diciembre: 11,
          mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
        }
        const mn = monthNames[rangeMatch[3].toLowerCase()]
        if (mn !== undefined) refMonth = mn
        if (rangeMatch[4]) refYear = parseInt(rangeMatch[4], 10)
      }
    }
  }

  for (let row = headerRowIdx + 1; row < data.length; row++) {
    const cell = data[row]?.[0]
    const d = isDate(cell, XLSX.SSF)
    if (d) { dates.push(toISO(d)); continue }
    // Try "MONDAY 23" or "23" pattern
    const cellStr = String(cell ?? "").trim()
    const numMatch = cellStr.match(/(\d{1,2})/)
    if (numMatch && cellStr.length > 1) {
      const dayNum = parseInt(numMatch[1], 10)
      if (dayNum >= 1 && dayNum <= 31) {
        const constructed = new Date(refYear, refMonth, dayNum, 12, 0, 0)
        if (!isNaN(constructed.getTime())) {
          dates.push(toISO(constructed))
        }
      }
    }
  }

  // Deduplicate dates (multi-row days produce duplicates)
  const uniqueDates = [...new Set(dates)]
  const allDates = uniqueDates.length > 0 ? uniqueDates : headerDates.filter(Boolean)
  const weekStart = allDates.length > 0 ? getMondayOf(allDates[0]) : toISO(new Date())

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
          headerValueSet.add(cell.toUpperCase())
          if (!NON_TECHNIQUE_HEADERS.has(norm(cell))) {
            techniques.push({ name: cell, qualifiedInitials: [], order: order })
            order++
          }
          techRows.push({ row, name: cell })
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
                staffSet.set(upper, { initials: upper, firstName: upper[0] ?? "", lastName: upper[1] ?? "", department: "lab" })
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
          techColumns.push({ col, name: h })
          if (!NON_TECHNIQUE_HEADERS.has(norm(h))) {
            techniques.push({ name: h, qualifiedInitials: [], order: order })
            order++
          }
        }
      }

      // Parse body — handle multi-row days (day label in col A, continuation rows blank in col A)
      let currentDate = ""
      for (let row = headerRowIdx + 1; row < data.length; row++) {
        const rowData = data[row] ?? []

        // Check column A for a day label (e.g. "MONDAY 23", "TUESDAY 24", or a date)
        const colA = String(rowData[0] ?? "").trim()
        if (colA) {
          // Try to extract a date from "MONDAY 23" or "23" or an actual date
          const dateMatch = colA.match(/(\d{1,2})\s*$/) // trailing number = day of month
          const fullDate = isDate(rowData[0], XLSX.SSF)
          if (fullDate) {
            currentDate = toISO(fullDate)
          } else if (dateMatch && allDates.length > 0) {
            // Find a date in allDates whose day matches
            const dayNum = parseInt(dateMatch[1], 10)
            const match = allDates.find((d) => new Date(d + "T12:00:00").getDate() === dayNum)
            if (match) currentDate = match
          } else if (DAY_NAMES.has(norm(colA.split(/\s+/)[0]))) {
            // Day name like "MONDAY" — try to find next date
            const dayNum = colA.match(/\d+/)
            if (dayNum) {
              const num = parseInt(dayNum[0], 10)
              const match = allDates.find((d) => new Date(d + "T12:00:00").getDate() === num)
              if (match) currentDate = match
            }
          }
        }
        // If colA is blank, this is a continuation row for the same day — keep currentDate

        if (!currentDate) continue

        for (const tc of techColumns) {
          const cellValue = String(rowData[tc.col] ?? "").trim()
          if (!cellValue) continue

          const cellNorm = norm(cellValue)
          if (cellNorm === "all" || cellNorm === "todo" || cellNorm === "todos") {
            if (currentDate) assignments.push({ date: currentDate, initials: "ALL", task: tc.name })
            continue
          }

          const parts = cellValue.split(/[\/,\n]+/).map((p) => p.trim()).filter(Boolean)
          for (const part of parts) {
            const upper = part.toUpperCase().replace(/[^A-Z]/g, "")
            if (upper.length >= 2 && upper.length <= 3 && !headerValueSet.has(upper) && !isTaskHeader(part)) {
              if (!staffSet.has(upper)) {
                staffSet.set(upper, { initials: upper, firstName: upper[0] ?? "", lastName: upper[1] ?? "", department: "lab" })
              }
              const tech = techniques.find((t) => t.name === tc.name)
              if (tech && !tech.qualifiedInitials.includes(upper)) {
                tech.qualifiedInitials.push(upper)
              }
              if (currentDate) assignments.push({ date: currentDate, initials: upper, task: tc.name })
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
              staffSet.set(upper, { initials: upper, firstName: upper[0] ?? "", lastName: upper[1] ?? "", department: "lab" })
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
