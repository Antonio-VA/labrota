import * as XLSX from "xlsx"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { Tecnica } from "@/lib/types/database"

/**
 * Export week rota as .xlsx — by shift mode.
 * One sheet with rows = staff, columns = days, cells = shift type + technique.
 */
export function exportWeekByShift(data: RotaWeekData, locale: string) {
  const wb = XLSX.utils.book_new()

  // Build header: Staff | Role | Mon | Tue | ... | Sun | Total
  const dayHeaders = data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(dt)
  })
  const headers = ["Personal", "Departamento", ...dayHeaders, "Total"]

  // Build staff map: staff_id → { name, role, days: { date → shift+tecnica } }
  const staffMap: Record<string, {
    name: string; role: string; days: Record<string, string>; total: number
  }> = {}

  for (const day of data.days) {
    for (const a of day.assignments) {
      if (!staffMap[a.staff_id]) {
        staffMap[a.staff_id] = {
          name: `${a.staff.first_name} ${a.staff.last_name}`,
          role: a.staff.role === "lab" ? "Embriología" : a.staff.role === "andrology" ? "Andrología" : "Admin",
          days: {},
          total: 0,
        }
      }
      const tecLabel = a.function_label ? ` (${a.function_label})` : ""
      staffMap[a.staff_id].days[day.date] = `${a.shift_type}${tecLabel}`
      staffMap[a.staff_id].total++
    }
  }

  // Sort by role then name
  const roleOrder: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
  const sorted = Object.values(staffMap).sort((a, b) => {
    const ra = roleOrder[a.role === "Embriología" ? "lab" : a.role === "Andrología" ? "andrology" : "admin"] ?? 9
    const rb = roleOrder[b.role === "Embriología" ? "lab" : b.role === "Andrología" ? "andrology" : "admin"] ?? 9
    return ra - rb || a.name.localeCompare(b.name)
  })

  const rows = [headers]
  for (const s of sorted) {
    const row = [s.name, s.role]
    for (const day of data.days) {
      row.push(s.days[day.date] ?? "—")
    }
    row.push(String(s.total))
    rows.push(row)
  }

  const ws = XLSX.utils.aoa_to_sheet(rows)

  // Auto-fit column widths
  ws["!cols"] = headers.map((h, i) => ({
    wch: Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
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
