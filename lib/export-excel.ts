import * as XLSX from "xlsx"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { Tecnica } from "@/lib/types/database"

const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }

function dayHeaderLabels(data: RotaWeekData, locale: string): string[] {
  return data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(dt)
  })
}

function writeSheet(wb: XLSX.WorkBook, rows: string[][], sheetName: string, fileName: string) {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws["!cols"] = rows[0].map((_, i) => ({
    wch: Math.max(12, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
  }))
  ws["!freeze"] = { xSplit: 0, ySplit: 1 }
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31))
  XLSX.writeFile(wb, fileName)
}

/**
 * Export week rota as .xlsx — shift-based grid.
 * Standard: rows = shifts, columns = days.
 * daysAsRows: rows = days, columns = shifts.
 */
export function exportWeekByShift(data: RotaWeekData, locale: string, daysAsRows?: boolean) {
  const wb = XLSX.utils.book_new()
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
      .join(", ")
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
      .join(", ")
  }

  const offLabel = locale === "es" ? "Libre" : "Off"
  const rows: string[][] = []

  if (daysAsRows) {
    // Header: [empty, Shift1 time, Shift2 time, ..., OFF]
    const shiftHeaders = shiftCodes.map((code) => {
      const s = shifts.find((sh) => sh.code === code)
      return s ? `${code} ${s.start_time.slice(0, 5)}–${s.end_time.slice(0, 5)}` : code
    })
    rows.push(["", ...shiftHeaders, offLabel])

    for (let i = 0; i < data.days.length; i++) {
      const row = [headers[i]]
      for (const code of shiftCodes) row.push(staffCell(i, code))
      row.push(offCell(i))
      rows.push(row)
    }
  } else {
    // Header: [Turno, Day1, Day2, ...]
    rows.push(["Turno", ...headers])

    for (const code of shiftCodes) {
      const shift = shifts.find((s) => s.code === code)
      const timeLabel = shift ? `${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}` : ""
      const row = [`${code} ${timeLabel}`.trim()]
      for (let i = 0; i < data.days.length; i++) row.push(staffCell(i, code))
      rows.push(row)
    }

    // OFF row
    const offRow = [offLabel]
    for (let i = 0; i < data.days.length; i++) offRow.push(offCell(i))
    rows.push(offRow)
  }

  const weekLabel = headers[0] + " – " + headers[headers.length - 1]
  writeSheet(wb, rows, weekLabel, `horario_${data.weekStart}.xlsx`)
}

/**
 * Export week rota as .xlsx — person-based grid.
 * Standard: rows = staff, columns = days (shift codes in cells).
 * daysAsRows: rows = days, columns = staff.
 */
export function exportWeekByPerson(data: RotaWeekData, locale: string, daysAsRows?: boolean) {
  const wb = XLSX.utils.book_new()
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

  const rows: string[][] = []

  if (daysAsRows) {
    // Header: [empty, Staff1, Staff2, ...]
    rows.push(["", ...sorted.map((s) => s.name)])

    for (let i = 0; i < data.days.length; i++) {
      const day = data.days[i]
      const row = [headers[i]]
      for (const s of sorted) row.push(s.days[day.date] ?? "")
      rows.push(row)
    }

    // Total row
    const totalRow = ["Total"]
    for (const s of sorted) totalRow.push(String(s.total))
    rows.push(totalRow)
  } else {
    // Header: [Personal, Day1, Day2, ..., Total]
    rows.push([locale === "es" ? "Personal" : "Staff", ...headers, "Total"])

    for (const s of sorted) {
      const row = [s.name]
      for (const day of data.days) row.push(s.days[day.date] ?? "")
      row.push(String(s.total))
      rows.push(row)
    }
  }

  const weekLabel = headers[0] + " – " + headers[headers.length - 1]
  writeSheet(wb, rows, weekLabel, `horario_${data.weekStart}.xlsx`)
}

/**
 * Export week rota as .xlsx — by task mode.
 * Standard: rows = techniques, columns = days.
 * daysAsRows: rows = days, columns = techniques.
 */
export function exportWeekByTask(data: RotaWeekData, tecnicas: Tecnica[], locale: string, daysAsRows?: boolean) {
  const wb = XLSX.utils.book_new()
  const headers = dayHeaderLabels(data, locale)
  const activeTecnicas = tecnicas.filter((t) => t.activa).sort((a, b) => a.orden - b.orden)

  function staffForTechDay(tc: Tecnica, dayIdx: number): string {
    const day = data.days[dayIdx]
    const assignments = day.assignments.filter((a) => a.function_label === tc.codigo)
    const isWholeTeam = assignments.some((a) => (a as unknown as { whole_team?: boolean }).whole_team)
    if (isWholeTeam) return locale === "es" ? "Todo" : "All"
    return assignments.map((a) => `${a.staff.first_name} ${a.staff.last_name[0]}.`).join(", ")
  }

  const rows: string[][] = []

  if (daysAsRows) {
    // Header: [empty, Tech1, Tech2, ...]
    rows.push(["", ...activeTecnicas.map((t) => t.nombre_es)])

    for (let i = 0; i < data.days.length; i++) {
      const row = [headers[i]]
      for (const tc of activeTecnicas) row.push(staffForTechDay(tc, i))
      rows.push(row)
    }
  } else {
    // Header: [Técnica, Day1, Day2, ...]
    rows.push([locale === "es" ? "Técnica" : "Technique", ...headers])

    for (const tc of activeTecnicas) {
      const row = [tc.nombre_es]
      for (let i = 0; i < data.days.length; i++) row.push(staffForTechDay(tc, i))
      rows.push(row)
    }
  }

  const weekLabel = headers[0] + " – " + headers[headers.length - 1]
  writeSheet(wb, rows, weekLabel, `horario_tareas_${data.weekStart}.xlsx`)
}
