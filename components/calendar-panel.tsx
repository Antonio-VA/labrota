"use client"

import { useCallback, useState } from "react"
import { useUndoRedo } from "@/hooks/use-undo-redo"
import { useDepartmentFilter } from "@/hooks/use-department-filter"
import { usePersistedState, usePersistedToggle } from "@/hooks/use-persisted-state"
import { useCalendarDnd } from "@/hooks/use-calendar-dnd"
import { useRotaData } from "@/hooks/use-rota-data"
import { useRotaActions } from "@/hooks/use-rota-actions"
import { useFavoriteViews, type FavoriteView, type MobileFavoriteView } from "@/hooks/use-favorite-views"
import { useCalendarModals } from "@/hooks/use-calendar-modals"
import { useCalendarExport } from "@/hooks/use-calendar-export"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { useCanEdit } from "@/lib/role-context"
import { Lock } from "lucide-react"
import { toast } from "sonner"
import { getMondayOf } from "@/lib/format-date"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import dynamic from "next/dynamic"
const MonthGrid = dynamic(() => import("./calendar-panel/month-grid").then((m) => ({ default: m.MonthGrid })), { ssr: false })
import { useViewerStaffId } from "@/lib/role-context"
import { StaffHoverProvider, useStaffHover } from "@/components/staff-hover-context"
import { WeekNotes } from "@/components/week-notes"
import type { StaffWithSkills } from "@/lib/types/database"
import type { ViewMode, CalendarLayout } from "./calendar-panel/types"
import { TODAY } from "./calendar-panel/constants"
import { addDays, getMonthStart } from "./calendar-panel/utils"

