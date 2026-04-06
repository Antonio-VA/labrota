import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { StaffReportData, TechReportData } from "@/app/(clinic)/reports/actions"

const TIMESTAMP = () => {
  const locale = typeof document !== "undefined"
    ? (document.cookie.match(/(?:^|; )locale=(\w+)/)?.[1] ?? "es")
    : "es"
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date())
}

export function exportStaffReportPdf(data: StaffReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const colHeader = data.mode === "by_task" ? "Asignaciones" : "Turnos"
  const margin = 14

  // Header
  doc.setFontSize(14)
  doc.text("Resumen de personal", margin, 20)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`${data.orgName} · ${data.periodLabel}`, margin, 27)

  // Summary
  doc.text(
    `Total días: ${data.totalDays}  ·  Media ${colHeader.toLowerCase()}: ${data.meanAssignments}  ·  Personal activo: ${data.activeStaff}`,
    margin, 34
  )
  doc.setTextColor(0)

  // Table
  const head = [["Personal", "Departamento", colHeader, "Días libres", "Ausencia", "vs. media"]]
  const body = data.rows.map((r) => [
    `${r.firstName} ${r.lastName}`,
    r.department,
    String(r.assignments),
    String(r.daysOff),
    String(r.daysLeave),
    `${r.vsMean > 0 ? "+" : ""}${r.vsMean}`,
  ])

  const threshold = data.meanAssignments * 0.3

  autoTable(doc, {
    startY: 38,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [241, 245, 251], textColor: [80, 80, 80], fontStyle: "bold" },
    didParseCell(hookData) {
      if (hookData.section === "body") {
        const row = data.rows[hookData.row.index]
        if (row) {
          if (row.vsMean > threshold) {
            hookData.cell.styles.fillColor = [255, 251, 235]
          } else if (row.vsMean < -threshold) {
            hookData.cell.styles.fillColor = [239, 246, 255]
          }
        }
      }
    },
  })

  // Footer
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text(`Generado en LabRota · ${TIMESTAMP()}`, margin, pageH - 8)
  doc.text("El informe incluye solo personal activo durante el período seleccionado.", margin, pageH - 4)

  const slug = data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  doc.save(`${slug}-resumen-personal-${data.from}-${data.to}.pdf`)
}

export function exportTechReportPdf(data: TechReportData) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const margin = 14

  doc.setFontSize(14)
  doc.text("Cobertura de tareas", margin, 20)
  doc.setFontSize(9)
  doc.setTextColor(100)
  doc.text(`${data.orgName} · ${data.periodLabel}`, margin, 27)
  doc.text(
    `Total días: ${data.totalDays}  ·  Tareas configuradas: ${data.techniqueCount}  ·  Días con gaps: ${data.daysWithGaps}`,
    margin, 34
  )
  doc.setTextColor(0)

  const head = [["Tarea", "Días cubiertos", "Sin cobertura", "Cobertura %", "Cualificados"]]
  const body = data.rows.map((r) => [
    r.nombre,
    String(r.daysCovered),
    String(r.daysUncovered),
    `${r.coveragePct}%`,
    String(r.qualifiedStaff),
  ])

  autoTable(doc, {
    startY: 38,
    head,
    body,
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [241, 245, 251], textColor: [80, 80, 80], fontStyle: "bold" },
    didParseCell(hookData) {
      if (hookData.section === "body") {
        const row = data.rows[hookData.row.index]
        if (row) {
          if (row.coveragePct === 0) {
            hookData.cell.styles.fillColor = [254, 242, 242]
          } else if (row.coveragePct < 80) {
            hookData.cell.styles.fillColor = [255, 251, 235]
          }
        }
      }
    },
  })

  const pageH = doc.internal.pageSize.getHeight()
  doc.setFontSize(7)
  doc.setTextColor(150)
  doc.text(`Generado en LabRota · ${TIMESTAMP()}`, margin, pageH - 8)
  doc.text("Un día se considera cubierto si al menos una persona fue asignada a la tarea.", margin, pageH - 4)

  const slug = data.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-")
  doc.save(`${slug}-cobertura-tareas-${data.from}-${data.to}.pdf`)
}
