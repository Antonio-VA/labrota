"use client"

import { AssignmentSheet } from "@/components/assignment-sheet"
import { computeBiopsyForecast } from "@/lib/biopsy-forecast"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"

export function AssignmentSheetHost({
  open, onOpenChange, sheetDate, sheetDay,
  weekStart, weekData, staffList,
  punctionsOverride, isPublished, canEdit,
  onSaved, onPunctionsChange,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  sheetDate: string | null
  sheetDay: RotaDay | null
  weekStart: string
  weekData: RotaWeekData | null
  staffList: StaffWithSkills[]
  punctionsOverride: Record<string, number>
  isPublished: boolean
  canEdit: boolean
  onSaved: () => void
  onPunctionsChange: (date: string, value: number | null) => void
}) {
  const biopsyForecast = (() => {
    if (!sheetDate || !weekData) return 0
    const pd = weekData.punctionsDefault
    const getPunc = (dateStr: string): number => {
      if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
      if (pd[dateStr] !== undefined) return pd[dateStr]
      const dow = new Date(dateStr + "T12:00:00").getDay()
      const sameDow = Object.entries(pd).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
      return sameDow ? sameDow[1] : 0
    }
    return computeBiopsyForecast(sheetDate, getPunc, weekData.biopsyConversionRate ?? 0.5, weekData.biopsyDay5Pct ?? 0.5, weekData.biopsyDay6Pct ?? 0.5)
  })()

  return (
    <AssignmentSheet
      open={open}
      onOpenChange={onOpenChange}
      date={sheetDate}
      weekStart={weekStart}
      day={sheetDay}
      staffList={staffList}
      onLeaveStaffIds={sheetDate ? (weekData?.onLeaveByDate[sheetDate] ?? []) : []}
      shiftTimes={weekData?.shiftTimes ?? null}
      shiftTypes={weekData?.shiftTypes ?? []}
      tecnicas={weekData?.tecnicas ?? []}
      departments={weekData?.departments ?? []}
      punctionsDefault={sheetDate ? (weekData?.punctionsDefault[sheetDate] ?? 0) : 0}
      punctionsOverride={punctionsOverride}
      rota={weekData?.rota ?? null}
      isPublished={isPublished || !canEdit}
      onSaved={onSaved}
      onPunctionsChange={onPunctionsChange}
      timeFormat={weekData?.timeFormat}
      biopsyForecast={biopsyForecast}
      rotaDisplayMode={weekData?.rotaDisplayMode}
      taskConflictThreshold={weekData?.taskConflictThreshold}
      enableTaskInShift={weekData?.enableTaskInShift ?? false}
    />
  )
}
