import XLSX from "xlsx-js-style"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { Tecnica } from "@/lib/types/database"

const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }

// ── Design tokens ────────────────────────────────────────────────────────────

const HEADER_FILL  = { fgColor: { rgb: "1B4F8A" } }
const HEADER_FONT  = { bold: true, color: { rgb: "FFFFFF" }, sz: 11, name: "Calibri" }
const LABEL_FILL   = { fgColor: { rgb: "F1F5F9" } }
const LABEL_FONT   = { bold: true, sz: 10, name: "Calibri", color: { rgb: "1E293B" } }
const BODY_FONT    = { sz: 10, name: "Calibri", color: { rgb: "334155" } }
const TOTAL_FILL   = { fgColor: { rgb: "E2E8F0" } }
const TOTAL_FONT   = { bold: true, sz: 10, name: "Calibri", color: { rgb: "1E293B" } }
const OFF_FILL     = { fgColor: { rgb: "F1F5F9" } }
const BORDER_COLOR = { rgb: "CBD5E1" }
const BORDER = {
  top:    { style: "thin" as const, color: BORDER_COLOR },
  bottom: { style: "thin" as const, color: BORDER_COLOR },
  left:   { style: "thin" as const, color: BORDER_COLOR },
  right:  { style: "thin" as const, color: BORDER_COLOR },
}

type CellStyle = {
  font?: typeof HEADER_FONT | typeof LABEL_FONT | typeof BODY_FONT | typeof TOTAL_FONT
  fill?: typeof HEADER_FILL | typeof LABEL_FILL | typeof TOTAL_FILL | typeof OFF_FILL
  border?: typeof BORDER
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function dayHeaderLabels(data: RotaWeekData, locale: string): string[] {
  return data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(dt)
  })
}

function weekRangeLabel(data: RotaWeekData, locale: string): string {
  const s = new Date(data.weekStart + "T12:00:00")
  const e = new Date(data.weekStart + "T12:00:00")
  e.setDate(s.getDate() + 6)
  const sf = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(s)
  const ef = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(e)
  return `${sf} – ${ef}`
}

function setCell(ws: XLSX.WorkSheet, r: number, c: number, value: string | number, style: CellStyle) {
  const ref = XLSX.utils.encode_cell({ r, c })
  ws[ref] = { v: value, t: typeof value === "number" ? "n" : "s", s: style }
}

function applyColumnWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }))
}

function finalizeSheet(wb: XLSX.WorkBook, ws: XLSX.WorkSheet, sheetName: string, fileName: string, totalRows: number, totalCols: number) {
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: totalRows - 1, c: totalCols - 1 } })
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, fileName)
}

const headerStyle: CellStyle = { font: HEADER_FONT, fill: HEADER_FILL, border: BORDER, alignment: { horizontal: "center", vertical: "center", wrapText: true } }
const labelStyle: CellStyle  = { font: LABEL_FONT, fill: LABEL_FILL, border: BORDER, alignment: { vertical: "center", wrapText: true } }
const bodyStyle: CellStyle   = { font: BODY_FONT, border: BORDER, alignment: { vertical: "top", wrapText: true } }
const totalStyle: CellStyle  = { font: TOTAL_FONT, fill: TOTAL_FILL, border: BORDER, alignment: { horizontal: "center", vertical: "center" } }
const offLabelStyle: CellStyle = { font: LABEL_FONT, fill: OFF_FILL, border: BORDER, alignment: { vertical: "center" } }
const offBodyStyle: CellStyle  = { font: { ...BODY_FONT, color: { rgb: "64748B" } }, fill: OFF_FILL, border: BORDER, alignment: { vertical: "top", wrapText: true } }

// ── By shift export ─────────────────────────────────────────────────────────

