"use client"

import { ChevronLeft, ChevronRight, Lock, FileText, Sheet, BookmarkPlus, BookmarkCheck, Rows3, ArrowRightLeft, LayoutList, Star, Clock, Trash2, Check, Undo2, Redo2, BrainCircuit, Grid3X3, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { WeekJumpButton } from "./week-jump-button"
import { DepartmentFilterDropdown } from "./department-filter"
import { OverflowMenu } from "./overflow-menu"
import { WarningsPill } from "./warnings"
import type { ViewMode, CalendarLayout, MenuItem } from "../types"
import type { RotaWeekData, RotaMonthSummary } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"

export interface DesktopToolbarProps {
  // Navigation
  currentDate: string
  weekStart: string
  view: ViewMode
  setView: (v: ViewMode) => void
  locale: string
  TODAY: string
  goToToday: () => void
  navigate: (dir: -1 | 1) => void
  onHoverNav?: (dir: -1 | 1) => void
  onWeekJump: (date: string) => void

  // Layout
  calendarLayout: CalendarLayout
  setCalendarLayout: (l: CalendarLayout) => void
  monthViewMode: "shift" | "person"
  setMonthViewMode: (m: "shift" | "person") => void
  rotaDisplayMode?: string

  // View options
  compact: boolean
  setCompact: (fn: (c: boolean) => boolean) => void
  personSimplified: boolean
  togglePersonSimplified: () => void
  daysAsRows: boolean
  toggleDaysAsRows: () => void
  colorChips: boolean
  toggleColorChips: () => void
  highlightHover: boolean
  toggleHighlightHover: () => void

  // Status
  isPending: boolean
  pendingAction: "generating" | "deleting" | null
  hasAssignments: boolean
  isPublished: boolean
  isDraft: boolean
  anyMonthWeekPublished: boolean
  canEdit: boolean
  hasNotifications: boolean

  // Undo/redo
  showSaved: boolean
  undoLen: number
  redoLen: number
  onUndo: () => void
  onRedo: () => void

  // Filters
  deptFilter: Set<string>
  allDepts: string[]
  onToggleDept: (d: string) => void
  onSetAllDepts: () => void
  onSetOnlyDept: (d: string) => void
  deptLabels: Record<string, string>
  deptColors: Record<string, string>
  deptAbbr: Record<string, string>

  // Data
  weekData: RotaWeekData | null
  monthSummary: RotaMonthSummary | null
  filteredStaffList: StaffWithSkills[]
  aiReasoning: string | null

  // Actions
  onGenerateClick: () => void
  onPublish: () => void
  onUnlock: () => void
  onShowReasoning: () => void
  onSaveTemplate: () => void
  onApplyTemplate: () => void
  onShowHistory: () => void
  onDelete: () => void
  onExportPdf: () => void
  onExportExcel: () => void

  // Favorites
  favoriteView: { view: string; calendarLayout: string; daysAsRows: boolean; compact: boolean; colorChips: boolean; highlightEnabled: boolean } | null
  onSaveFavorite: () => void
  onGoToFavorite: (() => void) | undefined

  // i18n
  t: any
  tc: any
}

export function DesktopToolbar(props: DesktopToolbarProps) {
  const {
    currentDate, weekStart, view, setView, locale, TODAY, goToToday, navigate, onHoverNav, onWeekJump,
    calendarLayout, setCalendarLayout, monthViewMode, setMonthViewMode, rotaDisplayMode,
    compact, setCompact, personSimplified, togglePersonSimplified, daysAsRows, toggleDaysAsRows,
    colorChips, toggleColorChips, highlightHover, toggleHighlightHover,
    isPending, pendingAction, hasAssignments, isPublished, isDraft, anyMonthWeekPublished, canEdit, hasNotifications,
    showSaved, undoLen, redoLen, onUndo, onRedo,
    deptFilter, allDepts, onToggleDept, onSetAllDepts, onSetOnlyDept, deptLabels, deptColors, deptAbbr,
    weekData, filteredStaffList, aiReasoning,
    onGenerateClick, onPublish, onUnlock, onShowReasoning, onSaveTemplate, onApplyTemplate, onShowHistory, onDelete,
    onExportPdf, onExportExcel,
    favoriteView, onSaveFavorite, onGoToFavorite,
    t, tc,
  } = props

  const showActions = canEdit

  const overflowItems = buildOverflowItems({
    canEdit, isDraft, isPublished, hasAssignments, hasNotifications, view, isPending,
    anyMonthWeekPublished, locale,
    onPublish, onUnlock, onExportPdf, onExportExcel,
    onSaveTemplate, onApplyTemplate,
    daysAsRows, toggleDaysAsRows, compact, setCompact, personSimplified, togglePersonSimplified,
    colorChips, toggleColorChips, highlightHover, toggleHighlightHover, calendarLayout,
    favoriteView, onSaveFavorite, onGoToFavorite, setView, setCalendarLayout,
    onShowHistory, onDelete,
    t,
  })

  return (
    <div className="hidden lg:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background relative">

      {/* LEFT: Today · ‹ › · date range */}
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="outline" size="sm" onClick={goToToday} disabled={currentDate === TODAY}>
          {tc("today")}
        </Button>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate(-1)}
            onMouseEnter={() => onHoverNav?.(-1)}
            onFocus={() => onHoverNav?.(-1)}
            aria-label={t("previousPeriod")}
          >
            <ChevronLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => navigate(1)}
            onMouseEnter={() => onHoverNav?.(1)}
            onFocus={() => onHoverNav?.(1)}
            aria-label={t("nextPeriod")}
          >
            <ChevronRight />
          </Button>
        </div>
        <WeekJumpButton
          currentDate={currentDate}
          weekStart={weekStart}
          view={view}
          locale={locale}
          onSelect={onWeekJump}
        />
      </div>

      {/* CENTRE */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
        <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
          {(["week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded-md px-3 py-1 text-[13px] transition-colors min-w-[72px] text-center",
                view === v ? "bg-background shadow-sm font-medium" : "text-muted-foreground hover:bg-muted font-medium"
              )}
            >
              {t(`${v}View`)}
            </button>
          ))}
        </div>
        {(view === "week" || view === "month") && (
          <>
            <span className="h-4 border-l border-border" />
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => { setCalendarLayout("shift"); setMonthViewMode("shift") }}
                    className={cn(
                      "rounded-md w-[36px] h-[28px] flex items-center justify-center transition-colors",
                      (view === "week" ? calendarLayout === "shift" : monthViewMode === "shift")
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {rotaDisplayMode === "by_task" ? <Grid3X3 className="size-[14px]" /> : <Rows3 className="size-[14px]" />}
                  </button>
                } />
                <TooltipContent side="bottom">{rotaDisplayMode === "by_task" ? t("byTask") : t("shiftLayout")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => { setCalendarLayout("person"); setMonthViewMode("person") }}
                    className={cn(
                      "rounded-md w-[36px] h-[28px] flex items-center justify-center transition-colors",
                      (view === "week" ? calendarLayout === "person" : monthViewMode === "person")
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <Users className="size-[14px]" />
                  </button>
                } />
                <TooltipContent side="bottom">{t("personLayout")}</TooltipContent>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      {/* RIGHT */}
      <div className="flex items-center gap-2 shrink-0">
        {view === "week" && canEdit && (
          <div className="flex items-center gap-0.5">
            <span className={cn(
              "text-[12px] text-muted-foreground flex items-center gap-1 transition-opacity duration-700 select-none pr-1",
              showSaved ? "opacity-100" : "opacity-0 pointer-events-none"
            )}>
              <Check className="size-3 text-emerald-500" />
              {t("saved")}
            </span>
            <Tooltip>
              <TooltipTrigger render={
                <button onClick={onUndo} disabled={undoLen === 0}
                  className="rounded-md w-[30px] h-[28px] flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Undo2 className="size-[14px]" />
                </button>
              } />
              <TooltipContent side="bottom">Undo (⌘Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger render={
                <button onClick={onRedo} disabled={redoLen === 0}
                  className="rounded-md w-[30px] h-[28px] flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Redo2 className="size-[14px]" />
                </button>
              } />
              <TooltipContent side="bottom">Redo (⌘⇧Z)</TooltipContent>
            </Tooltip>
          </div>
        )}
        {view === "week" && hasAssignments && (
          <div className="hidden lg:block">
            <DepartmentFilterDropdown
              selected={deptFilter} allDepts={allDepts}
              onToggle={onToggleDept} onSetAll={onSetAllDepts} onSetOnly={onSetOnlyDept}
              deptLabels={deptLabels} deptColors={deptColors} deptAbbr={deptAbbr}
            />
          </div>
        )}
        {weekData && hasAssignments && (
          <WarningsPill days={weekData.days} staffList={filteredStaffList} onLeaveByDate={weekData.onLeaveByDate} />
        )}
        {aiReasoning && hasAssignments && view !== "month" && (
          <Button variant="ghost" size="sm" onClick={onShowReasoning} title={t("viewAiReasoning")} className="h-8 gap-1.5 shrink-0">
            <BrainCircuit className="size-3.5" />
            <span className="hidden sm:inline">{t("aiInsights")}</span>
          </Button>
        )}
        {showActions && (view === "month" ? !anyMonthWeekPublished || true : !isPublished) && (
          <Button variant="outline" size="sm" onClick={onGenerateClick} disabled={isPending} className="h-8 shrink-0">
            {isPending ? (pendingAction === "deleting" ? tc("deleting") : tc("generating")) : hasAssignments ? t("regenerateRota") : t("generateRota")}
          </Button>
        )}
        {(showActions || hasAssignments) && (
          <OverflowMenu items={overflowItems} />
        )}
      </div>
    </div>
  )
}

// ── Overflow menu items builder ──────────────────────────────────────────────

function buildOverflowItems(ctx: {
  canEdit: boolean; isDraft: boolean; isPublished: boolean; hasAssignments: boolean
  hasNotifications: boolean; view: ViewMode; isPending: boolean; anyMonthWeekPublished: boolean
  locale: string
  onPublish: () => void; onUnlock: () => void
  onExportPdf: () => void; onExportExcel: () => void
  onSaveTemplate: () => void; onApplyTemplate: () => void
  daysAsRows: boolean; toggleDaysAsRows: () => void
  compact: boolean; setCompact: (fn: (c: boolean) => boolean) => void
  personSimplified: boolean; togglePersonSimplified: () => void
  colorChips: boolean; toggleColorChips: () => void
  highlightHover: boolean; toggleHighlightHover: () => void
  calendarLayout: CalendarLayout
  favoriteView: { view: string; calendarLayout: string; daysAsRows: boolean; compact: boolean; colorChips: boolean; highlightEnabled: boolean } | null
  onSaveFavorite: () => void
  onGoToFavorite: (() => void) | undefined
  setView: (v: ViewMode) => void
  setCalendarLayout: (l: CalendarLayout) => void
  onShowHistory: () => void; onDelete: () => void
  t: any
}): MenuItem[] {
  const {
    canEdit, isDraft, isPublished, hasAssignments, hasNotifications, view, isPending,
    anyMonthWeekPublished,
    onPublish, onUnlock, onExportPdf, onExportExcel,
    onSaveTemplate, onApplyTemplate,
    daysAsRows, toggleDaysAsRows, compact, setCompact, personSimplified, togglePersonSimplified,
    colorChips, toggleColorChips, highlightHover, toggleHighlightHover, calendarLayout,
    favoriteView, onSaveFavorite, onGoToFavorite, setView: _setView, setCalendarLayout: _setCalendarLayout,
    onShowHistory, onDelete,
    t,
  } = ctx

  return [
    // ── Publish / Unlock ──
    ...(canEdit && isDraft && hasAssignments && view === "week" ? [{
      label: hasNotifications ? t("publishRota") : t("publishOnly"),
      icon: <Lock className="size-3.5" />,
      onClick: onPublish,
      disabled: isPending,
    }] : []),
    ...(canEdit && isPublished && view === "week" ? [{
      label: t("unlockRota"),
      icon: <Lock className="size-3.5" />,
      onClick: onUnlock,
      disabled: isPending,
    }] : []),
    // ── Export ──
    ...(hasAssignments && view === "week" ? [{
      label: t("exportPdf"),
      icon: <FileText className="size-3.5" />,
      dividerBefore: true,
      sectionLabel: t("exportSection"),
      onClick: onExportPdf,
    }, {
      label: t("exportExcel"),
      icon: <Sheet className="size-3.5" />,
      onClick: onExportExcel,
    }] : []),
    // ── Templates ──
    ...(view === "week" && canEdit && hasAssignments ? [{
      label: t("saveAsTemplate"),
      icon: <BookmarkPlus className="size-3.5" />,
      onClick: onSaveTemplate,
      dividerBefore: true,
      sectionLabel: t("templatesSection"),
    }, ...(!isPublished ? [{
      label: t("applyTemplate"),
      icon: <BookmarkCheck className="size-3.5" />,
      onClick: onApplyTemplate,
    }] : [])] : view === "week" && canEdit && !isPublished ? [{
      label: t("applyTemplate"),
      icon: <BookmarkCheck className="size-3.5" />,
      onClick: onApplyTemplate,
      dividerBefore: true,
      sectionLabel: t("templatesSection"),
    }] : []),
    // ── View options ──
    ...((view === "week" || (view === "month" && calendarLayout === "person")) ? [
      ...(view === "week" ? [{
        label: t("daysAsRows"),
        icon: <ArrowRightLeft className="size-3.5" />,
        onClick: toggleDaysAsRows,
        active: daysAsRows,
        dividerBefore: true,
        sectionLabel: t("viewSection"),
      }] : []),
      ...(!(view === "month" && calendarLayout === "person") ? [{
        label: t("compactView"),
        icon: <Rows3 className="size-3.5" />,
        onClick: () => setCompact((c) => !c),
        active: compact,
      }, {
        label: t("simplifiedView"),
        icon: <LayoutList className="size-3.5" />,
        onClick: togglePersonSimplified,
        active: personSimplified,
      }] : []),
      {
        label: t("staffColors"),
        icon: <span className="size-3.5 rounded-full bg-gradient-to-br from-amber-400 via-blue-400 to-emerald-400 shrink-0" />,
        onClick: toggleColorChips,
        active: colorChips,
        ...(view === "month" && calendarLayout === "person" ? { dividerBefore: true, sectionLabel: t("viewSection") } : {}),
      }, {
        label: t("highlightPerson"),
        icon: <span className="size-3.5 rounded-sm shrink-0" style={{ backgroundColor: "#FDE047" }} />,
        onClick: toggleHighlightHover,
        active: highlightHover,
      },
    ] : []),
    // ── Favorite view ──
    ...(() => {
      const isFav = favoriteView
        && favoriteView.view === view
        && favoriteView.calendarLayout === calendarLayout
        && favoriteView.daysAsRows === daysAsRows
        && favoriteView.compact === compact
        && favoriteView.colorChips === colorChips
        && favoriteView.highlightEnabled === highlightHover
      const saveFavItem = {
        label: t("saveFavoriteView"),
        icon: <Star className="size-3.5" />,
        onClick: onSaveFavorite,
      }
      if (isFav) return []
      if (onGoToFavorite) return [{
        label: t("goToFavoriteView"),
        icon: <Star className="size-3.5 text-amber-400 fill-amber-400" />,
        dividerBefore: true,
        onClick: onGoToFavorite,
      }, saveFavItem]
      return [{ ...saveFavItem, dividerBefore: true }]
    })(),
    // ── History ──
    ...(view === "week" && hasAssignments ? [{
      label: t("viewHistory"),
      icon: <Clock className="size-3.5" />,
      onClick: onShowHistory,
      dividerBefore: true,
    }] : []),
    // ── Destructive ──
    ...(canEdit && hasAssignments && !(view === "month" ? anyMonthWeekPublished : isPublished) ? [{
      label: view === "month" ? t("delete4Weeks") : t("deleteRota"),
      icon: <Trash2 className="size-3.5" />,
      onClick: onDelete,
      dividerBefore: true,
      destructive: true,
    }] : []),
  ]
}
