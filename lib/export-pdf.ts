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

function fmtTimestamp(locale: string): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es" : "en", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date())
}

// ── Design tokens (printer-friendly B&W) ────────────────────────────────────

const COLORS = {
  black:      [0, 0, 0] as [number, number, number],
  darkGray:   [51, 51, 51] as [number, number, number],
  gray:       [120, 120, 120] as [number, number, number],
  lightGray:  [180, 180, 180] as [number, number, number],
  border:     [160, 160, 160] as [number, number, number],
  white:      [255, 255, 255] as [number, number, number],
}

const MARGIN = 14
const FONT = "helvetica"

/** Share or open PDF — uses Web Share API on mobile, opens in new tab on desktop */
async function sharePdf(doc: jsPDF, filename: string) {
  const blob = doc.output("blob")
  const file = new File([blob], filename, { type: "application/pdf" })

  // Try native share (works on mobile Safari, Chrome Android, etc.)
  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch {
      // User cancelled or share failed — fall through to open
    }
  }

  // Fallback: open in new tab
  const url = URL.createObjectURL(blob)
  window.open(url, "_blank")
  // Revoke after a delay so the tab can load
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

// ── By shift export ──────────────────────────────────────────────────────────

export async function exportPdfByShift(data: RotaWeekData, orgName: string, locale: string, notes?: string[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const timeFormat = data.timeFormat ?? "24h"
  const timestamp = fmtTimestamp(locale)

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(16)
  doc.setFont(FONT, "bold")
  doc.setTextColor(...COLORS.black)
  doc.text(orgName, MARGIN, 14)

  doc.setFontSize(10)
  doc.setFont(FONT, "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(fmtWeekRange(data.weekStart, locale), MARGIN, 20)

  // Timestamp top-right
  doc.setFontSize(8)
  doc.setFont(FONT, "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(timestamp, pageWidth - MARGIN, 14, { align: "right" })

  if (data.rota?.status === "published") {
    doc.setTextColor(...COLORS.darkGray)
    doc.setFont(FONT, "bold")
    doc.setFontSize(8)
    doc.text(locale === "es" ? "Publicado" : "Published", pageWidth - MARGIN, 20, { align: "right" })
  }

  // ── Day headers ─────────────────────────────────────────────────────────
  const dayHeaders = data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(dt)
    const num = dt.getDate()
    return `${wday} ${num}`
  })

  // ── Build shift rows ────────────────────────────────────────────────────
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

  // ── Off/Libre row — all staff not assigned that day ─────────────────
  if (data.staffNames) {
    const allStaffIds = Object.keys(data.staffNames)
    const leaveByDate = data.onLeaveByDate ?? {}
    const offRow: string[] = [locale === "es" ? "Libre" : "Off"]
    for (const day of data.days) {
      const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
      const leaveIds = new Set(leaveByDate[day.date] ?? [])
      const offIds = allStaffIds.filter((id) => !assignedIds.has(id))
      // Show leave staff first, then others
      const onLeave = offIds.filter((id) => leaveIds.has(id))
      const notLeave = offIds.filter((id) => !leaveIds.has(id))
      const names = [...onLeave, ...notLeave].map((id) => data.staffNames[id]).filter(Boolean)
      offRow.push(names.join("\n") || "—")
    }
    body.push(offRow)
  }

  // ── Table ───────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: 26,
    head: [["", ...dayHeaders]],
    body,
    theme: "grid",
    styles: {
      fontSize: 7.5,
      font: FONT,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
      lineColor: COLORS.border,
      lineWidth: 0.2,
      textColor: COLORS.black,
      minCellHeight: 10,
      fillColor: COLORS.white,
    },
    headStyles: {
      fillColor: COLORS.white,
      textColor: COLORS.black,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
    },
    columnStyles: {
      0: { cellWidth: 22, fontStyle: "bold", halign: "center", fillColor: COLORS.white, textColor: COLORS.black },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: "auto",
  })

  // ── Notes section ───────────────────────────────────────────────────────
  if (notes && notes.length > 0) {
    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 140
    const notesY = finalY + 8

    doc.setFontSize(9)
    doc.setFont(FONT, "bold")
    doc.setTextColor(...COLORS.gray)
    doc.text(locale === "es" ? "Notas" : "Notes", MARGIN, notesY)

    // Divider line
    doc.setDrawColor(...COLORS.lightGray)
    doc.setLineWidth(0.15)
    doc.line(MARGIN, notesY + 1.5, pageWidth - MARGIN, notesY + 1.5)

    doc.setFont(FONT, "normal")
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.black)
    notes.forEach((n, i) => {
      doc.text(`•  ${n}`, MARGIN + 1, notesY + 6 + i * 5)
    })
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setTextColor(...COLORS.lightGray)
  doc.text(`LabRota · ${timestamp}`, pageWidth / 2, pageHeight - 6, { align: "center" })

  // ── Share / open ────────────────────────────────────────────────────────
  const filename = `${slugify(orgName)}-rota-${data.weekStart}.pdf`
  await sharePdf(doc, filename)
}

