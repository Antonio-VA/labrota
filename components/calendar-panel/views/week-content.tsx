"use client"

import React from "react"
import { CalendarDays, Sparkles, BrainCircuit, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TaskGrid } from "@/components/task-grid"
import { TransposedShiftGrid } from "@/components/transposed-shift-grid"
import { TransposedTaskGrid } from "@/components/transposed-task-grid"
import { TaskPersonGrid } from "@/components/task-person-grid"
import { ShiftGrid } from "../grids/shift-grid"
import { PersonGrid } from "../grids/person-grid"
import { TransposedPersonGrid } from "../grids/transposed-person-grid"
import { removeAssignment, upsertAssignment } from "@/app/(clinic)/rota/actions"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import type { CalendarLayout } from "../types"
import type { GenerationStrategy } from "../utils"
import { toast } from "sonner"

// Hoisted stable references — avoids new object/function on every render
const EMPTY_RECORD: Record<string, never> = {}
const EMPTY_STAFF: StaffWithSkills[] = []
const NOOP = () => {}

export function WeekContent({
  weekData, staffList, filteredStaffList,
  calendarLayout, daysAsRows, compact, colorChips, personSimplified,
  isPublished, canEdit, isPending, loading, staffLoaded,
  weekStart, locale, activeStrategy,
  punctionsOverride, onPunctionsChange, onBiopsyChange,
  openProfile, onDesktopChipClick, onOpenSheet, onMonthDayClick,
  pushUndo, cancelLastUndo, triggerSaved, fetchWeekSilent, setLiveDays,
  onGenerateClick, showCopyConfirm, setShowCopyConfirm, prevWeekHasRota,
  onCopyPreviousWeek,
  desktopSwapStaffId,
  gridSetDaysRef,
  t, tc,
}: {
  weekData: RotaWeekData | null
  staffList: StaffWithSkills[]
  filteredStaffList: StaffWithSkills[]
  calendarLayout: CalendarLayout
  daysAsRows: boolean
  compact: boolean
  colorChips: boolean
  personSimplified: boolean
  isPublished: boolean
  canEdit: boolean
  isPending: boolean
  loading: boolean
  staffLoaded: boolean
  weekStart: string
  locale: string
  activeStrategy: GenerationStrategy | null
  punctionsOverride: Record<string, number>
  onPunctionsChange: (date: string, value: number | null) => void
  onBiopsyChange: (date: string, value: number) => void
  openProfile: (staffId: string) => void
  onDesktopChipClick: (assignment: { id?: string; staff_id: string; shift_type?: string }, date: string) => void
  onOpenSheet: (date: string) => void
  onMonthDayClick: (date: string) => void
  pushUndo?: (snapshot: RotaWeekData, redo: () => Promise<any>, undo: () => Promise<any>) => void
  cancelLastUndo?: () => void
  triggerSaved?: () => void
  fetchWeekSilent: (ws: string) => Promise<RotaWeekData | null>
  setLiveDays: (days: RotaDay[] | null) => void
  onGenerateClick: () => void
  showCopyConfirm: boolean
  setShowCopyConfirm: (v: boolean) => void
  prevWeekHasRota: boolean
  onCopyPreviousWeek: () => void
  desktopSwapStaffId: string | null
  gridSetDaysRef: React.MutableRefObject<((days: RotaDay[]) => void) | null>
  t: any
  tc: any
}) {
  const handleRefresh = () => fetchWeekSilent(weekStart)

  return (
    <div className="hidden lg:flex flex-col flex-1 min-h-0 px-4 py-2 gap-0 overflow-hidden">
      <div data-calendar-content className="flex-1 min-h-0 overflow-y-auto overflow-x-auto relative" style={{ minHeight: 400 }}>
        {/* Loading shimmer with strategy overlays */}
        {(loading || !staffLoaded) && (
          <div className="absolute inset-0 z-10 bg-background flex flex-col">
            {weekData?.rotaDisplayMode === "by_task" && daysAsRows ? (
              <TransposedTaskGrid data={null} staffList={EMPTY_STAFF} loading locale={locale} isPublished={false} publicHolidays={EMPTY_RECORD} onLeaveByDate={EMPTY_RECORD} compact={compact} colorChips={colorChips} />
            ) : weekData?.rotaDisplayMode === "by_task" ? (
              <TaskGrid data={null} staffList={EMPTY_STAFF} loading locale={locale} isPublished={false} onRefresh={NOOP} taskConflictThreshold={3} punctionsDefault={EMPTY_RECORD} punctionsOverride={EMPTY_RECORD} onPunctionsChange={NOOP} compact={compact} colorBorders={colorChips} showPuncBiopsy={false} />
            ) : calendarLayout === "person" ? (
              <PersonGrid data={null} staffList={EMPTY_STAFF} loading locale={locale} isPublished={false} shiftTimes={null} onLeaveByDate={EMPTY_RECORD} publicHolidays={EMPTY_RECORD} onChipClick={NOOP} simplified={personSimplified} />
            ) : (
              <ShiftGrid data={null} staffList={EMPTY_STAFF} loading locale={locale} onCellClick={NOOP} onChipClick={NOOP} isPublished={false} shiftTimes={null} onLeaveByDate={EMPTY_RECORD} publicHolidays={EMPTY_RECORD} punctionsDefault={EMPTY_RECORD} punctionsOverride={EMPTY_RECORD} onPunctionsChange={NOOP} onRefresh={NOOP} weekStart={weekStart} compact={compact} colorChips={colorChips} />
            )}
            {activeStrategy === "ai_hybrid" && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-6 text-primary animate-pulse" />
                  <span className="text-muted-foreground">+</span>
                  <BrainCircuit className="size-6 text-purple-500 animate-pulse" />
                </div>
                <p className="text-[14px] font-medium text-foreground">{t("hybridGenerating")}</p>
                <p className="text-[12px] text-muted-foreground max-w-xs text-center">{t("hybridGeneratingDesc")}</p>
              </div>
            )}
            {activeStrategy === "ai_reasoning" && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
                <BrainCircuit className="size-8 text-amber-500 animate-pulse" />
                <p className="text-[14px] font-medium text-foreground">{t("claudeThinking")}</p>
                <p className="text-[12px] text-muted-foreground max-w-xs text-center">{t("claudeThinkingDesc")}</p>
              </div>
            )}
            {(activeStrategy === "ai_optimal" || activeStrategy === "ai_optimal_v2") && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/60 backdrop-blur-[2px]">
                <Sparkles className="size-8 text-primary animate-pulse" />
                <p className="text-[14px] font-medium text-foreground">{t("engineGenerating")}</p>
                <p className="text-[12px] text-muted-foreground">{t("engineGeneratingDesc")}</p>
              </div>
            )}
          </div>
        )}

        {/* Grid routing */}
        {weekData && (weekData.rotaDisplayMode === "by_task" && calendarLayout === "person" && daysAsRows ? (
          <TransposedPersonGrid
            data={weekData} staffList={filteredStaffList} locale={locale}
            isPublished={isPublished || !canEdit}
            shiftTimes={weekData?.shiftTimes ?? null}
            onLeaveByDate={weekData?.onLeaveByDate ?? {}}
            publicHolidays={weekData?.publicHolidays ?? {}}
            onChipClick={onDesktopChipClick} onDateClick={onMonthDayClick}
            colorChips={colorChips} compact={compact} simplified={personSimplified}
            punctionsDefault={weekData?.punctionsDefault ?? {}}
            punctionsOverride={punctionsOverride}
            onPunctionsChange={canEdit ? onPunctionsChange : undefined}
            swapStaffId={desktopSwapStaffId} gridSetDaysRef={gridSetDaysRef}
          />
        ) : weekData.rotaDisplayMode === "by_task" && calendarLayout === "person" ? (
          <TaskPersonGrid
            data={weekData} staffList={filteredStaffList} locale={locale}
            isPublished={isPublished || !canEdit}
            publicHolidays={weekData?.publicHolidays ?? {}}
            onLeaveByDate={weekData?.onLeaveByDate ?? {}}
            onLeaveTypeByDate={weekData?.onLeaveTypeByDate}
            compact={compact} colorChips={colorChips} simplified={personSimplified}
            punctionsDefault={weekData?.punctionsDefault ?? {}}
            punctionsOverride={punctionsOverride}
            onPunctionsChange={canEdit ? onPunctionsChange : undefined}
            biopsyConversionRate={weekData?.biopsyConversionRate}
            biopsyDay5Pct={weekData?.biopsyDay5Pct}
            biopsyDay6Pct={weekData?.biopsyDay6Pct}
            onChipClick={openProfile} onDateClick={onMonthDayClick}
          />
        ) : weekData.rotaDisplayMode === "by_task" && daysAsRows ? (
          <TransposedTaskGrid
            data={weekData} staffList={filteredStaffList} locale={locale}
            isPublished={isPublished || !canEdit}
            publicHolidays={weekData?.publicHolidays ?? {}} onLeaveByDate={weekData?.onLeaveByDate ?? {}}
            compact={compact} colorChips={colorChips} simplified={personSimplified}
            punctionsDefault={weekData?.punctionsDefault ?? {}} punctionsOverride={punctionsOverride}
            onPunctionsChange={canEdit ? onPunctionsChange : undefined}
            biopsyConversionRate={weekData?.biopsyConversionRate}
            biopsyDay5Pct={weekData?.biopsyDay5Pct} biopsyDay6Pct={weekData?.biopsyDay6Pct}
            onRemoveAssignment={async (id) => {
              const snapshot = weekData
              const assignment = weekData?.days.flatMap((d) => d.assignments.map((a) => ({ ...a, date: d.date }))).find((a) => a.id === id)
              const result = await removeAssignment(id)
              if (result.error) { toast.error(result.error); return }
              fetchWeekSilent(weekStart)
              if (snapshot && assignment && canEdit && pushUndo) {
                pushUndo(
                  snapshot,
                  () => upsertAssignment({ weekStart, staffId: assignment.staff_id, date: assignment.date, shiftType: assignment.shift_type, functionLabel: assignment.function_label ?? undefined }),
                  () => removeAssignment(id),
                )
              }
            }}
            onCellClick={onOpenSheet} onChipClick={openProfile} onDateClick={onMonthDayClick}
          />
        ) : (!weekData.rota || !weekData.days.some((d) => d.assignments.length > 0)) ? (
          <div className="flex-1 flex items-start justify-center pt-[18vh]">
            {!canEdit ? (
              <div className="flex flex-col items-center gap-3 w-full max-w-[380px] text-center">
                <CalendarDays className="size-10 text-muted-foreground/40" />
                <p className="text-[16px] font-medium text-muted-foreground">{t("noRotaYet")}</p>
                <p className="text-[14px] text-muted-foreground/70">{t("noRotaYetDescription")}</p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 w-full max-w-[420px]">
                <Sparkles className="size-12" style={{ color: "var(--pref-bg)" }} />
                <div className="text-center">
                  <p className="text-[18px] font-semibold" style={{ color: "var(--pref-bg)" }}>{t("emptyWeekTitle")}</p>
                  <p className="text-[14px] text-muted-foreground mt-2 max-w-[380px] mx-auto leading-relaxed">{t("emptyWeekDesc")}</p>
                </div>
                {!showCopyConfirm ? (
                  <div className="flex items-center gap-3">
                    <Button variant="outline" onClick={onGenerateClick} className="gap-1.5">
                      <Sparkles className="size-3.5" />
                      {t("generateRota")}
                    </Button>
                    {prevWeekHasRota && (
                      <Button variant="outline" onClick={() => setShowCopyConfirm(true)} className="gap-1.5">
                        <Copy className="size-3.5" />
                        {t("copyPrevWeek")}
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 w-full">
                    <p className="text-[13px] text-amber-600 dark:text-amber-400 font-medium mb-1">{t("copyPrevWeekConfirmTitle")}</p>
                    <p className="text-[12px] text-amber-600 dark:text-amber-400 mb-3">{t("copyPrevWeekConfirmBody")}</p>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={onCopyPreviousWeek}>{t("copy")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowCopyConfirm(false)}>{tc("cancel")}</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : weekData.rotaDisplayMode === "by_task" ? (
          <TaskGrid
            data={weekData} staffList={staffList} loading={false} locale={locale}
            isPublished={isPublished || !canEdit}
            onRefresh={handleRefresh}
            onAfterMutation={canEdit ? pushUndo : undefined}
            onCancelUndo={canEdit ? cancelLastUndo : undefined}
            onSaved={canEdit ? triggerSaved : undefined}
            gridSetDaysRef={gridSetDaysRef}
            taskConflictThreshold={weekData?.taskConflictThreshold ?? 3}
            punctionsDefault={weekData?.punctionsDefault ?? {}} punctionsOverride={punctionsOverride}
            onPunctionsChange={onPunctionsChange} onBiopsyChange={onBiopsyChange}
            biopsyConversionRate={weekData?.biopsyConversionRate}
            biopsyDay5Pct={weekData?.biopsyDay5Pct} biopsyDay6Pct={weekData?.biopsyDay6Pct}
            compact={compact} colorBorders={colorChips} showPuncBiopsy={!compact && !personSimplified}
            onDateClick={onMonthDayClick} onChipClick={openProfile}
          />
        ) : calendarLayout === "shift" && daysAsRows ? (
          <TransposedShiftGrid
            data={weekData} staffList={filteredStaffList} locale={locale}
            isPublished={isPublished || !canEdit}
            shiftTimes={weekData?.shiftTimes ?? null}
            publicHolidays={weekData?.publicHolidays ?? {}} onLeaveByDate={weekData?.onLeaveByDate ?? {}}
            compact={compact} colorChips={colorChips} timeFormat={weekData?.timeFormat}
            onCellClick={onOpenSheet} onChipClick={onDesktopChipClick}
            onRefresh={handleRefresh}
            swapStaffId={desktopSwapStaffId} gridSetDaysRef={gridSetDaysRef}
          />
        ) : calendarLayout === "shift" ? (
          <ShiftGrid
            data={weekData} staffList={filteredStaffList} loading={false} isGenerating={isPending}
            locale={locale} onCellClick={() => {}} onChipClick={onDesktopChipClick}
            isPublished={isPublished || !canEdit}
            shiftTimes={weekData?.shiftTimes ?? null}
            onLeaveByDate={weekData?.onLeaveByDate ?? {}} publicHolidays={weekData?.publicHolidays ?? {}}
            punctionsDefault={weekData?.punctionsDefault ?? {}} punctionsOverride={punctionsOverride}
            onPunctionsChange={onPunctionsChange} onBiopsyChange={onBiopsyChange}
            onRefresh={handleRefresh}
            onAfterMutation={canEdit ? pushUndo : undefined}
            onCancelUndo={canEdit ? cancelLastUndo : undefined}
            onSaved={canEdit ? triggerSaved : undefined}
            weekStart={weekStart} compact={compact} colorChips={colorChips} simplified={personSimplified}
            onDateClick={onMonthDayClick} onLocalDaysChange={setLiveDays}
            ratioOptimal={weekData?.ratioOptimal} ratioMinimum={weekData?.ratioMinimum}
            timeFormat={weekData?.timeFormat}
            biopsyConversionRate={weekData?.biopsyConversionRate}
            biopsyDay5Pct={weekData?.biopsyDay5Pct} biopsyDay6Pct={weekData?.biopsyDay6Pct}
            swapStaffId={desktopSwapStaffId} gridSetDaysRef={gridSetDaysRef}
          />
        ) : calendarLayout === "person" && daysAsRows ? (
          <TransposedPersonGrid
            data={weekData} staffList={filteredStaffList} locale={locale}
            isPublished={isPublished || !canEdit}
            shiftTimes={weekData?.shiftTimes ?? null}
            onLeaveByDate={weekData?.onLeaveByDate ?? {}} publicHolidays={weekData?.publicHolidays ?? {}}
            onChipClick={onDesktopChipClick} onDateClick={onMonthDayClick}
            colorChips={colorChips} compact={compact} simplified={personSimplified}
            punctionsDefault={weekData?.punctionsDefault ?? {}} punctionsOverride={punctionsOverride}
            onPunctionsChange={canEdit ? onPunctionsChange : undefined}
            swapStaffId={desktopSwapStaffId} gridSetDaysRef={gridSetDaysRef}
          />
        ) : (
          <PersonGrid
            data={weekData} staffList={filteredStaffList} loading={false} isGenerating={isPending}
            locale={locale} isPublished={isPublished || !canEdit}
            shiftTimes={weekData?.shiftTimes ?? null}
            onLeaveByDate={weekData?.onLeaveByDate ?? {}} publicHolidays={weekData?.publicHolidays ?? {}}
            onChipClick={onDesktopChipClick} onDateClick={onMonthDayClick}
            colorChips={colorChips} compact={compact}
            punctionsDefault={weekData?.punctionsDefault ?? {}} punctionsOverride={punctionsOverride}
            onPunctionsChange={canEdit ? onPunctionsChange : undefined}
            simplified={personSimplified}
            swapStaffId={desktopSwapStaffId} gridSetDaysRef={gridSetDaysRef}
          />
        ))}
      </div>
    </div>
  )
}
