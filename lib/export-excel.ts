import * as XLSX from "xlsx"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { Tecnica } from "@/lib/types/database"

/**
 * Export week rota as .xlsx — shift-based grid (matches on-screen shift view).
 * Rows = shifts (with staff names per cell), Columns = days.
 */
export function exportWeekByShift(data: RotaWeekData, locale: string) {
  const wb = XLSX.utils.book_new()

  // Day headers
  const dayHeaders = data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(dt)
  })

  // Get shift types sorted by sort_order
  const shifts = [...(data.shiftTypes ?? [])].sort((a, b) => a.sort_order - b.sort_order)

  // If no shift types, fall back to codes from assignments
  const shiftCodes = shifts.length > 0
    ? shifts.map((s) => s.code)
    : [...new Set(data.days.flatMap((d) => d.assignments.map((a) => a.shift_type)))].sort()

  // Find max number of staff in any shift on any day
  const maxPerShift: Record<string, number> = {}
  for (const code of shiftCodes) {
    let max = 0
    for (const day of data.days) {
      const count = day.assignments.filter((a) => a.shift_type === code).length
      if (count > max) max = count
    }
    maxPerShift[code] = Math.max(max, 1)
  }

  // Build rows: each shift gets maxPerShift rows
  // Header row
  const headers = ["Turno", ...dayHeaders]
  const rows: string[][] = [headers]

  const roleOrder: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }

  for (const code of shiftCodes) {
    const shift = shifts.find((s) => s.code === code)
    const timeLabel = shift ? `${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}` : ""
    const slotCount = maxPerShift[code]

    for (let slot = 0; slot < slotCount; slot++) {
      const row: string[] = []
      // First column: shift label only on first row of each shift
      if (slot === 0) {
        row.push(`${code} ${timeLabel}`.trim())
      } else {
        row.push("")
      }

      // Day columns: staff name for this slot
      for (const day of data.days) {
        const shiftAssignments = day.assignments
          .filter((a) => a.shift_type === code)
          .sort((a, b) => (roleOrder[a.staff.role] ?? 9) - (roleOrder[b.staff.role] ?? 9))

        if (slot < shiftAssignments.length) {
          const a = shiftAssignments[slot]
          const tecLabel = a.function_label ? ` (${a.function_label})` : ""
          row.push(`${a.staff.first_name} ${a.staff.last_name[0]}.${tecLabel}`)
        } else {
          row.push("")
        }
      }

      rows.push(row)
    }

    // Add empty separator row between shifts
    rows.push(Array(headers.length).fill(""))
  }

  // OFF row — staff not assigned
  const offHeader = ["OFF", ...data.days.map((day) => {
    const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
    const allStaffIds = new Set(Object.keys(data.staffNames))
    const leaveIds = new Set(data.onLeaveByDate[day.date] ?? [])
    const offStaff = [...allStaffIds]
      .filter((id) => !assignedIds.has(id) && !leaveIds.has(id))
      .map((id) => data.staffNames[id])
      .filter(Boolean)
      .sort()
    return offStaff.join(", ") || ""
  })]
  rows.push(offHeader)

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Auto-fit column widths
  ws["!cols"] = headers.map((_, i) => ({
    wch: Math.max(12, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
  }))

  // Freeze header row
  ws["!freeze"] = { xSplit: 0, ySplit: 1 }

  const weekLabel = dayHeaders[0] + " – " + dayHeaders[dayHeaders.length - 1]
  XLSX.utils.book_append_sheet(wb, ws, weekLabel.slice(0, 31))

  XLSX.writeFile(wb, `horario_${data.weekStart}.xlsx`)
}

/**
 * Export week rota as .xlsx — by task mode.
 * One row per technique per day.
 */
export function exportWeekByTask(data: RotaWeekData, tecnicas: Tecnica[], locale: string) {
  const wb = XLSX.utils.book_new()

  const headers = ["Fecha", "Día", "Técnica", "Personal 1", "Personal 2", "Personal 3", "Todo el equipo"]
  const rows: string[][] = [headers]

  const activeTecnicas = tecnicas.filter((t) => t.activa).sort((a, b) => a.orden - b.orden)

  for (const day of data.days) {
    const dt = new Date(day.date + "T12:00:00")
    const dayName = new Intl.DateTimeFormat(locale, { weekday: "long" }).format(dt)
    const dateStr = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(dt)

    for (const tecnica of activeTecnicas) {
      const techAssignments = day.assignments.filter((a) => a.function_label === tecnica.codigo)
      const isWholeTeam = techAssignments.some((a) => (a as unknown as { whole_team?: boolean }).whole_team)
      const staffNames = techAssignments.map((a) => `${a.staff.first_name} ${a.staff.last_name}`)

      rows.push([
        dateStr,
        dayName,
        tecnica.nombre_es,
        staffNames[0] ?? "",
        staffNames[1] ?? "",
        staffNames[2] ?? "",
        isWholeTeam ? "Sí" : "No",
      ])
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Auto-fit
  ws["!cols"] = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
  }))

  ws["!freeze"] = { xSplit: 0, ySplit: 1 }

  const weekLabel = data.weekStart
  XLSX.utils.book_append_sheet(wb, ws, `Semana ${weekLabel}`.slice(0, 31))

  XLSX.writeFile(wb, `horario_tareas_${data.weekStart}.xlsx`)
}
