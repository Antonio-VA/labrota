import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { Tecnica } from "@/lib/types/database"
import { formatTime } from "@/lib/format-time"

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string, locale: string): string {
  const d = new Date(iso + "T12:00:00")
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(d)
}

function fmtWeekRange(weekStart: string, locale: string): string {
  const start = new Date(weekStart + "T12:00:00")
  const end = new Date(weekStart + "T12:00:00")
  end.setDate(start.getDate() + 6)
  const s = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(start)
  const e = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(end)
  return `${s} – ${e}`
}

function slugify(s: string): string {
  return s.replace(/[^a-zA-Z0-9]+/g, "").replace(/\s+/g, "")
}

function getBiopsyForecast(
  date: string,
  punctionsDefault: Record<string, number>,
  punctionsOverride: Record<string, number>,
  conversionRate: number,
  day5Pct: number,
  day6Pct: number,
): number {
  function getPunc(dateStr: string): number {
    if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
    if (punctionsDefault[dateStr] !== undefined) return punctionsDefault[dateStr]
    const dow = new Date(dateStr + "T12:00:00").getDay()
    const sameDow = Object.entries(punctionsDefault).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
    return sameDow ? sameDow[1] : 0
  }
  const d5 = new Date(date + "T12:00:00"); d5.setDate(d5.getDate() - 5)
  const d6 = new Date(date + "T12:00:00"); d6.setDate(d6.getDate() - 6)
  return Math.round(
    getPunc(d5.toISOString().split("T")[0]) * conversionRate * day5Pct +
    getPunc(d6.toISOString().split("T")[0]) * conversionRate * day6Pct
  )
}

// ── By shift export ──────────────────────────────────────────────────────────

export function exportPdfByShift(data: RotaWeekData, orgName: string, locale: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const timeFormat = data.timeFormat ?? "24h"

  // Header
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text(orgName, 14, 14)
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(100, 116, 139)
  doc.text(fmtWeekRange(data.weekStart, locale), 14, 20)

  if (data.rota?.status === "published") {
    doc.setTextColor(5, 150, 105)
    doc.text("✓ Publicado" + (data.rota.published_by ? ` · ${data.rota.published_by}` : ""), pageWidth - 14, 14, { align: "right" })
  }

  // Day headers
  const dayHeaders = data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(dt)
    const num = dt.getDate()
    const effectiveP = data.rota?.punctions_override?.[d.date] ?? data.punctionsDefault[d.date] ?? 0
    const biopsy = getBiopsyForecast(d.date, data.punctionsDefault, data.rota?.punctions_override ?? {}, data.biopsyConversionRate, data.biopsyDay5Pct, data.biopsyDay6Pct)
    let label = `${wday} ${num}`
    if (effectiveP > 0) label += `\nP:${effectiveP}`
    if (biopsy > 0) label += ` B:${biopsy}`
    return label
  })

  // Build shift rows
  const shiftTypes = (data.shiftTypes ?? []).filter((s) => s.active !== false).sort((a, b) => a.sort_order - b.sort_order)
  const body: string[][] = []

  for (const st of shiftTypes) {
    const row: string[] = [
      `${st.code}\n${formatTime(st.start_time, timeFormat)}–${formatTime(st.end_time, timeFormat)}`
    ]
    for (const day of data.days) {
      const assignments = day.assignments
        .filter((a) => a.shift_type === st.code)
        .sort((a, b) => {
          const order: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
          return (order[a.staff.role] ?? 9) - (order[b.staff.role] ?? 9)
        })
      const names = assignments.map((a) => {
        let name = `${a.staff.first_name} ${a.staff.last_name[0]}.`
        if (a.function_label) name += ` (${a.function_label})`
        return name
      })
      row.push(names.join("\n") || "—")
    }
    body.push(row)
  }

  autoTable(doc, {
    startY: 26,
    head: [["", ...dayHeaders]],
    body,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: [204, 221, 238],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 251],
      textColor: [100, 116, 139],
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: "bold", halign: "right" },
    },
    margin: { left: 14, right: 14 },
    tableWidth: "auto",
  })

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight()
  const timestamp = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(`Generado en LabRota · ${timestamp}`, pageWidth / 2, pageHeight - 6, { align: "center" })

  // Download
  const filename = `${slugify(orgName)}-rota-${data.weekStart}.pdf`
  doc.save(filename)
}

// ── By task export ───────────────────────────────────────────────────────────

export function exportPdfByTask(data: RotaWeekData, tecnicas: Tecnica[], orgName: string, locale: string) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header
  doc.setFontSize(14)
  doc.setFont("helvetica", "bold")
  doc.text(orgName, 14, 14)
  doc.setFontSize(10)
  doc.setFont("helvetica", "normal")
  doc.setTextColor(100, 116, 139)
  doc.text(fmtWeekRange(data.weekStart, locale), 14, 20)

  // Day headers
  const dayHeaders = data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(dt)
    return `${wday} ${dt.getDate()}`
  })

  const activeTecnicas = tecnicas.filter((t) => t.activa).sort((a, b) => a.orden - b.orden)
  const body: string[][] = []

  for (const tc of activeTecnicas) {
    const row: string[] = [tc.nombre_es]
    for (const day of data.days) {
      const assignments = day.assignments.filter((a) => a.function_label === tc.codigo)
      const isWholeTeam = assignments.some((a) => (a as unknown as { whole_team?: boolean }).whole_team)
      if (isWholeTeam) {
        row.push("All")
      } else {
        const names = assignments.map((a) => `${a.staff.first_name} ${a.staff.last_name[0]}.`)
        row.push(names.join(" / ") || "—")
      }
    }
    body.push(row)
  }

  autoTable(doc, {
    startY: 26,
    head: [["Técnica", ...dayHeaders]],
    body,
    theme: "grid",
    styles: {
      fontSize: 7,
      cellPadding: 2,
      lineColor: [204, 221, 238],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [241, 245, 251],
      textColor: [100, 116, 139],
      fontStyle: "bold",
      fontSize: 7,
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: "bold" },
    },
    margin: { left: 14, right: 14 },
    tableWidth: "auto",
  })

  // Footer
  const pageHeight = doc.internal.pageSize.getHeight()
  const timestamp = new Intl.DateTimeFormat("es", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())
  doc.setFontSize(7)
  doc.setTextColor(148, 163, 184)
  doc.text(`Generado en LabRota · ${timestamp}`, pageWidth / 2, pageHeight - 6, { align: "center" })

  const filename = `${slugify(orgName)}-rota-${data.weekStart}.pdf`
  doc.save(filename)
}
