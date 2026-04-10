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

const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
const ROLE_LABEL: Record<string, Record<string, string>> = {
  es: { lab: "Embriología", andrology: "Andrología", admin: "Admin" },
  en: { lab: "Embryology", andrology: "Andrology", admin: "Admin" },
}

/** Share or open PDF — uses Web Share API on mobile, opens in new tab on desktop */
async function sharePdf(doc: jsPDF, filename: string) {
  const blob = doc.output("blob")
  const file = new File([blob], filename, { type: "application/pdf" })

  if (typeof navigator !== "undefined" && navigator.share && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename })
      return
    } catch {
      // User cancelled or share failed — fall through to open
    }
  }

  const url = URL.createObjectURL(blob)
  window.open(url, "_blank")
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Render header + return startY for table */
function renderHeader(doc: jsPDF, orgName: string, data: RotaWeekData, locale: string): number {
  const pageWidth = doc.internal.pageSize.getWidth()

  doc.setFontSize(16)
  doc.setFont(FONT, "bold")
  doc.setTextColor(...COLORS.black)
  doc.text(orgName, MARGIN, 14)

  doc.setFontSize(10)
  doc.setFont(FONT, "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(fmtWeekRange(data.weekStart, locale), MARGIN, 20)

  if (data.rota?.status === "published") {
    doc.setTextColor(...COLORS.darkGray)
    doc.setFont(FONT, "bold")
    doc.setFontSize(8)
    doc.text(locale === "es" ? "Publicado" : "Published", pageWidth - MARGIN, 20, { align: "right" })
  }

  return 26
}

/** Render notes + footer */
function renderFooter(doc: jsPDF, locale: string, notes?: string[]) {
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

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

  doc.setFontSize(7)
  doc.setTextColor(...COLORS.lightGray)
  doc.text("LabRota", pageWidth / 2, pageHeight - 6, { align: "center" })
}

/** Day header labels */
function dayHeaders(data: RotaWeekData, locale: string): string[] {
  return data.days.map((d) => {
    const dt = new Date(d.date + "T12:00:00")
    const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(dt)
    return `${wday} ${dt.getDate()}`
  })
}

/** Table styling shared across all exports */
function tableStyles() {
  return {
    theme: "grid" as const,
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
      fontStyle: "bold" as const,
      fontSize: 8,
      halign: "center" as const,
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
    },
    margin: { left: MARGIN, right: MARGIN },
    tableWidth: "auto" as const,
  }
}

// ── By shift export ──────────────────────────────────────────────────────────

