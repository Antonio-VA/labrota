"use client"

import { useCallback, useState, useTransition } from "react"
import { useUndoRedo } from "@/hooks/use-undo-redo"
import { useDepartmentFilter } from "@/hooks/use-department-filter"
import { usePersistedState, usePersistedToggle } from "@/hooks/use-persisted-state"
import { useCalendarDnd } from "@/hooks/use-calendar-dnd"
import { useRotaData } from "@/hooks/use-rota-data"
import { useFavoriteViews, type MobileFavoriteView } from "@/hooks/use-favorite-views"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { useCanEdit } from "@/lib/role-context"
import { Lock } from "lucide-react"
import { toast } from "sonner"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { saveUserPreferences } from "@/app/(clinic)/account-actions"
import {
  generateRota,
  generateRotaWithAI,
  publishRota,
  unlockRota,
  setPunctionsOverride,
  type RotaWeekData,
  applyTemplate,
  clearWeek,
  copyPreviousWeek,
  generateRotaHybrid,
  generateTaskHybrid,
} from "@/app/(clinic)/rota/actions"
import { formatDate } from "@/lib/format-date"
import { computeBiopsyForecast } from "@/lib/biopsy-forecast"
import { AssignmentSheet } from "@/components/assignment-sheet"
import dynamic from "next/dynamic"
const RotaHistoryPanel = dynamic(() => import("@/components/rota-history-panel").then((m) => m.RotaHistoryPanel), { ssr: false })
const SwapRequestDialog = dynamic(() => import("@/components/swap-request-dialog").then((m) => ({ default: m.SwapRequestDialog })), { ssr: false })
// Lazy-load heavy components not needed for initial render
const MonthGrid = dynamic(() => import("./calendar-panel/month-grid").then((m) => ({ default: m.MonthGrid })), { ssr: false })
const StaffProfilePanel = dynamic(() => import("./calendar-panel/staff-profile-panel").then((m) => ({ default: m.StaffProfilePanel })), { ssr: false })
const GenerationStrategyModal = dynamic(() => import("./calendar-panel/generation-modals").then((m) => ({ default: m.GenerationStrategyModal })), { ssr: false })
const AIReasoningModal = dynamic(() => import("./calendar-panel/generation-modals").then((m) => ({ default: m.AIReasoningModal })), { ssr: false })
const SaveTemplateModal = dynamic(() => import("./calendar-panel/generation-modals").then((m) => ({ default: m.SaveTemplateModal })), { ssr: false })
const ApplyTemplateModal = dynamic(() => import("./calendar-panel/generation-modals").then((m) => ({ default: m.ApplyTemplateModal })), { ssr: false })
const MultiWeekScopeDialog = dynamic(() => import("./calendar-panel/generation-modals").then((m) => ({ default: m.MultiWeekScopeDialog })), { ssr: false })
import { useViewerStaffId } from "@/lib/role-context"
import { StaffHoverProvider, useStaffHover } from "@/components/staff-hover-context"
import { WeekNotes } from "@/components/week-notes"
import type { StaffWithSkills } from "@/lib/types/database"
import type { ViewMode, CalendarLayout } from "./calendar-panel/types"
import { TODAY } from "./calendar-panel/constants"
import { addDays, getMonthStart, formatToolbarLabel, type GenerationStrategy } from "./calendar-panel/utils"

import { ShiftBudgetBar, MonthBudgetBar } from "./calendar-panel/budget-bars"
import { CalendarSkeleton } from "./calendar-panel/loading-skeleton"
import { DesktopToolbar } from "./calendar-panel/desktop-toolbar"
import { WeekContent } from "./calendar-panel/week-content"
import { MobileDaySection } from "./calendar-panel/mobile-day-section"

// ── Main panel ────────────────────────────────────────────────────────────────

export function CalendarPanel(props: { refreshKey?: number; initialData?: RotaWeekData; initialStaff?: StaffWithSkills[]; hasNotifications?: boolean; initialNotes?: import("@/app/(clinic)/notes-actions").WeekNoteData }) {
  return (
    <StaffHoverProvider>
      <CalendarPanelInner {...props} />
    </StaffHoverProvider>
  )
}