// ── By task export ───────────────────────────────────────────────────────────

export async function exportPdfByTask(data: RotaWeekData, tecnicas: Tecnica[], orgName: string, locale: string, notes?: string[]) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const timestamp = fmtTimestamp(locale)

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFontSize(16)
  doc.setFont(FONT, "bold")
  doc.setTextColor(...COLORS.black)
  doc.text(orgName, MARGIN, 14)

  doc.setFontSize(10)
  doc.setFont(FONT, "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(fmtWeekRange(data.weekStart, locale), MARGIN, 20)

  // Timestamp top-right
  doc.setFontSize(8)
  doc.setFont(FONT, "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(timestamp, pageWidth - MARGIN, 14, { align: "right" })

  if (data.rota?.status === "published") {
    doc.setTextColor(...COLORS.darkGray)
    doc.setFont(FONT, "bold")
    doc.setFontSize(8)
    doc.text(locale === "es" ? "Publicado" : "Published", pageWidth - MARGIN, 20, { align: "right" })
  }

  // ── Day headers ─────────────────────────────────────────────────────────
  const dayHeaders = data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(dt)
    return `${wday} ${dt.getDate()}`
  })

  // ── Build task rows ─────────────────────────────────────────────────────
  const activeTecnicas = tecnicas.filter((t) => t.activa).sort((a, b) => a.orden - b.orden)
  const body: string[][] = []

  for (const tc of activeTecnicas) {
    const row: string[] = [tc.nombre_es]
    for (const day of data.days) {
      const assignments = day.assignments.filter((a) => a.function_label === tc.codigo)
      const isWholeTeam = assignments.some((a) => (a as unknown as { whole_team?: boolean }).whole_team)
      if (isWholeTeam) {
        row.push(locale === "es" ? "Todo" : "All")
      } else {
        const names = assignments.map((a) => `${a.staff.first_name} ${a.staff.last_name[0]}.`)
        row.push(names.join(" / ") || "—")
      }
    }
    body.push(row)
  }

  // ── Table ───────────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: 26,
    head: [[locale === "es" ? "Técnica" : "Technique", ...dayHeaders]],
    body,
    theme: "grid",
    styles: {
      fontSize: 7.5,
      font: FONT,
      cellPadding: { top: 2.5, right: 2, bottom: 2.5, left: 2 },
      lineColor: COLORS.border,
      lineWidth: 0.2,
      textColor: COLORS.black,
      minCellHeight: 10,
      fillColor: COLORS.white,
    },
    headStyles: {
      fillColor: COLORS.white,
      textColor: COLORS.black,
      fontStyle: "bold",
      fontSize: 8,
      halign: "center",
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
    },
    columnStyles: {
      0: { cellWidth: 30, fontStyle: "bold", fillColor: COLORS.white, textColor: COLORS.black },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: "auto",
  })

  // ── Notes section ───────────────────────────────────────────────────────
  if (notes && notes.length > 0) {
    const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 140
    const notesY = finalY + 8

    doc.setFontSize(9)
    doc.setFont(FONT, "bold")
    doc.setTextColor(...COLORS.gray)
    doc.text(locale === "es" ? "Notas" : "Notes", MARGIN, notesY)

    doc.setDrawColor(...COLORS.lightGray)
    doc.setLineWidth(0.15)
    doc.line(MARGIN, notesY + 1.5, pageWidth - MARGIN, notesY + 1.5)

    doc.setFont(FONT, "normal")
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.black)
    notes.forEach((n, i) => {
      doc.text(`•  ${n}`, MARGIN + 1, notesY + 6 + i * 5)
    })
  }

  // ── Footer ──────────────────────────────────────────────────────────────
  doc.setFontSize(7)
  doc.setTextColor(...COLORS.lightGray)
  doc.text(`LabRota · ${timestamp}`, pageWidth / 2, pageHeight - 6, { align: "center" })

  const filename = `${slugify(orgName)}-rota-${data.weekStart}.pdf`
  await sharePdf(doc, filename)
}
