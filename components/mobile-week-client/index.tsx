"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { ChevronLeft, ChevronRight, Sparkles, AlertTriangle, CalendarX, Check, BrainCircuit } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { useCanEdit } from "@/lib/role-context"
import { TapPopover } from "@/components/tap-popover"
import { WeekNotes } from "@/components/week-notes"
import { getRotaWeek, getActiveStaff, type RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { toast } from "sonner"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { ROLE_COLOR, contrastColor, ROLE_LABEL, TASK_NAMED_COLORS, LEAVE_ICONS, LEAVE_COLORS } from "./constants"
import { WeekPicker } from "./week-picker"
import { WeekInsightsSheet, WeekWarningsSheet } from "./bottom-sheets"
import { WeekOverflow } from "./week-overflow"
import { WeekGenerateSheet } from "./generate-sheet"

// Module-level caches — survive navigation away and back
const _mobileWeekCache = new Map<string, RotaWeekData>()
let _mobileWeekStaffCache: StaffWithSkills[] | null = null

export function MobileWeekClient() {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale() as "es" | "en"
  const canEdit = useCanEdit()
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()))
  const [data, setData] = useState<RotaWeekData | null>(() => _mobileWeekCache.get(getMondayOfWeek(new Date())) ?? null)
  const [staffList, setStaffList] = useState<StaffWithSkills[]>(() => _mobileWeekStaffCache ?? [])
  const [loading, setLoading] = useState(() => !_mobileWeekCache.has(getMondayOfWeek(new Date())))
  const weekGridRef = useRef<HTMLDivElement>(null)
  const [highlightEnabled, setHighlightEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("labrota_week_highlight") === "true"
  })
  const [highlightedStaff, setHighlightedStaff] = useState<string | null>(null)
  const [warningsOpen, setWarningsOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [weekViewMode, setWeekViewMode] = useState<"task" | "person">(() => {
    if (typeof window === "undefined") return "task"
    try {
      const fav = JSON.parse(localStorage.getItem("labrota_week_favourite") ?? "{}")
      return fav.weekViewMode === "person" ? "person" : "task"
    } catch { return "task" }
  })
  const [mobileDeptColor, setMobileDeptColor] = useState(() => {
    if (typeof window === "undefined") return true
    try {
      const fav = JSON.parse(localStorage.getItem("labrota_week_favourite") ?? "{}")
      if (fav.mobileDeptColor !== undefined) return fav.mobileDeptColor as boolean
    } catch {}
    return localStorage.getItem("labrota_mobile_dept_color") !== "false"
  })
  const [taskDaysAsRows, setTaskDaysAsRows] = useState(() => {
    if (typeof window === "undefined") return false
    try {
      const fav = JSON.parse(localStorage.getItem("labrota_week_favourite") ?? "{}")
      return fav.taskDaysAsRows === true
    } catch { return false }
  })
  const [weekFavourite, setWeekFavourite] = useState<{ weekViewMode: string; mobileDeptColor: boolean; taskDaysAsRows?: boolean } | null>(() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(localStorage.getItem("labrota_week_favourite") ?? "null") } catch { return null }
  })

  // Force task view for by-task orgs — "by person" is not available
  useEffect(() => {
    if (data?.rotaDisplayMode === "by_task" && weekViewMode === "person") {
      setWeekViewMode("task")
    }
  }, [data?.rotaDisplayMode, weekViewMode])

  function toggleHighlight() {
    const next = !highlightEnabled
    setHighlightEnabled(next)
    localStorage.setItem("labrota_week_highlight", String(next))
    if (!next) setHighlightedStaff(null)
  }

  function toggleMobileDeptColor() {
    const next = !mobileDeptColor
    setMobileDeptColor(next)
    localStorage.setItem("labrota_mobile_dept_color", String(next))
  }

  function toggleTaskDaysAsRows() {
    setTaskDaysAsRows((v) => !v)
  }

  const isFavourite = weekFavourite !== null &&
    weekFavourite.weekViewMode === weekViewMode &&
    weekFavourite.mobileDeptColor === mobileDeptColor &&
    (weekFavourite.taskDaysAsRows ?? false) === taskDaysAsRows

  function saveFavourite() {
    const fav = { weekViewMode, mobileDeptColor, taskDaysAsRows }
    setWeekFavourite(fav)
    localStorage.setItem("labrota_week_favourite", JSON.stringify(fav))
    toast.success(t("viewSavedFavorite"))
  }

  function goToFavourite() {
    if (!weekFavourite) return
    setWeekViewMode(weekFavourite.weekViewMode as "task" | "person")
    setMobileDeptColor(weekFavourite.mobileDeptColor)
    setTaskDaysAsRows(weekFavourite.taskDaysAsRows ?? false)
  }

  const hasFavourite = weekFavourite !== null

  useEffect(() => {
    const cachedData = _mobileWeekCache.get(weekStart)
    const cachedStaff = _mobileWeekStaffCache
    if (cachedData && cachedStaff) {
      setData(cachedData)
      setStaffList(cachedStaff)
      setLoading(false)
      // Silent refresh in background
      Promise.all([getRotaWeek(weekStart), getActiveStaff()]).then(([rotaData, staff]) => {
        _mobileWeekCache.set(weekStart, rotaData)
        _mobileWeekStaffCache = staff
        setData(rotaData)
        setStaffList(staff)
      }).catch(() => {})
      return
    }
    setLoading(true)
    Promise.all([
      cachedData ? Promise.resolve(cachedData) : getRotaWeek(weekStart),
      cachedStaff ? Promise.resolve(cachedStaff) : getActiveStaff(),
    ]).then(([rotaData, staff]) => {
      _mobileWeekCache.set(weekStart, rotaData)
      _mobileWeekStaffCache = staff
      setData(rotaData)
      setStaffList(staff)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [weekStart])

  function navigate(dir: number) {
    const d = new Date(weekStart + "T12:00:00")
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(getMondayOfWeek(d))
  }

  const today = new Date().toISOString().split("T")[0]
  const currentWeek = getMondayOfWeek(new Date())
  const isCurrentWeek = weekStart === currentWeek

  const days = data?.days ?? []
  const shiftTypes = data?.shiftTypes?.filter((s) => s.active !== false) ?? []
  const shiftTypeMap = Object.fromEntries(shiftTypes.map((s) => [s.code, s]))
  const timeFormat = data?.timeFormat ?? "24h"

  // Widen the sticky row-header column for task mode so task names fit
  const isTaskMode = weekViewMode !== "person" && data?.rotaDisplayMode === "by_task" && !!data?.tecnicas?.length
  const gridHdrW = isTaskMode ? "80px" : "52px"

  // Build staff role/name map from staffList for the Off row
  const fullStaffMap = useMemo(() => {
    const m: Record<string, { fn: string; ln: string; role: string; dpw: number }> = {}
    for (const s of staffList) m[s.id] = { fn: s.first_name, ln: s.last_name, role: s.role, dpw: s.days_per_week }
    return m
  }, [staffList])

  // Department color map from org config
  const deptColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const dept of data?.departments ?? []) if (dept.colour) m[dept.code] = dept.colour
    return m
  }, [data?.departments])

  // Per-staff highlight color (individual color field)
  const staffColorLookup = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of staffList) if (s.color) m[s.id] = s.color
    return m
  }, [staffList])

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

        {/* Warnings button */}
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
          onRefresh={() => {
            setLoading(true)
            Promise.all([getRotaWeek(weekStart), getActiveStaff()]).then(([rotaData, staff]) => {
              setData(rotaData); setStaffList(staff); setLoading(false)
            })
          }}
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
                const isSat = dow === 6
                const isSun = dow === 0
                const isWknd = isSat || isSun
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
              // ── Person view ─────────────────────────────────────────────
              <>
                {(() => {
                  const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
                  return staffList
                    .filter((s) => days.some((d) => d.assignments.some((a) => a.staff_id === s.id)))
                    .sort((a, b) => {
                      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
                      if (ro !== 0) return ro
                      return a.first_name.localeCompare(b.first_name)
                    })
                })().map((s) => {
                  const isHL = highlightEnabled && highlightedStaff === s.id
                  const roleColor = deptColorMap[s.role] ?? ROLE_COLOR[s.role] ?? "#94A3B8"
                  const hlColor = staffColorLookup[s.id] ?? roleColor
                  return (
                    <div key={s.id} className="grid border-b border-border" style={{ gridTemplateColumns: `${gridHdrW} repeat(${days.length}, 1fr)` }}>
                      <div
                        className="border-r border-border bg-muted sticky left-0 z-[5] flex items-center pl-1.5 pr-1 py-1.5 gap-1 cursor-pointer min-w-0"
                        style={mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : undefined}
                        onClick={() => highlightEnabled && setHighlightedStaff((p) => p === s.id ? null : s.id)}
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-foreground truncate leading-tight">{s.first_name} {s.last_name[0]}.</p>
                        </div>
                      </div>
                      {days.map((day) => {
                        const a = day.assignments.find((x) => x.staff_id === s.id)
                        const st = a ? shiftTypeMap[a.shift_type] : null
                        const dow = new Date(day.date + "T12:00:00").getDay()
                        const isSat = dow === 6; const isSun = dow === 0
                        return (
                          <div key={day.date} className="px-0.5 py-1 border-r border-border last:border-r-0 flex flex-col items-center justify-center min-w-0">
                            {a && st ? (
                              <TapPopover trigger={
                                <div
                                  className="w-full text-center cursor-pointer active:opacity-70"
                                  style={isHL ? { color: hlColor, fontWeight: 700 } : undefined}
                                >
                                  <span className="text-[11px] font-semibold leading-tight">{a.shift_type}</span>
                                </div>
                              }>
                                <p className="font-medium">{s.first_name} {s.last_name}</p>
                                <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[s.role] ?? s.role}</p>
                                <p className="text-[11px] opacity-70">{a.shift_type} · {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}</p>
                              </TapPopover>
                            ) : (
                              <span className="text-[10px] font-medium text-muted-foreground/40">{t("offShort")}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {/* Shift times legend */}
                {shiftTypes.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5 border-b border-border bg-muted/30">
                    {shiftTypes.map((st) => (
                      <span key={st.code} className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{st.code}</span> {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : data.rotaDisplayMode === "by_task" && data.tecnicas ? (
              (() => {
                const activeTecnicas = data.tecnicas.filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
                const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                function renderStaffChip(a: { id: string; staff_id: string; staff: { first_name: string; last_name: string; role: string } }) {
                  const isHL = highlightEnabled && highlightedStaff === a.staff_id
                  const roleColor = deptColorMap[a.staff.role] ?? ROLE_COLOR[a.staff.role] ?? "#94A3B8"
                  const hlColor = staffColorLookup[a.staff_id] ?? roleColor
                  const offDays = days.filter((d) => !d.assignments.some((x) => x.staff_id === a.staff_id))
                  const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                  return (
                    <TapPopover key={a.id} trigger={
                      <span
                        className="text-[11px] font-medium rounded px-1.5 py-1 border cursor-pointer active:scale-95 transition-colors"
                        style={isHL
                          ? { backgroundColor: hlColor, borderColor: hlColor, color: contrastColor(hlColor) }
                          : mobileDeptColor
                            ? { borderColor: "var(--border)", backgroundColor: "var(--background)", borderLeft: `3px solid ${roleColor}` }
                            : { borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                        onClick={() => highlightEnabled && setHighlightedStaff((p) => p === a.staff_id ? null : a.staff_id)}
                      >
                        {a.staff.first_name[0]}{a.staff.last_name[0]}
                      </span>
                    }>
                      <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                      <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[a.staff.role] ?? a.staff.role}{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                    </TapPopover>
                  )
                }

                if (taskDaysAsRows) {
                  // ── Transposed: days as rows, tasks as columns ───────────────
                  const dayColW = "44px"  // narrower than task-label column (80px)
                  const tecColW = `minmax(44px, 1fr)`
                  const colTemplate = `${dayColW} repeat(${activeTecnicas.length}, ${tecColW})`
                  return (
                    <>
                      {/* Sticky header: corner + task columns */}
                      <div className="sticky top-0 z-10 grid border-b border-border bg-muted" style={{ gridTemplateColumns: colTemplate }}>
                        <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[6]" />
                        {activeTecnicas.map((tec) => {
                          const dotColor = tec.color?.startsWith("#") ? tec.color : (TASK_NAMED_COLORS[tec.color] ?? "#3B82F6")
                          return (
                            <div key={tec.id} className="px-1 py-1.5 text-center border-r border-border last:border-r-0" style={{ borderBottom: `3px solid ${dotColor}` }}>
                              <span className="text-[9px] font-semibold text-foreground block leading-tight">{tec.codigo}</span>
                            </div>
                          )
                        })}
                      </div>
                      {/* Day rows */}
                      {days.map((day) => {
                        const date = new Date(day.date + "T12:00:00")
                        const dow = date.getDay()
                        const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date)
                        const num = date.getDate()
                        const isToday = day.date === today
                        const isWknd = dow === 0 || dow === 6
                        const isHoliday = !!data?.publicHolidays?.[day.date]
                        return (
                          <div key={day.date} className="grid border-b border-border" style={{ gridTemplateColumns: colTemplate }}>
                            <div className="border-r border-border bg-muted sticky left-0 z-[5] px-1 py-1 flex flex-col items-center justify-center" style={isHoliday ? { backgroundColor: "rgb(254 243 199 / 0.8)" } : undefined}>
                              <span className={cn("text-[8px] uppercase leading-none", isToday ? "text-primary font-semibold" : isWknd ? "text-muted-foreground/40" : "text-muted-foreground")}>{wday}</span>
                              {isToday
                                ? <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold mt-0.5">{num}</span>
                                : <span className={cn("text-[13px] font-semibold leading-none mt-0.5", isWknd ? "text-muted-foreground" : "text-primary")}>{num}</span>
                              }
                            </div>
                            {activeTecnicas.map((tec) => {
                              const assignments = day.assignments.filter((a) => a.function_label === tec.codigo || a.tecnica_id === tec.id)
                              return (
                                <div key={tec.id} className="px-0.5 py-1 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-0.5 content-start">
                                  {assignments.map((a) => renderStaffChip(a))}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </>
                  )
                }

                // ── Default: tasks as rows, days as columns ─────────────────
                return activeTecnicas.map((tec) => {
                  const dotColor = tec.color?.startsWith("#") ? tec.color : (TASK_NAMED_COLORS[tec.color] ?? "#3B82F6")
                  const tecLabel = locale === "en" ? tec.nombre_en : tec.nombre_es
                  return (
                    <div key={tec.id} className="grid border-b border-border" style={{ gridTemplateColumns: `${gridHdrW} repeat(${days.length}, 1fr)` }}>
                      <div className="border-r border-border bg-muted sticky left-0 z-[5] flex items-stretch">
                        <div className="w-[3px] shrink-0" style={{ backgroundColor: dotColor }} />
                        <div className="px-1 py-1.5 flex flex-col justify-center flex-1 min-w-0">
                          <span className="text-[11px] font-semibold text-foreground leading-tight">{tec.codigo}</span>
                          <span className="text-[9px] text-muted-foreground truncate leading-tight">{tecLabel}</span>
                        </div>
                      </div>
                      {days.map((day) => {
                        const assignments = day.assignments.filter((a) => a.function_label === tec.codigo || a.tecnica_id === tec.id)
                        return (
                          <div key={day.date} className="px-1 py-2 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-1 content-start">
                            {assignments.map((a) => renderStaffChip(a))}
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              })()
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
                          const offDays = days.filter((d) => !d.assignments.some((x) => x.staff_id === a.staff_id))
                          const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                          const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
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
                const dow = new Date(day.date + "T12:00:00").getDay()
                const isSat = dow === 6; const isSun = dow === 0
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
        onRefresh={() => {
          setLoading(true)
          Promise.all([getRotaWeek(weekStart), getActiveStaff()]).then(([rotaData, staff]) => {
            setData(rotaData); setStaffList(staff); setLoading(false)
          })
        }}
      />
    </div>
  )
}
