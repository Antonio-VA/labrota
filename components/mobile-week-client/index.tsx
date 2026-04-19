"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { ChevronLeft, ChevronRight, Sparkles, AlertTriangle, CalendarX, Check, BrainCircuit } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { useCanEdit } from "@/lib/role-context"
import { usePersistedState } from "@/hooks/use-persisted-state"
import { useMobileWeekData } from "@/hooks/use-mobile-week-data"
import { TapPopover } from "@/components/tap-popover"
import { WeekNotes } from "@/components/week-notes"
import { toast } from "sonner"
import { getMondayOf } from "@/lib/format-date"
import { ROLE_COLOR, contrastColor, ROLE_LABEL, LEAVE_ICONS, LEAVE_COLORS, dayAbbrFor } from "./constants"
import { WeekPicker } from "./week-picker"
import { WeekInsightsSheet, WeekWarningsSheet } from "./bottom-sheets"
import { WeekOverflow } from "./week-overflow"
import { WeekGenerateSheet } from "./generate-sheet"
import { PersonView } from "./person-view"
import { TaskView } from "./task-view"

export function MobileWeekClient() {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale() as "es" | "en"
  const canEdit = useCanEdit()
  const { weekStart, setWeekStart, data, staffList, loading, refresh } = useMobileWeekData()
  const weekGridRef = useRef<HTMLDivElement>(null)
  const [highlightEnabled, setHighlightEnabled] = usePersistedState<boolean>("labrota_week_highlight", false)
  const [highlightedStaff, setHighlightedStaff] = useState<string | null>(null)
  const [warningsOpen, setWarningsOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [weekFavourite, setWeekFavourite] = usePersistedState<{ weekViewMode: string; mobileDeptColor: boolean; taskDaysAsRows?: boolean } | null>("labrota_week_favourite", null)
  const [weekViewMode, setWeekViewMode] = useState<"task" | "person">(
    weekFavourite?.weekViewMode === "person" ? "person" : "task"
  )
  const [mobileDeptColor, setMobileDeptColor] = useState<boolean>(() => {
    if (weekFavourite?.mobileDeptColor !== undefined) return weekFavourite.mobileDeptColor
    if (typeof window === "undefined") return true
    return localStorage.getItem("labrota_mobile_dept_color") !== "false"
  })
  const [taskDaysAsRows, setTaskDaysAsRows] = useState<boolean>(weekFavourite?.taskDaysAsRows === true)

  /* eslint-disable react-hooks/set-state-in-effect -- derived from fetched data */
  useEffect(() => {
    if (data?.rotaDisplayMode === "by_task" && weekViewMode === "person") {
      setWeekViewMode("task")
    }
  }, [data?.rotaDisplayMode, weekViewMode])
  /* eslint-enable react-hooks/set-state-in-effect */

  function toggleHighlight() {
    setHighlightEnabled((v) => {
      if (v) setHighlightedStaff(null)
      return !v
    })
  }

  function toggleMobileDeptColor() {
    const next = !mobileDeptColor
    setMobileDeptColor(next)
    localStorage.setItem("labrota_mobile_dept_color", String(next))
  }

  function toggleTaskDaysAsRows() {
    setTaskDaysAsRows((v) => !v)
  }

  function toggleHighlightedStaff(id: string) {
    setHighlightedStaff((p) => p === id ? null : id)
  }

  const isFavourite = weekFavourite !== null &&
    weekFavourite.weekViewMode === weekViewMode &&
    weekFavourite.mobileDeptColor === mobileDeptColor &&
    (weekFavourite.taskDaysAsRows ?? false) === taskDaysAsRows

  function saveFavourite() {
    setWeekFavourite({ weekViewMode, mobileDeptColor, taskDaysAsRows })
    toast.success(t("viewSavedFavorite"))
  }

  function goToFavourite() {
    if (!weekFavourite) return
    setWeekViewMode(weekFavourite.weekViewMode as "task" | "person")
    setMobileDeptColor(weekFavourite.mobileDeptColor)
    setTaskDaysAsRows(weekFavourite.taskDaysAsRows ?? false)
  }

  const hasFavourite = weekFavourite !== null

  function navigate(dir: number) {
    const d = new Date(weekStart + "T12:00:00")
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(getMondayOf(d))
  }

  const today = new Date().toISOString().split("T")[0]
  const currentWeek = getMondayOf()
  const isCurrentWeek = weekStart === currentWeek

  const days = data?.days ?? []
  const shiftTypes = data?.shiftTypes?.filter((s) => s.active !== false) ?? []
  const shiftTypeMap = Object.fromEntries(shiftTypes.map((s) => [s.code, s]))
  const timeFormat = data?.timeFormat ?? "24h"

  const isTaskMode = weekViewMode !== "person" && data?.rotaDisplayMode === "by_task" && !!data?.tecnicas?.length
  const gridHdrW = isTaskMode ? "80px" : "52px"

  const fullStaffMap = useMemo(() => {
    const m: Record<string, { fn: string; ln: string; role: string; dpw: number }> = {}
    for (const s of staffList) m[s.id] = { fn: s.first_name, ln: s.last_name, role: s.role, dpw: s.days_per_week }
    return m
  }, [staffList])

  const deptColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const dept of data?.departments ?? []) if (dept.colour) m[dept.code] = dept.colour
    return m
  }, [data?.departments])

  const staffColorLookup = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of staffList) if (s.color) m[s.id] = s.color
    return m
  }, [staffList])

  const workingDaysByStaff = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const d of days) for (const a of d.assignments) (m[a.staff_id] ??= new Set()).add(d.date)
    return m
  }, [days])

  const hasWarnings = days.some((d) => d.warnings.length > 0 || d.skillGaps.length > 0)
  const warningCount = days.reduce((acc, d) => acc + d.warnings.length + d.skillGaps.length, 0)

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Sticky week toolbar */}
      <div className="flex items-center gap-1 h-14 px-3 border-b border-border bg-background sticky top-0 z-10">
        <button
          onClick={() => setWeekStart(currentWeek)}
          disabled={isCurrentWeek}
          className={cn("text-[12px] font-medium px-2 py-1 rounded-md transition-colors shrink-0", isCurrentWeek ? "text-muted-foreground/30" : "text-primary active:bg-primary/10")}
        >
          {tc("today")}
        </button>

        <button onClick={() => navigate(-1)} className="size-8 flex items-center justify-center rounded-full active:bg-accent shrink-0">
          <ChevronLeft className="size-4 text-muted-foreground" />
        </button>

        <WeekPicker weekStart={weekStart} locale={locale} onSelect={setWeekStart} />

        <button onClick={() => navigate(1)} className="size-8 flex items-center justify-center rounded-full active:bg-accent shrink-0">
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>

        <div className="flex-1" />

        <button onClick={() => setWarningsOpen(true)} className={cn(
          "flex items-center justify-center gap-1 rounded-full active:bg-accent shrink-0",
          hasWarnings ? "h-9 px-2" : "size-9"
        )}>
          {hasWarnings
            ? <>
                <AlertTriangle className="size-5 text-amber-500 shrink-0" />
                {warningCount > 0 && <span className="text-[13px] font-semibold text-amber-500 leading-none">{warningCount}</span>}
              </>
            : <Check className="size-5 text-emerald-500" />}
        </button>

        {data?.aiReasoning && (
          <button onClick={() => setInsightsOpen(true)} className="size-9 flex items-center justify-center rounded-full active:bg-accent shrink-0">
            <BrainCircuit className="size-5 text-indigo-500" />
          </button>
        )}

        <WeekOverflow
          weekStart={weekStart}
          data={data}
          highlightEnabled={highlightEnabled}
          onToggleHighlight={toggleHighlight}
          weekViewMode={weekViewMode}
          onToggleViewMode={() => setWeekViewMode((m) => m === "task" ? "person" : "task")}
          onGenerateWeek={canEdit ? () => setGenerateModalOpen(true) : undefined}
          deptColor={mobileDeptColor}
          onToggleDeptColor={toggleMobileDeptColor}
          isFavourite={isFavourite}
          hasFavourite={hasFavourite}
          onSaveFavourite={saveFavourite}
          onGoToFavourite={goToFavourite}
          taskDaysAsRows={taskDaysAsRows}
          onToggleTaskDaysAsRows={toggleTaskDaysAsRows}
          onRefresh={refresh}
        />
      </div>

      {/* Scrollable grid */}
      <div ref={weekGridRef} className="flex-1 overflow-auto" onClick={() => highlightedStaff && setHighlightedStaff(null)}>
        {loading ? (
          <div className="p-3 flex flex-col gap-1.5 animate-pulse">
            <div className="grid grid-cols-8 gap-1">
              <div className="h-10 rounded-md bg-muted-foreground/15" />
              {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-10 rounded-md bg-muted-foreground/15" />)}
            </div>
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="grid grid-cols-8 gap-1">
                <div className="h-14 rounded-md bg-muted-foreground/12" />
                {Array.from({ length: 7 }).map((_, c) => <div key={c} className="h-14 rounded-md bg-muted-foreground/10" />)}
              </div>
            ))}
            <div className="grid grid-cols-8 gap-1">
              <div className="h-8 rounded-md bg-muted-foreground/8" />
              {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-8 rounded-md bg-muted-foreground/6" />)}
            </div>
          </div>
        ) : !data || days.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 px-6 pt-[15vh] text-center">
            <Sparkles className="size-10 text-primary/40" />
            <div>
              <p className="text-[16px] font-semibold text-foreground">{t("noRota")}</p>
              <p className="text-[13px] text-muted-foreground mt-1 max-w-[280px] leading-relaxed">{t("noRotaDescription")}</p>
            </div>
            <button
              onClick={() => setGenerateModalOpen(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white text-[14px] font-semibold active:bg-primary/90 transition-colors"
            >
              <Sparkles className="size-4" />
              {t("generateWeek")}
            </button>
          </div>
        ) : (
          <div className="min-w-[600px] pb-[100px]">
            {/* Header: days — hidden in transposed by-task mode (it renders its own header) */}
            {!(isTaskMode && taskDaysAsRows) && <div className="sticky top-0 z-10 grid border-b border-border bg-muted" style={{ gridTemplateColumns: `${gridHdrW} repeat(${days.length}, 1fr)` }}>
              <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[6]" />
              {days.map((day) => {
                const date = new Date(day.date + "T12:00:00")
                const dow = date.getDay()
                const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date)
                const num = date.getDate()
                const isToday = day.date === today
                const isWknd = dow === 0 || dow === 6
                const isHoliday = !!data?.publicHolidays?.[day.date]
                return (
                  <div
                    key={day.date}
                    className="px-1 py-2 text-center border-r border-border last:border-r-0"
                    style={isHoliday ? { backgroundColor: "rgb(254 243 199 / 0.8)" } : undefined}
                  >
                    <p className={cn("text-[10px] uppercase", isToday ? "text-primary font-semibold" : isWknd && !isHoliday ? "text-muted-foreground/50" : "text-muted-foreground")}>{wday}</p>
                    {isToday ? (
                      <span className="inline-flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-[14px] font-bold">{num}</span>
                    ) : (
                      <p className={cn("text-[14px] font-semibold", isWknd && !isHoliday ? "text-muted-foreground" : "text-primary")}>{num}</p>
                    )}
                  </div>
                )
              })}
            </div>}

            {/* Rows */}
            {weekViewMode === "person" ? (
              <PersonView
                staffList={staffList}
                days={days}
                shiftTypeMap={shiftTypeMap}
                shiftTypes={shiftTypes}
                gridHdrW={gridHdrW}
                highlightEnabled={highlightEnabled}
                highlightedStaff={highlightedStaff}
                onToggleHighlight={toggleHighlightedStaff}
                mobileDeptColor={mobileDeptColor}
                deptColorMap={deptColorMap}
                staffColorLookup={staffColorLookup}
                locale={locale}
                timeFormat={timeFormat}
              />
            ) : data.rotaDisplayMode === "by_task" && data.tecnicas ? (
              <TaskView
                data={data}
                days={days}
                today={today}
                locale={locale}
                taskDaysAsRows={taskDaysAsRows}
                gridHdrW={gridHdrW}
                highlightEnabled={highlightEnabled}
                highlightedStaff={highlightedStaff}
                onToggleHighlight={toggleHighlightedStaff}
                mobileDeptColor={mobileDeptColor}
                deptColorMap={deptColorMap}
                staffColorLookup={staffColorLookup}
              />
            ) : (
              shiftTypes.map((st) => (
                <div key={st.code} className="grid border-b border-border" style={{ gridTemplateColumns: `${gridHdrW} repeat(${days.length}, 1fr)` }}>
                  <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[5] flex flex-col items-end justify-center">
                    <span className="text-[13px] font-bold text-foreground">{st.code}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{formatTime(st.start_time, timeFormat)}</span>
                    <span className="text-[9px] text-muted-foreground/60 tabular-nums">{formatTime(st.end_time, timeFormat)}</span>
                  </div>
                  {days.map((day) => {
                    const assignments = day.assignments.filter((a) => a.shift_type === st.code)
                    const dow = new Date(day.date + "T12:00:00").getDay()
                    const isSat = dow === 6; const isSun = dow === 0
                    const activeDays = (shiftTypeMap[st.code] as { active_days?: string[] })?.active_days
                    const dowKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dow]
                    const isActive = !activeDays || activeDays.includes(dowKey)
                    return (
                      <div key={day.date} className={cn(
                        "px-1 py-2 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-col gap-1",
                        !isActive && "bg-muted/40"
                      )}>
                        {!isActive ? (
                          <span className="text-[8px] text-muted-foreground/30 italic self-center mt-auto mb-auto">—</span>
                        ) : assignments.map((a) => {
                          const isHL = highlightEnabled && highlightedStaff === a.staff_id
                          const roleColor = deptColorMap[a.staff.role] ?? ROLE_COLOR[a.staff.role] ?? "#94A3B8"
                          const hlColor = staffColorLookup[a.staff_id] ?? roleColor
                          const working = workingDaysByStaff[a.staff_id]
                          const DAY_ABBR = dayAbbrFor(locale)
                          const offAbbrs = days.filter((d) => !working?.has(d.date)).map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                          return (
                            <TapPopover key={a.id} trigger={
                              <div
                                className="text-[12px] font-medium rounded px-1.5 py-1 border truncate cursor-pointer active:scale-95 transition-colors"
                                style={isHL
                                  ? { backgroundColor: hlColor, borderColor: hlColor, color: contrastColor(hlColor) }
                                  : mobileDeptColor
                                    ? { borderColor: "var(--border)", backgroundColor: "var(--background)", borderLeft: `3px solid ${roleColor}` }
                                    : { borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                                onClick={() => highlightEnabled && setHighlightedStaff((p) => p === a.staff_id ? null : a.staff_id)}
                              >
                                {a.staff.first_name} {a.staff.last_name[0]}.
                              </div>
                            }>
                              <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                              <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[a.staff.role] ?? a.staff.role}{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                            </TapPopover>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))
            )}

            {/* Off / Libres row — hidden in person view and transposed by-task mode */}
            {weekViewMode !== "person" && !(isTaskMode && taskDaysAsRows) && <div className="grid border-b border-border" style={{ gridTemplateColumns: `${gridHdrW} repeat(${days.length}, 1fr)` }}>
              <div className="px-1 py-2 border-r border-border bg-muted sticky left-0 z-[5] flex items-center justify-end">
                <span className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">{t("offShort")}</span>
              </div>
              {days.map((day) => {
                const leaveIds = new Set(data?.onLeaveByDate?.[day.date] ?? [])
                const leaveTypes = data?.onLeaveTypeByDate?.[day.date] ?? {}
                const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
                const offDuty = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id))
                return (
                  <div key={day.date} className="px-0.5 py-1 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-0.5 content-start" style={{ backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" }}>
                    {[...leaveIds].map((sid) => {
                      const s = fullStaffMap[sid]
                      const lType = (leaveTypes[sid] ?? "other") as keyof typeof LEAVE_ICONS
                      const LeaveIcon = LEAVE_ICONS[lType] ?? CalendarX
                      const colors = LEAVE_COLORS[lType] ?? LEAVE_COLORS.other
                      return (
                        <TapPopover key={sid} trigger={
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-medium rounded px-0.5 py-0.5 border cursor-pointer active:scale-95"
                            style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }}>
                            <LeaveIcon className="size-2 shrink-0" />
                            {s ? `${s.fn[0]}${s.ln[0]}` : "?"}
                          </span>
                        }>
                          <p className="font-medium">{s ? `${s.fn} ${s.ln}` : t("onLeaveShort")}</p>
                          <p className="text-[11px] opacity-70">{lType}</p>
                        </TapPopover>
                      )
                    })}
                    {offDuty.map((s) => {
                      const isHL = highlightEnabled && highlightedStaff === s.id
                      const hlColor = staffColorLookup[s.id] ?? deptColorMap[s.role] ?? ROLE_COLOR[s.role] ?? "#94A3B8"
                      return (
                        <TapPopover key={s.id} trigger={
                          <span
                            className="inline-flex items-center text-[11px] px-1.5 py-0.5 font-medium rounded border cursor-pointer active:scale-95 transition-colors"
                            style={isHL ? { backgroundColor: hlColor, borderColor: hlColor, color: contrastColor(hlColor) } : { borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--muted-foreground)" }}
                            onClick={() => highlightEnabled && setHighlightedStaff((p) => p === s.id ? null : s.id)}
                          >
                            {s.first_name[0]}{s.last_name[0]}
                          </span>
                        }>
                          <p className="font-medium">{s.first_name} {s.last_name}</p>
                          <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[s.role] ?? s.role} · {s.days_per_week}d</p>
                        </TapPopover>
                      )
                    })}
                  </div>
                )
              })}
            </div>}

            {/* Week notes */}
            <div data-week-notes className="px-3 pt-3">
              <WeekNotes weekStart={weekStart} />
            </div>
          </div>
        )}
      </div>

      {/* Warnings bottom sheet */}
      <WeekWarningsSheet days={days} locale={locale} open={warningsOpen} onClose={() => setWarningsOpen(false)} />

      {/* AI insights bottom sheet */}
      {data?.aiReasoning && (
        <WeekInsightsSheet reasoning={data.aiReasoning} locale={locale} open={insightsOpen} onClose={() => setInsightsOpen(false)} />
      )}

      {/* Generate week bottom sheet */}
      <WeekGenerateSheet
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        weekStart={weekStart}
        rotaDisplayMode={data?.rotaDisplayMode ?? "by_shift"}
        engineConfig={data?.engineConfig}
        onRefresh={refresh}
      />
    </div>
  )
}
