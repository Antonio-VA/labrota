"use client"

import React, { useRef } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight, AlertTriangle, Check, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format-date"
import { computeBiopsyForecast } from "@/lib/biopsy-forecast"
import { WeeklyStrip } from "@/components/weekly-strip"
import { MobileTaskDayView } from "@/components/mobile-task-day-view"
import { MobileAddStaffSheet } from "@/components/mobile-add-staff-sheet"
import { MobileOverflow } from "./mobile-overflow"
import { DayView } from "./day-view"
import { removeAssignment, regenerateDay } from "@/app/(clinic)/rota/actions"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { toast } from "sonner"
import { addDays } from "./utils"

export function MobileDaySection({
  weekData, staffList, currentDate, setCurrentDate, weekStart,
  currentDayData, loading, staffLoaded, locale, canEdit,
  mobileEditMode, setMobileEditMode, preEditSnapshot, setPreEditSnapshot,
  mobileCompact, toggleMobileCompact, mobileDeptColor, toggleMobileDeptColor,
  mobileViewMode, setMobileViewMode,
  mobileAddSheet, setMobileAddSheet,
  punctionsOverride, TODAY,
  setWeekData, fetchWeekSilent, setShowStrategyModal,
  isPending,
  mobileFavoriteView, setMobileFavoriteView,
  onSaveMobileFavorite, onGoToMobileFavorite,
  t, tc,
}: {
  weekData: RotaWeekData | null
  staffList: StaffWithSkills[]
  currentDate: string
  setCurrentDate: (v: string | ((prev: string) => string)) => void
  weekStart: string
  currentDayData: RotaDay | null
  loading: boolean
  staffLoaded: boolean
  locale: string
  canEdit: boolean
  mobileEditMode: boolean
  setMobileEditMode: (v: boolean) => void
  preEditSnapshot: RotaWeekData | null
  setPreEditSnapshot: (v: RotaWeekData | null) => void
  mobileCompact: boolean
  toggleMobileCompact: () => void
  mobileDeptColor: boolean
  toggleMobileDeptColor: () => void
  mobileViewMode: "shift" | "person"
  setMobileViewMode: (v: "shift" | "person") => void
  mobileAddSheet: { open: boolean; role: string }
  setMobileAddSheet: (v: { open: boolean; role: string } | ((prev: { open: boolean; role: string }) => { open: boolean; role: string })) => void
  punctionsOverride: Record<string, number>
  TODAY: string
  setWeekData: React.Dispatch<React.SetStateAction<RotaWeekData | null>>
  fetchWeekSilent: (ws: string) => Promise<RotaWeekData | null>
  setShowStrategyModal: (v: boolean) => void
  isPending: boolean
  mobileFavoriteView: { viewMode: string; compact: boolean; deptColor: boolean } | null
  setMobileFavoriteView: (v: any) => void
  onSaveMobileFavorite: () => void
  onGoToMobileFavorite: (() => void) | undefined
  t: any
  tc: any
}) {
  const mobileContentRef = useRef<HTMLDivElement>(null)
  const [dayWarningsOpen, setDayWarningsOpen] = React.useState(false)

  function goToToday() { setCurrentDate(TODAY) }

  return (
    <>
      <div className={cn("flex flex-col overflow-auto lg:hidden flex-1")}>
        {/* Date carousel */}
        {!mobileEditMode && weekData && (
          <WeeklyStrip
            days={weekData.days.map((d) => ({
              date: d.date,
              staffCount: d.assignments.length,
              hasSkillGaps: d.skillGaps.length > 0 || d.warnings.length > 0,
            }))}
            currentDate={currentDate}
            onSelectDay={(date) => { setCurrentDate(date); setMobileEditMode(false) }}
            locale={locale as "es" | "en"}
          />
        )}

        {/* Mobile toolbar */}
        {mobileEditMode ? (
          <div data-mobile-toolbar className="flex items-center justify-between h-[68px] px-4 bg-primary text-primary-foreground border-b border-primary lg:hidden sticky top-0 z-20">
            <span className="text-[16px] font-semibold">
              {currentDayData ? formatDate(currentDayData.date, locale as "es" | "en") : ""}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (preEditSnapshot) setWeekData(preEditSnapshot)
                  setMobileEditMode(false)
                  setPreEditSnapshot(null)
                  fetchWeekSilent(weekStart)
                }}
                className="h-10 px-4 text-[13px] font-medium text-primary-foreground/70 active:text-primary-foreground rounded-lg"
              >
                {tc("cancel")}
              </button>
              <Button size="sm" variant="secondary" onClick={() => { setMobileEditMode(false); setPreEditSnapshot(null) }} className="h-10 px-5 text-[14px]">
                {t("done")}
              </Button>
            </div>
          </div>
        ) : (
          <div data-mobile-toolbar className="flex items-center gap-1 h-14 px-2 border-b border-border bg-background lg:hidden sticky top-0 z-20">
            <button onClick={() => setCurrentDate((d) => addDays(d, -1))} className="size-9 flex items-center justify-center rounded-full active:bg-accent shrink-0">
              <ChevronLeft className="size-[18px] text-muted-foreground" />
            </button>
            <div className="relative shrink-0">
              <input
                type="date"
                value={currentDate}
                onChange={(e) => { if (e.target.value) setCurrentDate(e.target.value) }}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <span className="text-[14px] font-semibold capitalize pointer-events-none">
                {currentDayData ? formatDate(currentDayData.date, locale as "es" | "en") : formatDate(currentDate, locale as "es" | "en")}
              </span>
            </div>
            <button onClick={() => setCurrentDate((d) => addDays(d, 1))} className="size-9 flex items-center justify-center rounded-full active:bg-accent shrink-0">
              <ChevronRight className="size-[18px] text-muted-foreground" />
            </button>
            <button
              onClick={goToToday}
              disabled={currentDate === TODAY}
              className={cn("text-[12px] font-medium px-1.5 py-1 rounded-md transition-colors shrink-0", currentDate === TODAY ? "text-muted-foreground/30" : "text-primary active:bg-primary/10")}
            >
              {tc("today")}
            </button>
            <div className="flex-1" />
            {currentDayData && currentDayData.assignments.length > 0 && (
              <button onClick={() => setDayWarningsOpen(true)} className="size-10 flex items-center justify-center rounded-full active:bg-accent shrink-0">
                {currentDayData.skillGaps.length > 0 || currentDayData.warnings.length > 0
                  ? <AlertTriangle className="size-[18px] text-amber-500" />
                  : <Check className="size-[18px] text-emerald-500" />}
              </button>
            )}
            {canEdit && (
              <button onClick={() => { setPreEditSnapshot(weekData ? JSON.parse(JSON.stringify(weekData)) : null); setMobileEditMode(true) }} className="size-10 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent shrink-0">
                <Pencil className="size-[18px]" />
              </button>
            )}
            {canEdit && (
              <MobileOverflow
                onGenerateWeek={() => setShowStrategyModal(true)}
                onGenerateDay={currentDayData ? async () => {
                  const result = await regenerateDay(weekStart, currentDate)
                  if (result.error) toast.error(result.error)
                  else { toast.success(t("regenerateDay")); fetchWeekSilent(weekStart) }
                } : undefined}
                onShare={undefined}
                isPending={isPending}
                compact={mobileCompact}
                onToggleCompact={toggleMobileCompact}
                deptColor={mobileDeptColor}
                onToggleDeptColor={toggleMobileDeptColor}
                isFavorite={!!(mobileFavoriteView && mobileFavoriteView.viewMode === mobileViewMode && mobileFavoriteView.compact === mobileCompact && mobileFavoriteView.deptColor === mobileDeptColor)}
                hasFavorite={!!mobileFavoriteView}
                onSaveFavorite={onSaveMobileFavorite}
                onGoToFavorite={onGoToMobileFavorite}
              />
            )}
          </div>
        )}

        {/* Day content */}
        <div
          ref={mobileContentRef}
          className="flex flex-col gap-4 px-4 py-3 flex-1 pb-32"
          onTouchStart={(e) => { (e.currentTarget as HTMLElement).dataset.touchX = String(e.touches[0].clientX) }}
          onTouchEnd={(e) => {
            const startX = Number((e.currentTarget as HTMLElement).dataset.touchX ?? 0)
            const dx = e.changedTouches[0].clientX - startX
            if (Math.abs(dx) > 80) setCurrentDate((d) => addDays(d, dx < 0 ? 1 : -1))
          }}
        >
          {weekData?.rotaDisplayMode === "by_task" && weekData.tecnicas ? (
            <MobileTaskDayView
              day={currentDayData}
              tecnicas={weekData.tecnicas}
              departments={weekData.departments ?? []}
              data={weekData}
              staffList={staffList}
              isEditMode={mobileEditMode}
              onRemoveAssignment={async (id) => {
                setWeekData((prev) => {
                  if (!prev) return prev
                  return { ...prev, days: prev.days.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== id) })) }
                })
                const result = await removeAssignment(id)
                if (result.error) { toast.error(result.error); fetchWeekSilent(weekStart) }
              }}
              onAddToTask={() => setMobileAddSheet({ open: true, role: "lab" })}
              loading={loading || !staffLoaded || !currentDayData}
              locale={locale}
            />
          ) : (
            <DayView
              day={currentDayData}
              loading={loading || !staffLoaded || !currentDayData}
              locale={locale}
              departments={weekData?.departments ?? []}
              data={weekData}
              isEditMode={mobileEditMode}
              onRemoveAssignment={async (id) => {
                setWeekData((prev) => {
                  if (!prev) return prev
                  return { ...prev, days: prev.days.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== id) })) }
                })
                const result = await removeAssignment(id)
                if (result.error) { toast.error(result.error); fetchWeekSilent(weekStart) }
              }}
              onAddStaff={(role) => setMobileAddSheet({ open: true, role })}
              staffList={staffList}
              mobileCompact={mobileCompact}
              mobileDeptColor={mobileDeptColor}
              punctions={currentDayData ? (punctionsOverride[currentDayData.date] ?? weekData?.punctionsDefault?.[currentDayData.date] ?? 0) : 0}
              biopsyForecast={(() => {
                if (!currentDayData || !weekData) return 0
                const pd = weekData.punctionsDefault ?? {}
                const cr = weekData.biopsyConversionRate ?? 0.5
                function getPunc(dateStr: string): number {
                  if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
                  if (pd[dateStr] !== undefined) return pd[dateStr]
                  const dow = new Date(dateStr + "T12:00:00").getDay()
                  const sameDow = Object.entries(pd).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
                  return sameDow ? sameDow[1] : 0
                }
                return computeBiopsyForecast(currentDayData.date, getPunc, cr, weekData.biopsyDay5Pct ?? 0.5, weekData.biopsyDay6Pct ?? 0.5)
              })()}
              ratioOptimal={weekData?.ratioOptimal}
              ratioMinimum={weekData?.ratioMinimum}
            />
          )}
        </div>
      </div>

      {/* Mobile add staff sheet */}
      {(() => {
        const deptMap = Object.fromEntries((weekData?.departments ?? []).filter((d) => !d.parent_id).map((d) => [d.code, d.name]))
        const assignedIds = new Set(currentDayData?.assignments.map((a) => a.staff_id) ?? [])
        const leaveIds = new Set(currentDayData ? (weekData?.onLeaveByDate?.[currentDayData.date] ?? []) : [])
        const weeklyCounts: Record<string, number> = {}
        for (const d of weekData?.days ?? []) {
          for (const a of d.assignments) {
            weeklyCounts[a.staff_id] = (weeklyCounts[a.staff_id] ?? 0) + 1
          }
        }
        return (
          <MobileAddStaffSheet
            open={mobileAddSheet.open}
            onOpenChange={(open) => setMobileAddSheet((s) => ({ ...s, open }))}
            departmentCode={mobileAddSheet.role}
            departmentName={deptMap[mobileAddSheet.role] ?? mobileAddSheet.role}
            date={currentDate}
            weekStart={weekStart}
            staffList={staffList}
            assignedStaffIds={assignedIds}
            onLeaveStaffIds={leaveIds}
            shiftTypes={weekData?.shiftTypes ?? []}
            weeklyAssignmentCounts={weeklyCounts}
            onAdded={() => fetchWeekSilent(weekStart)}
          />
        )
      })()}

      {/* Day warnings bottom sheet */}
      {dayWarningsOpen && currentDayData && typeof document !== "undefined" && (
        <MobileDayWarnings
          day={currentDayData}
          locale={locale}
          onClose={() => setDayWarningsOpen(false)}
        />
      )}
    </>
  )
}

function MobileDayWarnings({ day, locale, onClose }: { day: RotaDay; locale: string; onClose: () => void }) {
  const t = useTranslations("schedule")
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-background rounded-t-2xl shadow-xl px-4 pt-4 pb-8 max-h-[60vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[16px] font-semibold capitalize">{formatDate(day.date, locale as "es" | "en")}</span>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
            <span className="size-4">✕</span>
          </button>
        </div>
        {day.skillGaps.length === 0 && day.warnings.length === 0 ? (
          <div className="flex items-center gap-2 py-3">
            <Check className="size-5 text-emerald-500 shrink-0" />
            <span className="text-[14px] text-emerald-600">{t("noIssuesThisWeek")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {day.skillGaps.map((gap, i) => (
              <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-medium text-red-700">{t("uncoveredSkill")}</p>
                  <p className="text-[13px] text-red-600">{gap}</p>
                </div>
              </div>
            ))}
            {day.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
                <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[12px] font-medium text-amber-700">{w.category === "coverage" ? t("warningCoverage") : w.category === "skill_gap" ? t("warningSkillGap") : t("warnings")}</p>
                  <p className="text-[13px] text-amber-600">{w.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