function CalendarPanelInner({ refreshKey = 0, initialData, initialStaff, hasNotifications = false, initialNotes }: { refreshKey?: number; initialData?: RotaWeekData; initialStaff?: StaffWithSkills[]; hasNotifications?: boolean; initialNotes?: import("@/app/(clinic)/notes-actions").WeekNoteData }) {
  const t      = useTranslations("schedule")
  const tc     = useTranslations("common")
  const _ts    = useTranslations("skills")
  const locale = useLocale()
  const canEdit = useCanEdit()
  const viewerStaffId = useViewerStaffId()

  const [view, setViewState]            = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "week"
    return (sessionStorage.getItem("labrota_view") as ViewMode) || "week"
  })
  const setView = (v: ViewMode) => { setViewState(v); sessionStorage.setItem("labrota_view", v) }
  const [calendarLayout, setCalendarLayout] = usePersistedState<CalendarLayout>("labrota_calendar_layout", "shift")
  const [compact, setCompact] = useState(false)
  const [personSimplified, togglePersonSimplified, _setPersonSimplified] = usePersistedToggle("labrota_person_simplified", true)
  const [daysAsRows, toggleDaysAsRows, setDaysAsRows] = usePersistedToggle("labrota_days_as_rows", false)
  const [colorChips, toggleColorChips, setColorChips] = usePersistedToggle("labrota_color_chips", true)
  const { enabled: highlightHover, setEnabled: setHighlightHover } = useStaffHover()

  const [currentDate, setCurrentDateState] = useState(() => {
    if (typeof window === "undefined") return initialData?.weekStart ?? TODAY
    // Restore saved week from sessionStorage; fall back to SSR data then today
    return sessionStorage.getItem("labrota_current_date") || initialData?.weekStart || TODAY
  })
  const setCurrentDate: typeof setCurrentDateState = (v) => {
    setCurrentDateState((prev) => {
      const next = typeof v === "function" ? v(prev) : v
      sessionStorage.setItem("labrota_current_date", next)
      return next
    })
  }

  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [showReasoningModal, setShowReasoningModal] = useState(false)
  const [multiWeekScope, setMultiWeekScope] = useState<string[] | null>(null)
  const [showMultiWeekDialog, setShowMultiWeekDialog] = useState(false)
  const [showCopyConfirm, setShowCopyConfirm] = useState(false)
  const [isPending, startTransition]    = useTransition()
  const [pendingAction, setPendingAction] = useState<"generating" | "deleting" | null>(null)

  // Day edit sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDate, setSheetDate] = useState<string | null>(null)

  // Staff profile panel state
  const [profileOpen, setProfileOpen]       = useState(false)
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null)
  const [saveTemplateOpen, setSaveTemplateOpen]   = useState(false)

  // Mobile edit mode state
  const [mobileEditMode, setMobileEditMode] = useState(false)
  const [preEditSnapshot, setPreEditSnapshot] = useState<RotaWeekData | null>(null)
  const [mobileCompact, toggleMobileCompact, setMobileCompact] = usePersistedToggle("labrota_mobile_compact", true)
  const [mobileDeptColor, toggleMobileDeptColor, setMobileDeptColor] = usePersistedToggle("labrota_mobile_dept_color", true)
  const [mobileViewMode, setMobileViewMode] = useState<"shift" | "person">("shift")
  const [mobileAddSheet, setMobileAddSheet] = useState<{ open: boolean; role: string }>({ open: false, role: "" })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [monthViewMode, setMonthViewMode] = usePersistedState<"shift" | "person">("labrota_month_view", "shift")
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)

  // Swap state for desktop viewers
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<{ id: string; shiftType: string; date: string } | null>(null)

  // Favorite views (desktop + mobile) — synced to DB, cached in localStorage
  const { favoriteView, setFavoriteView, mobileFavoriteView, setMobileFavoriteView } = useFavoriteViews({
    onApplyDesktop: (fav) => {
      const sessionView = typeof window !== "undefined" ? sessionStorage.getItem("labrota_view") : null
      if (!sessionView) setView(fav.view as ViewMode)
      setCalendarLayout(fav.calendarLayout as CalendarLayout)
      setDaysAsRows(fav.daysAsRows)
      setCompact(fav.compact)
      setColorChips(fav.colorChips)
      setHighlightHover(fav.highlightEnabled)
    },
    onApplyMobile: (fav) => {
      setMobileViewMode(fav.viewMode as "shift" | "person")
      setMobileCompact(fav.compact)
      setMobileDeptColor(fav.deptColor)
    },
  })

  // Derived
  const weekStart  = getMondayOfWeek(new Date(currentDate + "T12:00:00"))
  const monthStart = getMonthStart(currentDate)

  // Data fetching, caching, staff loading (extracted to hook)
  const {
    weekData, setWeekData, monthSummary, setMonthSummary: _setMonthSummary,
    loadingWeek, setLoadingWeek, loadingMonth, setLoadingMonth,
    error, setError, initialLoaded, staffList, staffLoaded,
    prevWeekHasRota, punctionsOverride, setPunctionsOverrideLocal,
    activeStrategy, setActiveStrategy, liveDays, setLiveDays,
    aiReasoningRef, reasoningSourceRef,
    fetchWeek, fetchWeekSilent, fetchMonth, handleRefresh: _handleRefresh, prefetchWeek,
    handleBiopsyChange, lastFetchIdRef, gridSetDaysRef,
  } = useRotaData({ weekStart, monthStart, view, canEdit, refreshKey, initialData, initialStaff })

  // Hover-prefetch: warm the cache the moment the user's cursor enters a nav
  // button, so the subsequent click hits a primed cache. Only week view — month
  // view jumps 28 days, which would need a different fetch strategy.
  const handleHoverNav = useCallback((dir: -1 | 1) => {
    if (view !== "week") return
    const target = addDays(weekStart, dir * 7)
    prefetchWeek(getMondayOfWeek(new Date(target + "T12:00:00")))
  }, [view, weekStart, prefetchWeek])

  // Department filter (extracted to hook)
  const {
    departments: _departments, globalDeptMaps, ALL_DEPTS, deptAbbrMap,
    deptFilter, allDeptsSelected: _allDeptsSelected, toggleDept, setAllDepts, setOnlyDept,
    filteredStaffList,
  } = useDepartmentFilter(weekData, staffList)

  const desktopSwapEnabled = !canEdit && viewerStaffId && weekData?.enableSwapRequests && weekData?.rota?.status === "published"

  const openProfile = useCallback((staffId: string) => {
    setProfileStaffId(staffId)
    setProfileOpen(true)
  }, [])

  // For desktop viewers: intercept chip click on their own assignments to open swap dialog
  const handleDesktopChipClick = useCallback((assignment: { id?: string; staff_id: string; shift_type?: string }, date: string) => {
    if (desktopSwapEnabled && assignment.staff_id === viewerStaffId && assignment.id && assignment.shift_type && date) {
      setSwapAssignment({ id: assignment.id, shiftType: assignment.shift_type, date })
      setSwapDialogOpen(true)
    } else {
      setProfileStaffId(assignment.staff_id)
      setProfileOpen(true)
    }
  }, [desktopSwapEnabled, viewerStaffId])

  const handleOpenSheet = useCallback((date: string) => {
    setSheetDate(date)
    setSheetOpen(true)
  }, [])

  // DnD (extracted to hook)
  const {
    draggingId: _draggingId, draggingFrom: _draggingFrom, dragOverDate: _dragOverDate,
    handleChipDragStart: _handleChipDragStart, handleChipDragEnd: _handleChipDragEnd,
    handleColumnDragOver: _handleColumnDragOver, handleColumnDragLeave: _handleColumnDragLeave, handleColumnDrop: _handleColumnDrop,
  } = useCalendarDnd({ weekStart, fetchWeek, setError })

  // Undo/Redo (extracted to hook)
  const {
    undoLen, redoLen, showSaved,
    triggerSaved, cancelLastUndo, pushUndo, handleUndo, handleRedo,
  } = useUndoRedo({ weekStart, locale, weekData, setWeekData, fetchWeekSilent, lastFetchIdRef, gridSetDaysRef })

  // Navigation — both views move by 1 week
  function navigate(dir: -1 | 1) {
    setShowStrategyModal(false)
    const days = view === "month" ? 28 : 7
    setCurrentDate((d) => addDays(d, dir * days))
  }

  function goToToday() {
    setCurrentDate(TODAY)
    setShowStrategyModal(false)
  }

  // Generate / publish / unlock
  function handleGenerateClick() {
    if (view === "month" && monthSummary) {
      // 4-week view: always show scope dialog so user can pick scope
      setShowMultiWeekDialog(true)
      return
    }
    setShowStrategyModal(true)
  }

  function handleStrategyGenerate(strategy: GenerationStrategy, templateId?: string) {
    setShowStrategyModal(false)
    const weeksToGenerate = multiWeekScope ?? [weekStart]
    setMultiWeekScope(null)

    setActiveStrategy(strategy)
    setLoadingWeek(true)
    setPendingAction(strategy === "manual" ? "deleting" : "generating")
    startTransition(async () => {
      try {
        let successCount = 0
        let errorMsg: string | null = null

        for (const ws of weeksToGenerate) {
          if (strategy === "manual") {
            const result = await clearWeek(ws)
            if (result.error) { errorMsg = result.error; break }
            successCount++
          } else if (strategy === "flexible_template" && templateId) {
            const result = await applyTemplate(templateId, ws, true)
            if (result.error) { errorMsg = result.error; break }
            successCount++
          } else if (strategy === "ai_hybrid") {
            const isTask = weekData?.rotaDisplayMode === "by_task"
            const result = isTask
              ? await generateTaskHybrid(ws, false)
              : await generateRotaHybrid(ws, false)
            if (result.error) { errorMsg = result.error; break }
            if (result.reasoning) {
              aiReasoningRef.current = result.reasoning
              reasoningSourceRef.current = "hybrid"
            }
            successCount++
          } else if (strategy === "ai_reasoning") {
            const result = await generateRotaWithAI(ws, false)
            if (result.error) { errorMsg = result.error; break }
            if (result.reasoning) {
              aiReasoningRef.current = result.reasoning
              reasoningSourceRef.current = "claude"
            }
            successCount++
          } else if (strategy === "ai_optimal") {
            // Route to the engine version configured for this org + display mode
            const isByTask = weekData?.rotaDisplayMode === "by_task"
            const version = isByTask
              ? (weekData?.engineConfig?.taskOptimalVersion ?? "v1")
              : (weekData?.engineConfig?.aiOptimalVersion ?? "v2")
            const genType = version === "v1" ? "ai_optimal" : "ai_optimal_v2"
            const result = await generateRota(ws, false, genType)
            if (result.error) { errorMsg = result.error; break }
            successCount++
          }
        }

        if (errorMsg) {
          setError(errorMsg)
          toast.error(errorMsg)
        } else if (weeksToGenerate.length > 1) {
          toast.success(t("weeksGenerated", { count: successCount }))
        } else {
          toast.success(t("scheduleGenerated"))
        }

        fetchWeek(weekStart)
        if (view === "month") fetchMonth(monthStart, weekStart)
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e)
        const isTimeout = /failed to fetch|timeout|aborted|network/i.test(raw)
        const msg = isTimeout ? t("generatingTimeout") : raw || t("generatingError")
        setError(msg)
        toast.error(msg)
      } finally {
        setActiveStrategy(null)
        setPendingAction(null)
      }
    })
  }

  function handlePublish() {
    if (!weekData?.rota) return
    startTransition(async () => {
      const result = await publishRota(weekData.rota!.id)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handleUnlock() {
    if (!weekData?.rota) return
    startTransition(async () => {
      const result = await unlockRota(weekData.rota!.id)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }


  function handleMonthDayClick(date: string) {
    setCurrentDate(date)   // ensures correct week is loaded for the AssignmentSheet
    setSheetDate(date)
    setSheetOpen(true)
  }


  function handlePunctionsChange(date: string, value: number | null) {
    if (!weekData?.rota) return
    const prevGaps = weekData.days.find((d) => d.date === date)?.skillGaps ?? []
    const rotaId = weekData.rota.id
    const ws = weekStart
    setPunctionsOverrideLocal((prev) => {
      if (value === null) {
        const { [date]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [date]: value }
    })
    startTransition(async () => {
      const result = await setPunctionsOverride(rotaId, date, value)
      if (result.error) { setError(result.error); return }
      const newData = await fetchWeekSilent(ws)
      if (!newData) return
      const newGaps = newData.days.find((d) => d.date === date)?.skillGaps ?? []
      if (newGaps.length > prevGaps.length) {
        toast.warning(t("coverageInsufficient"))
      } else if (newGaps.length === 0 && prevGaps.length > 0) {
        toast.success(t("coverageOk"))
      }
    })
  }

  const rota           = weekData?.rota ?? null
  const isPublished    = rota?.status === "published"
  const isDraft        = rota?.status === "draft"
  const hasWeekAssignments = weekData?.days.some((d) => d.assignments.length > 0) ?? false
  const hasMonthAssignments = monthSummary?.days.some((d) => d.staffCount > 0) ?? false
  const hasAssignments = view === "month" ? hasMonthAssignments : hasWeekAssignments
  const anyMonthWeekPublished = monthSummary?.weekStatuses?.some((ws) => ws.status === "published") ?? false
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null

  const sheetDay = sheetDate ? (weekData?.days.find((d) => d.date === sheetDate) ?? null) : null

  const toggleHighlightHover = useCallback(() => setHighlightHover(!highlightHover), [highlightHover, setHighlightHover])

  // On first load, show inline skeleton so the panel occupies space
  // and the chat panel doesn't appear alone before the calendar.
  if (!initialLoaded && !staffLoaded) return <CalendarSkeleton />

  return (
    <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Desktop toolbar */}
      <DesktopToolbar
        currentDate={currentDate} weekStart={weekStart} view={view} setView={setView}
        locale={locale} TODAY={TODAY} goToToday={goToToday} navigate={navigate} onHoverNav={handleHoverNav}
        onWeekJump={(date) => { setCurrentDate(date); setShowStrategyModal(false) }}
        calendarLayout={calendarLayout} setCalendarLayout={setCalendarLayout}
        monthViewMode={monthViewMode} setMonthViewMode={setMonthViewMode}
        rotaDisplayMode={weekData?.rotaDisplayMode}
        compact={compact} setCompact={setCompact} personSimplified={personSimplified}
        togglePersonSimplified={togglePersonSimplified} daysAsRows={daysAsRows}
        toggleDaysAsRows={toggleDaysAsRows} colorChips={colorChips} toggleColorChips={toggleColorChips}
        highlightHover={highlightHover} toggleHighlightHover={toggleHighlightHover}
        isPending={isPending} pendingAction={pendingAction}
        hasAssignments={hasAssignments} isPublished={!!isPublished} isDraft={!!isDraft}
        anyMonthWeekPublished={anyMonthWeekPublished} canEdit={canEdit} hasNotifications={hasNotifications}
        showSaved={showSaved} undoLen={undoLen} redoLen={redoLen} onUndo={handleUndo} onRedo={handleRedo}
        deptFilter={deptFilter} allDepts={ALL_DEPTS} onToggleDept={toggleDept}
        onSetAllDepts={setAllDepts} onSetOnlyDept={setOnlyDept}
        deptLabels={globalDeptMaps.label} deptColors={globalDeptMaps.border} deptAbbr={deptAbbrMap}
        weekData={weekData} monthSummary={monthSummary} filteredStaffList={filteredStaffList}
        aiReasoning={weekData?.aiReasoning || aiReasoningRef.current || null}
        onGenerateClick={handleGenerateClick} onPublish={handlePublish} onUnlock={handleUnlock}
        onShowReasoning={() => setShowReasoningModal(true)}
        onSaveTemplate={() => setSaveTemplateOpen(true)}
        onApplyTemplate={() => setApplyTemplateOpen(true)}
        onShowHistory={() => setHistoryOpen(true)}
        onDelete={() => {
          const msg = view === "month" ? t("confirm4WeeksDelete") : t("deleteWeekConfirm")
          if (confirm(msg)) {
            if (view === "month") setLoadingMonth(true)
            setPendingAction("deleting")
            startTransition(async () => {
              if (view === "month" && monthSummary) {
                const allWeekStarts: string[] = []
                for (let i = 0; i < monthSummary.days.length; i += 7) {
                  if (monthSummary.days[i]) allWeekStarts.push(monthSummary.days[i].date)
                }
                let errors = 0
                for (const ws of allWeekStarts) {
                  const result = await clearWeek(ws)
                  if (result.error) errors++
                }
                if (errors > 0) toast.error(t("weeksWithErrors", { count: errors }))
                else toast.success(t("fourWeeksDeleted"))
                fetchWeek(weekStart)
                fetchMonth(monthStart, weekStart)
              } else {
                const result = await clearWeek(weekStart)
                if (result.error) toast.error(result.error)
                else { toast.success(t("rotaDeleted")); fetchWeek(weekStart) }
              }
              setPendingAction(null)
            })
          }
        }}
        onExportPdf={() => {
          if (!weekData) return
          import("@/lib/export-pdf").then(({ exportPdfByShift, exportPdfByPerson, exportPdfByTask }) => {
            const on = document.querySelector("[data-org-name]")?.textContent ?? "LabRota"
            const notesEl = document.querySelector("[data-week-notes]")
            const noteTexts = notesEl ? Array.from(notesEl.querySelectorAll("[data-note-text]")).map((el) => el.textContent ?? "").filter(Boolean) : []
            const n = noteTexts.length > 0 ? noteTexts : undefined
            if (weekData.rotaDisplayMode === "by_task") exportPdfByTask(weekData, weekData.tecnicas ?? [], on, locale, n, daysAsRows)
            else if (calendarLayout === "person") exportPdfByPerson(weekData, on, locale, n, daysAsRows)
            else exportPdfByShift(weekData, on, locale, n, daysAsRows)
          })
        }}
        onExportExcel={() => {
          if (!weekData) return
          import("@/lib/export-excel").then(({ exportWeekByShift, exportWeekByPerson, exportWeekByTask }) => {
            if (weekData.rotaDisplayMode === "by_task") exportWeekByTask(weekData, weekData.tecnicas ?? [], locale, daysAsRows)
            else if (calendarLayout === "person") exportWeekByPerson(weekData, locale, daysAsRows)
            else exportWeekByShift(weekData, locale, daysAsRows)
          })
        }}
        favoriteView={favoriteView}
        onSaveFavorite={() => {
          const fav = { view, calendarLayout, daysAsRows, compact, colorChips, highlightEnabled: highlightHover }
          setFavoriteView(fav)
          localStorage.setItem("labrota_favorite_view", JSON.stringify(fav))
          saveUserPreferences({ favoriteView: fav })
          toast.success(t("favoriteViewSaved"))
        }}
        onGoToFavorite={favoriteView ? () => {
          setView(favoriteView.view as ViewMode)
          setCalendarLayout(favoriteView.calendarLayout as CalendarLayout)
          setDaysAsRows(favoriteView.daysAsRows)
          setCompact(favoriteView.compact)
          setColorChips(favoriteView.colorChips)
          setHighlightHover(favoriteView.highlightEnabled)
        } : undefined}
        t={t} tc={tc}
      />

      {/* Old mobile toolbar removed — replaced by compact toolbar inside the mobile day view section */}

      {/* Banners */}
      <div className="flex flex-col gap-2 px-4 pt-2 empty:hidden shrink-0">
        {isPublished && view === "week" && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-2 flex items-center gap-2">
            <Lock className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="text-[13px] text-emerald-700 dark:text-emerald-300">
              {rota?.published_at
                ? t("rotaPublishedBy", {
                    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(rota.published_at)),
                    author: rota.published_by ?? "—",
                  })
                : t("rotaPublished")}
            </span>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
            <span className="text-[13px] text-destructive">{error}</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">

        {/* Week view */}
        {view === "week" && (
          <WeekContent
            weekData={weekData} staffList={staffList} filteredStaffList={filteredStaffList}
            calendarLayout={calendarLayout} daysAsRows={daysAsRows} compact={compact}
            colorChips={colorChips} personSimplified={personSimplified}
            isPublished={!!isPublished || false} canEdit={canEdit} isPending={isPending}
            loading={loadingWeek} staffLoaded={staffLoaded}
            weekStart={weekStart} locale={locale} activeStrategy={activeStrategy}
            punctionsOverride={punctionsOverride}
            onPunctionsChange={handlePunctionsChange} onBiopsyChange={handleBiopsyChange}
            openProfile={openProfile} onDesktopChipClick={handleDesktopChipClick}
            onOpenSheet={handleOpenSheet} onMonthDayClick={handleMonthDayClick}
            pushUndo={canEdit ? pushUndo : undefined}
            cancelLastUndo={canEdit ? cancelLastUndo : undefined}
            triggerSaved={canEdit ? triggerSaved : undefined}
            fetchWeekSilent={fetchWeekSilent} setLiveDays={setLiveDays}
            onGenerateClick={handleGenerateClick}
            showCopyConfirm={showCopyConfirm} setShowCopyConfirm={setShowCopyConfirm}
            prevWeekHasRota={prevWeekHasRota}
            onCopyPreviousWeek={() => {
              setShowCopyConfirm(false)
              setLoadingWeek(true)
              startTransition(async () => {
                const result = await copyPreviousWeek(weekStart)
                if (result.error) { toast.error(result.error); return }
                toast.success(t("copyAssignments", { count: result.count ?? 0 }))
                fetchWeek(weekStart)
              })
            }}
            desktopSwapStaffId={desktopSwapEnabled ? viewerStaffId : null}
            gridSetDaysRef={gridSetDaysRef}
            t={t} tc={tc}
          />
        )}

        {/* Month view */}
        {view === "month" && (
          <div className="hidden md:flex flex-col flex-1 overflow-auto px-4 py-3">
            <MonthGrid
              summary={monthSummary}
              loading={loadingMonth}
              locale={locale}
              currentDate={currentDate}
              onSelectDay={handleMonthDayClick}
              onSelectWeek={(ws) => { setCurrentDate(ws); setView("week") }}
              firstDayOfWeek={weekData?.firstDayOfWeek ?? 0}
              punctionsOverride={punctionsOverride}
              onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
              onBiopsyChange={canEdit ? handleBiopsyChange : undefined}
              monthViewMode={monthViewMode}
              colorChips={colorChips}
            />
          </div>
        )}

        {/* Mobile: day view (all users) */}
        <MobileDaySection
          weekData={weekData} staffList={staffList}
          currentDate={currentDate} setCurrentDate={setCurrentDate as any}
          weekStart={weekStart} currentDayData={currentDayData}
          loading={loadingWeek} staffLoaded={staffLoaded} locale={locale} canEdit={canEdit}
          mobileEditMode={mobileEditMode} setMobileEditMode={setMobileEditMode}
          preEditSnapshot={preEditSnapshot} setPreEditSnapshot={setPreEditSnapshot}
          mobileCompact={mobileCompact} toggleMobileCompact={toggleMobileCompact}
          mobileDeptColor={mobileDeptColor} toggleMobileDeptColor={toggleMobileDeptColor}
          mobileViewMode={mobileViewMode} setMobileViewMode={setMobileViewMode}
          mobileAddSheet={mobileAddSheet} setMobileAddSheet={setMobileAddSheet as any}
          punctionsOverride={punctionsOverride} TODAY={TODAY}
          setWeekData={setWeekData} fetchWeekSilent={fetchWeekSilent}
          setShowStrategyModal={setShowStrategyModal} isPending={isPending}
          mobileFavoriteView={mobileFavoriteView} setMobileFavoriteView={setMobileFavoriteView}
          onSaveMobileFavorite={() => {
            const fav: MobileFavoriteView = { viewMode: mobileViewMode, compact: mobileCompact, deptColor: mobileDeptColor }
            setMobileFavoriteView(fav)
            localStorage.setItem("labrota_mobile_favorite_view", JSON.stringify(fav))
            saveUserPreferences({ mobileFavoriteView: fav })
            toast.success(t("favoriteViewSaved"))
          }}
          onGoToMobileFavorite={mobileFavoriteView ? () => {
            setMobileViewMode(mobileFavoriteView.viewMode as "shift" | "person")
            setMobileCompact(mobileFavoriteView.compact)
            setMobileDeptColor(mobileFavoriteView.deptColor)
          } : undefined}
          t={t} tc={tc}
        />
      </div>

      {/* Day edit sheet */}
      <AssignmentSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
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
        isPublished={!!isPublished || !canEdit}
        onSaved={() => { fetchWeek(weekStart); if (view === "month") fetchMonth(monthStart, weekStart) }}
        onPunctionsChange={handlePunctionsChange}
        timeFormat={weekData?.timeFormat}
        biopsyForecast={(() => {
          if (!sheetDate || !weekData) return 0
          const pd = weekData.punctionsDefault
          function getPunc(dateStr: string): number {
            if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
            if (pd[dateStr] !== undefined) return pd[dateStr]
            const dow = new Date(dateStr + "T12:00:00").getDay()
            const sameDow = Object.entries(pd).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
            return sameDow ? sameDow[1] : 0
          }
          return computeBiopsyForecast(sheetDate, getPunc, weekData.biopsyConversionRate ?? 0.5, weekData.biopsyDay5Pct ?? 0.5, weekData.biopsyDay6Pct ?? 0.5)
        })()}
        rotaDisplayMode={weekData?.rotaDisplayMode}
        taskConflictThreshold={weekData?.taskConflictThreshold}
        enableTaskInShift={weekData?.enableTaskInShift ?? false}
      />

      {/* Multi-week generation scope dialog */}
      {showMultiWeekDialog && monthSummary && (
        <MultiWeekScopeDialog
          monthSummary={monthSummary}
          onClose={() => setShowMultiWeekDialog(false)}
          onSelectScope={(weeks) => { setMultiWeekScope(weeks); setShowStrategyModal(true) }}
        />
      )}

      {/* Staff profile panel */}
      <StaffProfilePanel
        staffId={profileStaffId}
        staffList={staffList}
        weekData={weekData}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onRefreshWeek={() => fetchWeek(weekStart)}
      />

      {/* Rota history panel */}
      <RotaHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        weekStart={weekStart}
        onRestored={() => fetchWeek(weekStart)}
      />

      {/* Week notes — desktop only, min-h ensures space is reserved during load */}
      {view === "week" && (
        <div className="hidden md:block shrink-0 min-h-[36px]" data-week-notes>
          <WeekNotes weekStart={weekStart} initialData={initialNotes} />
        </div>
      )}

      {/* Bottom taskbar — desktop only, hidden for viewers */}
      <div className="hidden md:block shrink-0">
        {canEdit && view === "week" && !weekData && loadingWeek && (
          <div className="shrink-0 h-12 bg-background border-t border-border flex items-center px-4 gap-2">
            <div className="h-3 w-20 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
            <div className="h-5 w-14 rounded bg-muted animate-pulse" />
          </div>
        )}
        {canEdit && view === "week" && weekData && (
          <ShiftBudgetBar
            data={weekData}
            staffList={filteredStaffList}
            weekLabel={formatToolbarLabel("week", currentDate, weekStart, locale)}
            onPillClick={openProfile}
            liveDays={weekData?.rotaDisplayMode === "by_task" ? null : liveDays}
            deptFilter={deptFilter}
            colorChips={colorChips}
          />
        )}
        {canEdit && view === "month" && monthSummary && !loadingMonth && (
          <MonthBudgetBar
            summary={monthSummary}
            monthLabel={formatToolbarLabel("month", currentDate, weekStart, locale)}
            onPillClick={openProfile}
          />
        )}
      </div>

      {/* Generation strategy modal */}
      <GenerationStrategyModal
        open={showStrategyModal}
        weekStart={weekStart}
        weekLabel={formatToolbarLabel("week", currentDate, weekStart, locale)}
        onClose={() => setShowStrategyModal(false)}
        onGenerate={handleStrategyGenerate}
        rotaDisplayMode={weekData?.rotaDisplayMode ?? "by_shift"}
        engineConfig={weekData?.engineConfig}
      />

      {/* AI Reasoning modal */}
      <AIReasoningModal
        open={showReasoningModal}
        reasoning={weekData?.aiReasoning ?? aiReasoningRef.current ?? ""}
        onClose={() => setShowReasoningModal(false)}
        variant={reasoningSourceRef.current === "hybrid" ? "hybrid" : "claude"}
      />

      {/* Template modals */}
      <SaveTemplateModal
        open={saveTemplateOpen}
        weekStart={weekStart}
        onClose={() => setSaveTemplateOpen(false)}
        onSaved={() => {}}
      />
      <ApplyTemplateModal
        open={applyTemplateOpen}
        weekStart={weekStart}
        onClose={() => setApplyTemplateOpen(false)}
        onApplied={() => { fetchWeek(weekStart); if (view === "month") fetchMonth(monthStart, weekStart) }}
      />

      {/* Desktop viewer swap dialog */}
      {desktopSwapEnabled && swapAssignment && (
        <SwapRequestDialog
          open={swapDialogOpen}
          onOpenChange={setSwapDialogOpen}
          assignmentId={swapAssignment.id}
          shiftType={swapAssignment.shiftType}
          date={swapAssignment.date}
          dateLabel={formatDate(swapAssignment.date, locale as "es" | "en")}
          locale={locale as "es" | "en"}
          weekStart={weekStart}
        />
      )}

    </main>
  )
}