export async function exportPdfByShift(data: RotaWeekData, orgName: string, locale: string, notes?: string[], daysAsRows?: boolean) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const timeFormat = data.timeFormat ?? "24h"
  const startY = renderHeader(doc, orgName, data, locale)

  const headers = dayHeaders(data, locale)
  const shiftTypes = (data.shiftTypes ?? []).filter((s) => s.active !== false).sort((a, b) => a.sort_order - b.sort_order)

  if (daysAsRows) {
    // Transposed: days as rows, shifts as columns
    const shiftHeaders = shiftTypes.map((st) => `${st.code}\n${formatTime(st.start_time, timeFormat)}–${formatTime(st.end_time, timeFormat)}`)
    const offLabel = locale === "es" ? "Libre" : "Off"
    const body: string[][] = []

    for (let i = 0; i < data.days.length; i++) {
      const day = data.days[i]
      const row: string[] = [headers[i]]
      for (const st of shiftTypes) {
        const assignments = day.assignments
          .filter((a) => a.shift_type === st.code)
          .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
        const names = assignments.map((a) => {
          let name = `${a.staff.first_name} ${a.staff.last_name[0]}.`
          if (a.function_label) name += ` (${a.function_label})`
          return name
        })
        row.push(names.join("\n") || "—")
      }
      // OFF column
      if (data.staffNames) {
        const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
        const leaveIds = new Set(data.onLeaveByDate?.[day.date] ?? [])
        const offNames = Object.keys(data.staffNames)
          .filter((id) => !assignedIds.has(id))
          .map((id) => data.staffNames[id]).filter(Boolean)
        row.push(offNames.join("\n") || "—")
      }
      body.push(row)
    }

    autoTable(doc, {
      startY,
      head: [["", ...shiftHeaders, offLabel]],
      body,
      ...tableStyles(),
      columnStyles: { 0: { cellWidth: 22, fontStyle: "bold", halign: "center", fillColor: COLORS.white, textColor: COLORS.black } },
    })
  } else {
    // Standard: shifts as rows, days as columns
    const body: string[][] = []
    for (const st of shiftTypes) {
      const row: string[] = [
        `${st.code}\n${formatTime(st.start_time, timeFormat)}–${formatTime(st.end_time, timeFormat)}`
      ]
      for (const day of data.days) {
        const assignments = day.assignments
          .filter((a) => a.shift_type === st.code)
          .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
        const names = assignments.map((a) => {
          let name = `${a.staff.first_name} ${a.staff.last_name[0]}.`
          if (a.function_label) name += ` (${a.function_label})`
          return name
        })
        row.push(names.join("\n") || "—")
      }
      body.push(row)
    }

    // Off row
    if (data.staffNames) {
      const allStaffIds = Object.keys(data.staffNames)
      const offRow: string[] = [locale === "es" ? "Libre" : "Off"]
      for (const day of data.days) {
        const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
        const offNames = allStaffIds.filter((id) => !assignedIds.has(id)).map((id) => data.staffNames[id]).filter(Boolean)
        offRow.push(offNames.join("\n") || "—")
      }
      body.push(offRow)
    }

    autoTable(doc, {
      startY,
      head: [["", ...headers]],
      body,
      ...tableStyles(),
      columnStyles: { 0: { cellWidth: 22, fontStyle: "bold", halign: "center", fillColor: COLORS.white, textColor: COLORS.black } },
    })
  }

  renderFooter(doc, locale, notes)
  await sharePdf(doc, `${slugify(orgName)}-rota-${data.weekStart}.pdf`)
}

// ── By person export ─────────────────────────────────────────────────────────

export async function exportPdfByPerson(data: RotaWeekData, orgName: string, locale: string, notes?: string[], daysAsRows?: boolean) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const timeFormat = data.timeFormat ?? "24h"
  const startY = renderHeader(doc, orgName, data, locale)

  const headers = dayHeaders(data, locale)
  const labels = ROLE_LABEL[locale] ?? ROLE_LABEL.en

  // Build staff map: staff_id → { name, role, days: { date → shift label } }
  const staffMap: Record<string, { name: string; role: string; days: Record<string, string> }> = {}
  for (const day of data.days) {
    for (const a of day.assignments) {
      if (!staffMap[a.staff_id]) {
        staffMap[a.staff_id] = {
          name: `${a.staff.first_name} ${a.staff.last_name[0]}.`,
          role: a.staff.role,
          days: {},
        }
      }
      const tecLabel = a.function_label ? ` (${a.function_label})` : ""
      staffMap[a.staff_id].days[day.date] = `${a.shift_type}${tecLabel}`
    }
  }

  const sorted = Object.values(staffMap).sort((a, b) =>
    (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.name.localeCompare(b.name)
  )

  if (daysAsRows) {
    // Transposed: days as rows, staff as columns
    const staffHeaders = sorted.map((s) => s.name)
    const body: string[][] = []

    for (let i = 0; i < data.days.length; i++) {
      const day = data.days[i]
      const row = [headers[i]]
      for (const s of sorted) {
        row.push(s.days[day.date] ?? (locale === "es" ? "Lib" : "Off"))
      }
      body.push(row)
    }

    const base = tableStyles()
    autoTable(doc, {
      startY,
      head: [["", ...staffHeaders]],
      body,
      ...base,
      styles: { ...base.styles, fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 }, minCellHeight: 7, halign: "center" as const },
      headStyles: { ...base.headStyles, fontSize: 7, cellPadding: { top: 2, right: 2, bottom: 2, left: 2 } },
      columnStyles: { 0: { cellWidth: 20, fontStyle: "bold", halign: "center", fillColor: COLORS.white, textColor: COLORS.black } },
    })
  } else {
    // Standard: staff as rows, days as columns
    const body: string[][] = []
    for (const s of sorted) {
      const row = [s.name, labels[s.role] ?? s.role]
      for (const day of data.days) {
        row.push(s.days[day.date] ?? (locale === "es" ? "Lib" : "Off"))
      }
      body.push(row)
    }

    const base = tableStyles()
    autoTable(doc, {
      startY,
      head: [[locale === "es" ? "Personal" : "Staff", locale === "es" ? "Depto" : "Dept", ...headers]],
      body,
      ...base,
      styles: { ...base.styles, fontSize: 7, cellPadding: { top: 1.5, right: 2, bottom: 1.5, left: 2 }, minCellHeight: 7, halign: "center" as const },
      headStyles: { ...base.headStyles, fontSize: 7, cellPadding: { top: 2, right: 2, bottom: 2, left: 2 } },
      columnStyles: {
        0: { cellWidth: 26, fontStyle: "bold", halign: "left" as const, fillColor: COLORS.white, textColor: COLORS.black },
        1: { cellWidth: 15, halign: "left" as const, fillColor: COLORS.white, textColor: COLORS.gray, fontSize: 6.5 },
      },
    })
  }

  // Shift times legend below the table
  const shiftTypes = (data.shiftTypes ?? []).filter((s) => s.active !== false).sort((a, b) => a.sort_order - b.sort_order)
  if (shiftTypes.length > 0) {
    const legendY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 140) + 5
    doc.setFontSize(7.5)
    doc.setFont(FONT, "normal")
    doc.setTextColor(...COLORS.gray)
    const parts = shiftTypes.map((st) => `${st.code}  ${formatTime(st.start_time, timeFormat)}–${formatTime(st.end_time, timeFormat)}`)
    doc.text(parts.join("    "), MARGIN, legendY)
  }

  renderFooter(doc, locale, notes)
  await sharePdf(doc, `${slugify(orgName)}-rota-${data.weekStart}.pdf`)
}

