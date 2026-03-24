import * as XLSX from "xlsx"
import type { StaffReportData, TechReportData } from "@/app/(clinic)/reports/actions"

function autoFit(ws: XLSX.WorkSheet, data: string[][]) {
  const cols = data[0]?.map((_, i) => ({
    wch: Math.max(...data.map((row) => (row[i] ?? "").toString().length), 8) + 2,
  }))
  ws["!cols"] = cols
}

export function exportStaffReportExcel(data: StaffReportData) {
  const colHeader = data.mode === "by_task" ? "Asignaciones" : "Turnos"

  const header = [
    ["Resumen de personal"],
    [`${data.orgName} · ${data.periodLabel}`],
    [`Total días: ${data.totalDays}  ·  Media: ${data.meanAssignments}  ·  Personal activo: ${data.activeStaff}`],
    [],
    ["Personal", "Departamento", colHeader, "Días libres", "Ausencia", "vs. media"],
  ]

  const rows = data.rows.map((r) => [
    `${r.firstName} ${r.lastName}`,
    r.department,
    r.assignments,
    r.daysOff,
    r.daysLeave,
    r.vsMean,
  ])

  const allData = [...header, ...rows.map((r) => r.map(String))]
  const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
  autoFit(ws, allData)
  ws["!freeze"] = { xSplit: 0, ySplit: 5 }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Resumen de personal")

  const slug = data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  XLSX.writeFile(wb, `${slug}-resumen-personal-${data.from}-${data.to}.xlsx`)
}

export function exportTechReportExcel(data: TechReportData) {
  const header = [
    ["Cobertura de tareas"],
    [`${data.orgName} · ${data.periodLabel}`],
    [`Total días: ${data.totalDays}  ·  Tareas: ${data.techniqueCount}  ·  Días con gaps: ${data.daysWithGaps}`],
    [],
    ["Tarea", "Días cubiertos", "Sin cobertura", "Cobertura %", "Cualificados"],
  ]

  const rows = data.rows.map((r) => [
    r.nombre,
    r.daysCovered,
    r.daysUncovered,
    r.coveragePct / 100,
    r.qualifiedStaff,
  ])

  const allData = [...header, ...rows.map((r) => r.map(String))]
  const ws = XLSX.utils.aoa_to_sheet([...header, ...rows])
  autoFit(ws, allData)
  ws["!freeze"] = { xSplit: 0, ySplit: 5 }

  // Format coverage % column as percentage
  for (let i = 0; i < rows.length; i++) {
    const cell = ws[XLSX.utils.encode_cell({ r: i + 5, c: 3 })]
    if (cell) cell.z = "0%"
  }

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Cobertura de tareas")

  const slug = data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  XLSX.writeFile(wb, `${slug}-cobertura-tareas-${data.from}-${data.to}.xlsx`)
}