export function exportWeekByShift(data: RotaWeekData, locale: string, daysAsRows?: boolean) {
  const wb = XLSX.utils.book_new()
  const ws: XLSX.WorkSheet = {}
  const headers = dayHeaderLabels(data, locale)
  const shifts = [...(data.shiftTypes ?? [])].filter((s) => s.active !== false).sort((a, b) => a.sort_order - b.sort_order)
  const shiftCodes = shifts.length > 0
    ? shifts.map((s) => s.code)
    : [...new Set(data.days.flatMap((d) => d.assignments.map((a) => a.shift_type)))].sort()

  function staffCell(dayIdx: number, code: string): string {
    const day = data.days[dayIdx]
    return day.assignments
      .filter((a) => a.shift_type === code)
      .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
      .map((a) => {
        const tecLabel = a.function_label ? ` (${a.function_label})` : ""
        return `${a.staff.first_name} ${a.staff.last_name[0]}.${tecLabel}`
      })
      .join("\n")
  }

  function offCell(dayIdx: number): string {
    const day = data.days[dayIdx]
    const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
    const leaveIds = new Set(data.onLeaveByDate[day.date] ?? [])
    return Object.keys(data.staffNames)
      .filter((id) => !assignedIds.has(id) && !leaveIds.has(id))
      .map((id) => data.staffNames[id])
      .filter(Boolean)
      .sort()
      .join("\n")
  }

  const offLabel = locale === "es" ? "Libre" : "Off"

  if (daysAsRows) {
    const numCols = shiftCodes.length + 2 // day + shifts + off
    // Title row
    setCell(ws, 0, 0, weekRangeLabel(data, locale), { font: { bold: true, sz: 13, name: "Calibri", color: { rgb: "1B4F8A" } }, alignment: { horizontal: "left" } })
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }]

    // Header row
    setCell(ws, 1, 0, "", headerStyle)
    shiftCodes.forEach((code, i) => {
      const s = shifts.find((sh) => sh.code === code)
      const label = s ? `${code}\n${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : code
      setCell(ws, 1, i + 1, label, headerStyle)
    })
    setCell(ws, 1, shiftCodes.length + 1, offLabel, { ...headerStyle, fill: { fgColor: { rgb: "64748B" } } })

    // Data rows
    for (let i = 0; i < data.days.length; i++) {
      const r = i + 2
      setCell(ws, r, 0, headers[i], labelStyle)
      shiftCodes.forEach((code, j) => setCell(ws, r, j + 1, staffCell(i, code), bodyStyle))
      setCell(ws, r, shiftCodes.length + 1, offCell(i), offBodyStyle)
    }

    const widths = [16, ...shiftCodes.map(() => 22), 22]
    applyColumnWidths(ws, widths)
    ws["!rows"] = [{ hpt: 22 }, { hpt: 32 }, ...data.days.map(() => ({ hpt: 50 }))]
    finalizeSheet(wb, ws, weekRangeLabel(data, locale), `horario_${data.weekStart}.xlsx`, data.days.length + 2, numCols)
  } else {
    const numCols = headers.length + 1 // label + days
    // Title row
    setCell(ws, 0, 0, weekRangeLabel(data, locale), { font: { bold: true, sz: 13, name: "Calibri", color: { rgb: "1B4F8A" } }, alignment: { horizontal: "left" } })
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }]

    // Header row
    setCell(ws, 1, 0, locale === "es" ? "Turno" : "Shift", headerStyle)
    headers.forEach((h, i) => setCell(ws, 1, i + 1, h, headerStyle))

    // Shift rows
    shiftCodes.forEach((code, si) => {
      const r = si + 2
      const shift = shifts.find((s) => s.code === code)
      const timeLabel = shift ? `${code}\n${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}` : code
      setCell(ws, r, 0, timeLabel, labelStyle)
      for (let i = 0; i < data.days.length; i++) {
        setCell(ws, r, i + 1, staffCell(i, code), bodyStyle)
      }
    })

    // OFF row
    const offR = shiftCodes.length + 2
    setCell(ws, offR, 0, offLabel, offLabelStyle)
    for (let i = 0; i < data.days.length; i++) {
      setCell(ws, offR, i + 1, offCell(i), offBodyStyle)
    }

    const totalRows = offR + 1
    const widths = [16, ...headers.map(() => 22)]
    applyColumnWidths(ws, widths)
    ws["!rows"] = [{ hpt: 22 }, { hpt: 32 }, ...shiftCodes.map(() => ({ hpt: 50 })), { hpt: 50 }]
    finalizeSheet(wb, ws, weekRangeLabel(data, locale), `horario_${data.weekStart}.xlsx`, totalRows, numCols)
  }
}

// ── By person export ────────────────────────────────────────────────────────

export function exportWeekByPerson(data: RotaWeekData, locale: string, daysAsRows?: boolean) {
  const wb = XLSX.utils.book_new()
  const ws: XLSX.WorkSheet = {}
  const headers = dayHeaderLabels(data, locale)

  // Build staff map
  const staffMap: Record<string, { name: string; role: string; days: Record<string, string>; total: number }> = {}
  for (const day of data.days) {
    for (const a of day.assignments) {
      if (!staffMap[a.staff_id]) {
        staffMap[a.staff_id] = {
          name: `${a.staff.first_name} ${a.staff.last_name[0]}.`,
          role: a.staff.role,
          days: {},
          total: 0,
        }
      }
      const tecLabel = a.function_label ? ` (${a.function_label})` : ""
      staffMap[a.staff_id].days[day.date] = `${a.shift_type}${tecLabel}`
      staffMap[a.staff_id].total++
    }
  }

  const sorted = Object.values(staffMap).sort((a, b) =>
    (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name)
  )

  if (daysAsRows) {
    const numCols = sorted.length + 1
    // Title
    setCell(ws, 0, 0, weekRangeLabel(data, locale), { font: { bold: true, sz: 13, name: "Calibri", color: { rgb: "1B4F8A" } }, alignment: { horizontal: "left" } })
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }]

    // Header: staff names
    setCell(ws, 1, 0, "", headerStyle)
    sorted.forEach((s, i) => setCell(ws, 1, i + 1, s.name, headerStyle))

    // Day rows
    for (let i = 0; i < data.days.length; i++) {
      const day = data.days[i]
      const r = i + 2
      setCell(ws, r, 0, headers[i], labelStyle)
      sorted.forEach((s, j) => {
        setCell(ws, r, j + 1, s.days[day.date] ?? "", { ...bodyStyle, alignment: { horizontal: "center", vertical: "center" } })
      })
    }

    // Total row
    const totalR = data.days.length + 2
    setCell(ws, totalR, 0, "Total", totalStyle)
    sorted.forEach((s, j) => setCell(ws, totalR, j + 1, s.total, totalStyle))

    const widths = [16, ...sorted.map(() => 14)]
    applyColumnWidths(ws, widths)
    ws["!rows"] = [{ hpt: 22 }, { hpt: 28 }, ...data.days.map(() => ({ hpt: 24 })), { hpt: 24 }]
    finalizeSheet(wb, ws, weekRangeLabel(data, locale), `horario_${data.weekStart}.xlsx`, totalR + 1, numCols)
  } else {
    const numCols = headers.length + 2 // name + days + total
    // Title
    setCell(ws, 0, 0, weekRangeLabel(data, locale), { font: { bold: true, sz: 13, name: "Calibri", color: { rgb: "1B4F8A" } }, alignment: { horizontal: "left" } })
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }]

    // Header
    setCell(ws, 1, 0, locale === "es" ? "Personal" : "Staff", headerStyle)
    headers.forEach((h, i) => setCell(ws, 1, i + 1, h, headerStyle))
    setCell(ws, 1, headers.length + 1, "Total", headerStyle)

    // Staff rows
    sorted.forEach((s, si) => {
      const r = si + 2
      setCell(ws, r, 0, s.name, labelStyle)
      data.days.forEach((day, di) => {
        setCell(ws, r, di + 1, s.days[day.date] ?? "", { ...bodyStyle, alignment: { horizontal: "center", vertical: "center" } })
      })
      setCell(ws, r, headers.length + 1, s.total, totalStyle)
    })

    const totalRows = sorted.length + 2
    const widths = [20, ...headers.map(() => 14), 8]
    applyColumnWidths(ws, widths)
    ws["!rows"] = [{ hpt: 22 }, { hpt: 28 }, ...sorted.map(() => ({ hpt: 24 }))]
    finalizeSheet(wb, ws, weekRangeLabel(data, locale), `horario_${data.weekStart}.xlsx`, totalRows, numCols)
  }
}

// ── By task export ──────────────────────────────────────────────────────────

export function exportWeekByTask(data: RotaWeekData, tecnicas: Tecnica[], locale: string, daysAsRows?: boolean) {
  const wb = XLSX.utils.book_new()
  const ws: XLSX.WorkSheet = {}
  const headers = dayHeaderLabels(data, locale)
  const activeTecnicas = tecnicas.filter((t) => t.activa).sort((a, b) => a.orden - b.orden)

  function staffForTechDay(tc: Tecnica, dayIdx: number): string {
    const day = data.days[dayIdx]
    const assignments = day.assignments.filter((a) => a.function_label === tc.codigo)
    const isWholeTeam = assignments.some((a) => (a as unknown as { whole_team?: boolean }).whole_team)
    if (isWholeTeam) return locale === "es" ? "Todo" : "All"
    return assignments.map((a) => `${a.staff.first_name} ${a.staff.last_name[0]}.`).join("\n")
  }

  if (daysAsRows) {
    const numCols = activeTecnicas.length + 1
    // Title
    setCell(ws, 0, 0, weekRangeLabel(data, locale), { font: { bold: true, sz: 13, name: "Calibri", color: { rgb: "1B4F8A" } }, alignment: { horizontal: "left" } })
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }]

    // Header: technique names
    setCell(ws, 1, 0, "", headerStyle)
    activeTecnicas.forEach((t, i) => setCell(ws, 1, i + 1, t.nombre_es, headerStyle))

    // Day rows
    for (let i = 0; i < data.days.length; i++) {
      const r = i + 2
      setCell(ws, r, 0, headers[i], labelStyle)
      activeTecnicas.forEach((tc, j) => setCell(ws, r, j + 1, staffForTechDay(tc, i), bodyStyle))
    }

    const widths = [16, ...activeTecnicas.map(() => 20)]
    applyColumnWidths(ws, widths)
    ws["!rows"] = [{ hpt: 22 }, { hpt: 28 }, ...data.days.map(() => ({ hpt: 40 }))]
    finalizeSheet(wb, ws, weekRangeLabel(data, locale), `horario_tareas_${data.weekStart}.xlsx`, data.days.length + 2, numCols)
  } else {
    const numCols = headers.length + 1
    // Title
    setCell(ws, 0, 0, weekRangeLabel(data, locale), { font: { bold: true, sz: 13, name: "Calibri", color: { rgb: "1B4F8A" } }, alignment: { horizontal: "left" } })
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }]

    // Header
    setCell(ws, 1, 0, locale === "es" ? "Técnica" : "Technique", headerStyle)
    headers.forEach((h, i) => setCell(ws, 1, i + 1, h, headerStyle))

    // Technique rows
    activeTecnicas.forEach((tc, ti) => {
      const r = ti + 2
      setCell(ws, r, 0, tc.nombre_es, labelStyle)
      for (let i = 0; i < data.days.length; i++) {
        setCell(ws, r, i + 1, staffForTechDay(tc, i), bodyStyle)
      }
    })

    const totalRows = activeTecnicas.length + 2
    const widths = [22, ...headers.map(() => 20)]
    applyColumnWidths(ws, widths)
    ws["!rows"] = [{ hpt: 22 }, { hpt: 28 }, ...activeTecnicas.map(() => ({ hpt: 40 }))]
    finalizeSheet(wb, ws, weekRangeLabel(data, locale), `horario_tareas_${data.weekStart}.xlsx`, totalRows, numCols)
  }
}