// ── By task export ───────────────────────────────────────────────────────────

export async function exportPdfByTask(data: RotaWeekData, tecnicas: Tecnica[], orgName: string, locale: string, notes?: string[], daysAsRows?: boolean) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" })
  const startY = renderHeader(doc, orgName, data, locale)

  const headers = dayHeaders(data, locale)
  const activeTecnicas = tecnicas.filter((t) => t.activa).sort((a, b) => a.orden - b.orden)

  function staffForTechDay(tc: Tecnica, dayIdx: number): string {
    const day = data.days[dayIdx]
    const assignments = day.assignments.filter((a) => a.function_label === tc.codigo)
    const isWholeTeam = assignments.some((a) => (a as unknown as { whole_team?: boolean }).whole_team)
    const names = assignments
      .filter((a) => !(a as unknown as { whole_team?: boolean }).whole_team)
      .map((a) => `${a.staff.first_name} ${a.staff.last_name[0]}.`)
    if (isWholeTeam) {
      const allLabel = locale === "es" ? "Todo" : "All"
      return names.length > 0 ? `${allLabel} / ${names.join(" / ")}` : allLabel
    }
    return names.join(" / ") || "—"
  }

  if (daysAsRows) {
    // Transposed: days as rows, techniques as columns
    const techHeaders = activeTecnicas.map((t) => t.nombre_es)
    const body: string[][] = []

    for (let i = 0; i < data.days.length; i++) {
      const row = [headers[i]]
      for (const tc of activeTecnicas) {
        row.push(staffForTechDay(tc, i))
      }
      body.push(row)
    }

    autoTable(doc, {
      startY,
      head: [["", ...techHeaders]],
      body,
      ...tableStyles(),
      columnStyles: { 0: { cellWidth: 22, fontStyle: "bold", halign: "center", fillColor: COLORS.white, textColor: COLORS.black } },
    })
  } else {
    // Standard: techniques as rows, days as columns
    const body: string[][] = []
    for (const tc of activeTecnicas) {
      const row: string[] = [tc.nombre_es]
      for (let i = 0; i < data.days.length; i++) {
        row.push(staffForTechDay(tc, i))
      }
      body.push(row)
    }

    autoTable(doc, {
      startY,
      head: [[locale === "es" ? "Técnica" : "Technique", ...headers]],
      body,
      ...tableStyles(),
      columnStyles: { 0: { cellWidth: 30, fontStyle: "bold", fillColor: COLORS.white, textColor: COLORS.black } },
    })
  }

  renderFooter(doc, locale, notes)
  await sharePdf(doc, `${slugify(orgName)}-rota-${data.weekStart}.pdf`)
}

