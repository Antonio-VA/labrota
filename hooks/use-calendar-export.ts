"use client"

import { useCallback } from "react"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { CalendarLayout } from "@/components/calendar-panel/types"

export function useCalendarExport({
  weekData, weekStart, locale, calendarLayout, daysAsRows, fetchWeekSilent,
}: {
  weekData: RotaWeekData | null
  weekStart: string
  locale: string
  calendarLayout: CalendarLayout
  daysAsRows: boolean
  fetchWeekSilent: (weekStart: string) => Promise<RotaWeekData | null>
}) {
  const exportPdf = useCallback(async () => {
    const fresh = await fetchWeekSilent(weekStart) ?? weekData
    if (!fresh) return
    const { exportPdfByShift, exportPdfByPerson, exportPdfByTask } = await import("@/lib/export-pdf")
    const on = document.querySelector("[data-org-name]")?.textContent ?? "LabRota"
    const notesEl = document.querySelector("[data-week-notes]")
    const noteTexts = notesEl ? Array.from(notesEl.querySelectorAll("[data-note-text]")).map((el) => el.textContent ?? "").filter(Boolean) : []
    const notes = noteTexts.length > 0 ? noteTexts : undefined
    if (fresh.rotaDisplayMode === "by_task") exportPdfByTask(fresh, fresh.tecnicas ?? [], on, locale, notes, daysAsRows)
    else if (calendarLayout === "person") exportPdfByPerson(fresh, on, locale, notes, daysAsRows)
    else exportPdfByShift(fresh, on, locale, notes, daysAsRows)
  }, [weekData, weekStart, locale, calendarLayout, daysAsRows, fetchWeekSilent])

  const exportExcel = useCallback(async () => {
    const fresh = await fetchWeekSilent(weekStart) ?? weekData
    if (!fresh) return
    const { exportWeekByShift, exportWeekByPerson, exportWeekByTask } = await import("@/lib/export-excel")
    if (fresh.rotaDisplayMode === "by_task") exportWeekByTask(fresh, fresh.tecnicas ?? [], locale, daysAsRows)
    else if (calendarLayout === "person") exportWeekByPerson(fresh, locale, daysAsRows)
    else exportWeekByShift(fresh, locale, daysAsRows)
  }, [weekData, weekStart, locale, calendarLayout, daysAsRows, fetchWeekSilent])

  return { exportPdf, exportExcel }
}