import { CalendarSkeleton } from "./calendar-panel/loading-skeleton"
import { DesktopToolbar } from "./calendar-panel/desktop-toolbar"
import { WeekContent } from "./calendar-panel/week-content"
import { MobileDaySection } from "./calendar-panel/mobile-day-section"
import { AssignmentSheetHost } from "./calendar-panel/assignment-sheet-host"
import { CalendarModalsHost } from "./calendar-panel/calendar-modals-host"
import { BottomTaskbar } from "./calendar-panel/bottom-taskbar"

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
    return sessionStorage.getItem("labrota_current_date") || initialData?.weekStart || TODAY
  })
  const setCurrentDate: typeof setCurrentDateState = (v) => {
    setCurrentDateState((prev) => {
      const next = typeof v === "function" ? v(prev) : v
      sessionStorage.setItem("labrota_current_date", next)
      return next
    })
  }

  const [mobileEditMode, setMobileEditMode] = useState(false)
  const [preEditSnapshot, setPreEditSnapshot] = useState<RotaWeekData | null>(null)
  const [mobileCompact, toggleMobileCompact, setMobileCompact] = usePersistedToggle("labrota_mobile_compact", true)
  const [mobileDeptColor, toggleMobileDeptColor, setMobileDeptColor] = usePersistedToggle("labrota_mobile_dept_color", true)
  const [mobileViewMode, setMobileViewMode] = useState<"shift" | "person">("shift")
  const [mobileAddSheet, setMobileAddSheet] = useState<{ open: boolean; role: string }>({ open: false, role: "" })
  const [monthViewMode, setMonthViewMode] = usePersistedState<"shift" | "person">("labrota_month_view", "shift")

  const { favoriteView, mobileFavoriteView, saveDesktop, goToDesktop, saveMobile, goToMobile } = useFavoriteViews({
    desktop: {
      apply: (fav: FavoriteView, { isInitial }) => {
        const sessionHasView = isInitial && typeof window !== "undefined" && !!sessionStorage.getItem("labrota_view")
        if (!sessionHasView) setView(fav.view as ViewMode)
        setCalendarLayout(fav.calendarLayout as CalendarLayout)
        setDaysAsRows(fav.daysAsRows)
        setCompact(fav.compact)
        setColorChips(fav.colorChips)
        setHighlightHover(fav.highlightEnabled)
      },
      capture: () => ({ view, calendarLayout, daysAsRows, compact, colorChips, highlightEnabled: highlightHover }),
    },
    mobile: {
      apply: (fav: MobileFavoriteView) => {
        setMobileViewMode(fav.viewMode as "shift" | "person")
        setMobileCompact(fav.compact)
        setMobileDeptColor(fav.deptColor)
      },
      capture: () => ({ viewMode: mobileViewMode, compact: mobileCompact, deptColor: mobileDeptColor }),
    },
    onSaved: () => toast.success(t("favoriteViewSaved")),
  })

  const weekStart  = getMondayOf(currentDate)
  const monthStart = getMonthStart(currentDate)

  const {
    weekData, setWeekData, monthSummary,
    loadingWeek, setLoadingWeek, loadingMonth, setLoadingMonth,
    error, setError, initialLoaded, staffList, staffLoaded,
    prevWeekHasRota, punctionsOverride, setPunctionsOverrideLocal,
    activeStrategy, setActiveStrategy, liveDays, setLiveDays,
    aiReasoningRef, reasoningSourceRef,
    fetchWeek, fetchWeekSilent, fetchMonth, prefetchWeek,
    handleBiopsyChange, lastFetchIdRef, gridSetDaysRef,
  } = useRotaData({ weekStart, monthStart, view, canEdit, refreshKey, initialData, initialStaff })

  const modals = useCalendarModals({ weekData })

  const {
    isPending, pendingAction,
    multiWeekScope, setMultiWeekScope,
    showCopyConfirm, setShowCopyConfirm,
    handleStrategyGenerate, handlePublish, handleUnlock,
    handleDelete, handleCopyPreviousWeek, handlePunctionsChange,
  } = useRotaActions({
    weekStart, monthStart, view,
    weekData, monthSummary,
    setError, setActiveStrategy,
    setLoadingWeek, setLoadingMonth,
    setPunctionsOverrideLocal,
    aiReasoningRef, reasoningSourceRef,
    fetchWeek, fetchWeekSilent, fetchMonth,
    setShowStrategyModal: modals.setShowStrategyModal,
    t,
  })

  // Hover-prefetch: warm the cache the moment the user's cursor enters a nav
  // button, so the subsequent click hits a primed cache. Only week view — month
  // view jumps 28 days, which would need a different fetch strategy.
  const handleHoverNav = useCallback((dir: -1 | 1) => {
    if (view !== "week") return
    const target = addDays(weekStart, dir * 7)
    prefetchWeek(getMondayOf(target))
  }, [view, weekStart, prefetchWeek])

  const {
    departments: _departments, globalDeptMaps, ALL_DEPTS, deptAbbrMap,
    deptFilter, allDeptsSelected: _allDeptsSelected, toggleDept, setAllDepts, setOnlyDept,
    filteredStaffList,
  } = useDepartmentFilter(weekData, staffList)

  const desktopSwapEnabled = !canEdit && !!viewerStaffId && !!weekData?.enableSwapRequests && weekData?.rota?.status === "published"

  const handleDesktopChipClick = useCallback((assignment: { id?: string; staff_id: string; shift_type?: string }, date: string) => {
    if (desktopSwapEnabled && assignment.staff_id === viewerStaffId && assignment.id && assignment.shift_type && date) {
      modals.openSwap({ id: assignment.id, shiftType: assignment.shift_type, date })
    } else {
      modals.openProfile(assignment.staff_id)
    }
  }, [desktopSwapEnabled, viewerStaffId, modals])

  const {
    draggingId: _draggingId, draggingFrom: _draggingFrom, dragOverDate: _dragOverDate,
    handleChipDragStart: _handleChipDragStart, handleChipDragEnd: _handleChipDragEnd,
    handleColumnDragOver: _handleColumnDragOver, handleColumnDragLeave: _handleColumnDragLeave, handleColumnDrop: _handleColumnDrop,
  } = useCalendarDnd({ weekStart, fetchWeek, setError })

  const {
    undoLen, redoLen, showSaved,
    triggerSaved, cancelLastUndo, pushUndo, handleUndo, handleRedo,
  } = useUndoRedo({ weekStart, locale, weekData, setWeekData, fetchWeekSilent, lastFetchIdRef, gridSetDaysRef })

  function navigate(dir: -1 | 1) {
    modals.setShowStrategyModal(false)
    const days = view === "month" ? 28 : 7
    setCurrentDate((d) => addDays(d, dir * days))
  }

  function goToToday() {
    setCurrentDate(TODAY)
    modals.setShowStrategyModal(false)
  }

  function handleGenerateClick() {
    if (view === "month" && monthSummary) {
      modals.setShowMultiWeekDialog(true)
      return
    }
    modals.setShowStrategyModal(true)
  }

  function handleMonthDayClick(date: string) {
    setCurrentDate(date)
    modals.openSheet(date)
  }

  const rota           = weekData?.rota ?? null
  const isPublished    = rota?.status === "published"
  const isDraft        = rota?.status === "draft"
  const hasWeekAssignments = weekData?.days.some((d) => d.assignments.length > 0) ?? false
  const hasMonthAssignments = monthSummary?.days.some((d) => d.staffCount > 0) ?? false
  const hasAssignments = view === "month" ? hasMonthAssignments : hasWeekAssignments
  const anyMonthWeekPublished = monthSummary?.weekStatuses?.some((ws) => ws.status === "published") ?? false
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null

  const toggleHighlightHover = useCallback(() => setHighlightHover(!highlightHover), [highlightHover, setHighlightHover])

  const { exportPdf, exportExcel } = useCalendarExport({
    weekData, weekStart, locale, calendarLayout, daysAsRows, fetchWeekSilent,
  })

  if (!initialLoaded && !staffLoaded) return <CalendarSkeleton />

  return (
    <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
      <DesktopToolbar
        currentDate={currentDate} weekStart={weekStart} view={view} setView={setView}
        locale={locale} TODAY={TODAY} goToToday={goToToday} navigate={navigate} onHoverNav={handleHoverNav}
        onWeekJump={(date) => { setCurrentDate(date); modals.setShowStrategyModal(false) }}
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
        onShowReasoning={() => modals.setShowReasoningModal(true)}
        onSaveTemplate={() => modals.setSaveTemplateOpen(true)}
        onApplyTemplate={() => modals.setApplyTemplateOpen(true)}
        onShowHistory={() => modals.setHistoryOpen(true)}
        onDelete={handleDelete}
        onExportPdf={exportPdf}
        onExportExcel={exportExcel}
        favoriteView={favoriteView}
        onSaveFavorite={saveDesktop}
        onGoToFavorite={goToDesktop}
        t={t} tc={tc}
      />

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

      <div className="flex-1 min-h-0 flex flex-col">
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
            openProfile={modals.openProfile} onDesktopChipClick={handleDesktopChipClick}
            onOpenSheet={modals.openSheet} onMonthDayClick={handleMonthDayClick}
            pushUndo={canEdit ? pushUndo : undefined}
            cancelLastUndo={canEdit ? cancelLastUndo : undefined}
            triggerSaved={canEdit ? triggerSaved : undefined}
            fetchWeekSilent={fetchWeekSilent} setLiveDays={setLiveDays}
            onGenerateClick={handleGenerateClick}
            showCopyConfirm={showCopyConfirm} setShowCopyConfirm={setShowCopyConfirm}
            prevWeekHasRota={prevWeekHasRota}
            onCopyPreviousWeek={handleCopyPreviousWeek}
            desktopSwapStaffId={desktopSwapEnabled ? viewerStaffId : null}
            gridSetDaysRef={gridSetDaysRef}
            t={t} tc={tc}
          />
        )}

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
          setShowStrategyModal={modals.setShowStrategyModal} isPending={isPending}
          mobileFavoriteView={mobileFavoriteView}
          onSaveMobileFavorite={saveMobile}
          onGoToMobileFavorite={goToMobile}
          t={t} tc={tc}
        />
      </div>

      <AssignmentSheetHost
        open={modals.sheetOpen}
        onOpenChange={modals.setSheetOpen}
        sheetDate={modals.sheetDate}
        sheetDay={modals.sheetDay}
        weekStart={weekStart}
        weekData={weekData}
        staffList={staffList}
        punctionsOverride={punctionsOverride}
        isPublished={!!isPublished}
        canEdit={canEdit}
        onSaved={() => { fetchWeek(weekStart); if (view === "month") fetchMonth(monthStart, weekStart) }}
        onPunctionsChange={handlePunctionsChange}
      />

      {view === "week" && (
        <div className="hidden md:block shrink-0 min-h-[36px]" data-week-notes>
          <WeekNotes weekStart={weekStart} initialData={initialNotes} />
        </div>
      )}

      <BottomTaskbar
        view={view} canEdit={canEdit}
        weekData={weekData} monthSummary={monthSummary}
        loadingWeek={loadingWeek} loadingMonth={loadingMonth}
        filteredStaffList={filteredStaffList}
        currentDate={currentDate} weekStart={weekStart} locale={locale}
        liveDays={liveDays} deptFilter={deptFilter} colorChips={colorChips}
        onPillClick={modals.openProfile}
      />

      <CalendarModalsHost
        modals={modals}
        weekStart={weekStart} currentDate={currentDate} locale={locale}
        weekData={weekData} monthSummary={monthSummary} staffList={staffList}
        aiReasoning={weekData?.aiReasoning ?? aiReasoningRef.current ?? ""}
        reasoningVariant={reasoningSourceRef.current === "hybrid" ? "hybrid" : "claude"}
        desktopSwapEnabled={desktopSwapEnabled}
        onStrategyGenerate={handleStrategyGenerate}
        onSelectMultiWeekScope={(weeks) => { setMultiWeekScope(weeks); modals.setShowStrategyModal(true) }}
        onRefreshWeek={() => fetchWeek(weekStart)}
        onAfterApplyTemplate={() => { fetchWeek(weekStart); if (view === "month") fetchMonth(monthStart, weekStart) }}
      />
    </main>
  )
}