// ── My Rota export (single staff, compact portrait) ──────────────────────────

export async function exportPdfMySchedule(
  staffId: string,
  staffName: string,
  data: RotaWeekData,
  tecnicas: Tecnica[],
  orgName: string,
  locale: string,
) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
  const timeFormat = data.timeFormat ?? "24h"
  const pageWidth = doc.internal.pageSize.getWidth()

  // Header
  doc.setFontSize(14)
  doc.setFont(FONT, "bold")
  doc.setTextColor(...COLORS.black)
  doc.text(orgName, MARGIN, 14)

  doc.setFontSize(9)
  doc.setFont(FONT, "normal")
  doc.setTextColor(...COLORS.gray)
  doc.text(fmtWeekRange(data.weekStart, locale), MARGIN, 20)

  doc.setFontSize(11)
  doc.setFont(FONT, "bold")
  doc.setTextColor(...COLORS.darkGray)
  doc.text(staffName, MARGIN, 28)

  doc.setFontSize(8)
  doc.setFont(FONT, "normal")
  doc.setTextColor(...COLORS.lightGray)
  doc.text(locale === "es" ? "Mi rota" : "My rota", pageWidth - MARGIN, 14, { align: "right" })

  const tecnicaByCode = Object.fromEntries(tecnicas.map((t) => [t.codigo, t]))
  const onLeaveLabel = locale === "es" ? "Ausencia" : "On leave"
  const freeLabel = locale === "es" ? "Libre" : "Off"

  const body: (string | { content: string; styles: object })[][] = []
  for (const day of data.days) {
    const dateLabel = fmtDate(day.date, locale)
    const isOnLeave = (data.onLeaveByDate?.[day.date] ?? []).includes(staffId)
    const myAssignments = day.assignments.filter((a) => a.staff_id === staffId)

    if (isOnLeave) {
      body.push([dateLabel, { content: onLeaveLabel, styles: { textColor: [180, 100, 0], fontStyle: "italic" } }, "", ""])
    } else if (myAssignments.length === 0) {
      body.push([dateLabel, { content: freeLabel, styles: { textColor: COLORS.lightGray, fontStyle: "italic" } }, "", ""])
    } else {
      const shiftCodes = [...new Set(myAssignments.map((a) => a.shift_type))]
      const times = shiftCodes.map((code) => {
        const st = data.shiftTimes?.[code]
        return st ? `${formatTime(st.start, timeFormat)}–${formatTime(st.end, timeFormat)}` : ""
      }).filter(Boolean).join(", ")
      const tasks = myAssignments
        .filter((a) => a.function_label)
        .map((a) => tecnicaByCode[a.function_label!]?.nombre_es ?? a.function_label!)
      const uniqueTasks = [...new Set(tasks)]
      body.push([dateLabel, shiftCodes.join(", "), times, uniqueTasks.join(", ") || "—"])
    }
  }

  autoTable(doc, {
    startY: 33,
    head: [[
      locale === "es" ? "Día" : "Day",
      locale === "es" ? "Turno" : "Shift",
      locale === "es" ? "Horario" : "Hours",
      locale === "es" ? "Tareas" : "Tasks",
    ]],
    body,
    ...tableStyles(),
    tableWidth: pageWidth - MARGIN * 2,
    columnStyles: {
      0: { cellWidth: 36, fontStyle: "bold" },
      1: { cellWidth: 22, halign: "center" },
      2: { cellWidth: 34, halign: "center", textColor: COLORS.gray },
      3: { cellWidth: "auto" as unknown as number },
    },
    alternateRowStyles: { fillColor: [248, 250, 253] as [number, number, number] },
  })

  renderFooter(doc, locale)
  await sharePdf(doc, `${slugify(staffName)}-my-rota-${data.weekStart}.pdf`)
}
