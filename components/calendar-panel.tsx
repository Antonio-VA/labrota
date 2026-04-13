"use client"

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, Fragment } from "react"
import { useUndoRedo } from "@/hooks/use-undo-redo"
import { useDepartmentFilter } from "@/hooks/use-department-filter"
import { usePersistedState, usePersistedToggle } from "@/hooks/use-persisted-state"
import { useCalendarDnd } from "@/hooks/use-calendar-dnd"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { useCanEdit, useUserRole } from "@/lib/role-context"
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Lock, FileDown, FileText, Sheet, CalendarX, MoreHorizontal, X, UserCog, CalendarPlus, Mail, Rows3, BookmarkPlus, BookmarkCheck, Sparkles, Grid3X3, BookmarkX, Bookmark, Briefcase, Check, CheckCircle2, Hourglass, Filter, LayoutList, Plane, Trash2, Pencil, Users, Clock, Cross, User, GraduationCap, Baby, Share, Copy, Star, ArrowRightLeft, ChevronUp, ChevronDown, Image, BrainCircuit, Minus, Plus, Undo2, Redo2 } from "lucide-react"
import { toast } from "sonner"
import { DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { getUserPreferences, saveUserPreferences } from "@/app/(clinic)/account-actions"
import {
  getRotaWeek,
  getRotaMonthSummary,
  generateRota,
  generateRotaWithAI,
  publishRota,
  unlockRota,
  getActiveStaff,
  moveAssignment,
  setPunctionsOverride,
  moveAssignmentShift,
  removeAssignment,
  deleteAssignment,
  regenerateDay,
  setFunctionLabel,
  setTecnica,
  upsertAssignment,
  getStaffProfile,
  type RotaWeekData,
  type RotaDay,
  type RotaDayWarning,
  type RotaMonthSummary,
  type MonthWeekStatus,
  type ShiftTimes,
  type StaffProfileData,
  saveAsTemplate,
  getTemplates,
  applyTemplate,
  clearWeek,
  copyPreviousWeek,
  generateRotaHybrid,
  generateTaskHybrid,
  getHybridUsage,
} from "@/app/(clinic)/rota/actions"
import type { RotaTemplate } from "@/lib/types/database"
import { formatDate, formatDateRange, formatDateWithYear } from "@/lib/format-date"
import { formatTime } from "@/lib/format-time"
import { AssignmentSheet } from "@/components/assignment-sheet"
import { quickCreateLeave } from "@/app/(clinic)/leaves/actions"
import { bulkAddSkill, bulkRemoveSkill, bulkUpdateStaffField } from "@/app/(clinic)/staff/actions"
import { WeeklyStrip } from "@/components/weekly-strip"
import { MobileEditToolbar } from "@/components/mobile-edit-toolbar"
import { MobileAddStaffSheet } from "@/components/mobile-add-staff-sheet"
import { MobileTaskView } from "@/components/mobile-task-view"
import { MobileTaskDayView } from "@/components/mobile-task-day-view"
import { TapPopover } from "@/components/tap-popover"
import { MobilePersonView } from "@/components/mobile-person-view"
import { TransposedShiftGrid } from "@/components/transposed-shift-grid"
import { TransposedTaskGrid } from "@/components/transposed-task-grid"
import { TaskPersonGrid } from "@/components/task-person-grid"
import dynamic from "next/dynamic"
const RotaHistoryPanel = dynamic(() => import("@/components/rota-history-panel").then((m) => m.RotaHistoryPanel), { ssr: false })
const SwapRequestDialog = dynamic(() => import("@/components/swap-request-dialog").then((m) => ({ default: m.SwapRequestDialog })), { ssr: false })
import { MySchedule } from "@/components/my-schedule"
import { useViewerStaffId } from "@/lib/role-context"
import { TaskGrid } from "@/components/task-grid"
import { StaffHoverProvider, useStaffHover } from "@/components/staff-hover-context"
import { WeekNotes } from "@/components/week-notes"
import type { StaffWithSkills, ShiftType, ShiftTypeDefinition, Tecnica } from "@/lib/types/database"
import type { ViewMode, CalendarLayout, Assignment, DeptMaps, MenuItem } from "./calendar-panel/types"
import { DEFAULT_DEPT_MAPS, ROLE_ORDER, ROLE_LABEL, ROLE_BORDER, ROLE_DOT, SHIFT_ORDER, TECNICA_PILL, COVERAGE_SKILLS, LEGACY_SKILL_NAMES, TODAY, DAY_ES_2, WARNING_CATEGORY_KEY, WARNING_CATEGORY_ORDER, DOW_HEADERS_EN, DOW_HEADERS_ES } from "./calendar-panel/constants"
import { buildDeptMaps, sortAssignments, addDays, addMonths, getMonthStart, formatToolbarLabel, rotateArray, makeSkillLabel, parseHybridInsights, buildStrategyCards, type GenerationStrategy, type StrategyCardMeta } from "./calendar-panel/utils"

import { ShiftBudgetBar, MonthBudgetBar, LEAVE_ICON_MAP } from "./calendar-panel/budget-bars"

import { WeekJumpButton } from "./calendar-panel/week-jump-button"

import { StaffChip, ShiftBadge, type ShiftBadgeProps } from "./calendar-panel/shift-badge"

import { AssignmentPopover, DEPT_FOR_ROLE } from "./calendar-panel/assignment-popover"

import { DayStatsInput } from "./calendar-panel/day-stats-input"
import { OverflowMenu } from "./calendar-panel/overflow-menu"
import { DepartmentFilterDropdown } from "./calendar-panel/department-filter"
import { MobileOverflow } from "./calendar-panel/mobile-overflow"
import { InlineLeaveForm } from "./calendar-panel/inline-leave-form"
import { PersonShiftSelector } from "./calendar-panel/person-shift-selector"
import { ProfileSkillsSection } from "./calendar-panel/profile-skills-section"
import { PersonShiftPill } from "./calendar-panel/person-shift-pill"
import { DraggableShiftBadge, DraggableOffStaff, DroppableCell } from "./calendar-panel/dnd-wrappers"
import { StaffProfilePanel } from "./calendar-panel/staff-profile-panel"
import { PersonGrid } from "./calendar-panel/person-grid"
import { TransposedPersonGrid } from "./calendar-panel/transposed-person-grid"
import { ShiftGrid } from "./calendar-panel/shift-grid"
import { MonthGrid } from "./calendar-panel/month-grid"
import { DayView } from "./calendar-panel/day-view"


import { DayWarningPopover, WarningsPill } from "./calendar-panel/warnings"

// ── Person view (Vista por persona) ───────────────────────────────────────────


// ── Transposed Person Grid (días como filas) ─────────────────────────────────


// ── Shift grid (Vista por turno) ──────────────────────────────────────────────


// ── Month view ────────────────────────────────────────────────────────────────


// ── Day view ──────────────────────────────────────────────────────────────────


// ── Override dialog ───────────────────────────────────────────────────────────

import { GenerationStrategyModal, AIReasoningModal, SaveTemplateModal, ApplyTemplateModal, MultiWeekScopeDialog } from "./calendar-panel/generation-modals"
import { CalendarSkeleton } from "./calendar-panel/loading-skeleton"
import { DesktopToolbar } from "./calendar-panel/desktop-toolbar"
import { WeekContent } from "./calendar-panel/week-content"
import { MobileDaySection } from "./calendar-panel/mobile-day-section"

// ── Main panel ────────────────────────────────────────────────────────────────

export function CalendarPanel(props: { refreshKey?: number; chatOpen?: boolean; initialData?: RotaWeekData; initialStaff?: StaffWithSkills[]; hasNotifications?: boolean; initialNotes?: import("@/app/(clinic)/notes-actions").WeekNoteData }) {
  return (
    <StaffHoverProvider>
      <CalendarPanelInner {...props} />
    </StaffHoverProvider>
  )
}

function CalendarPanelInner({ refreshKey = 0, chatOpen = false, initialData, initialStaff, hasNotifications = false, initialNotes }: { refreshKey?: number; chatOpen?: boolean; initialData?: RotaWeekData; initialStaff?: StaffWithSkills[]; hasNotifications?: boolean; initialNotes?: import("@/app/(clinic)/notes-actions").WeekNoteData }) {
  const t      = useTranslations("schedule")
  const tc     = useTranslations("common")
  const ts     = useTranslations("skills")
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
  const [personSimplified, togglePersonSimplified, setPersonSimplified] = usePersistedToggle("labrota_person_simplified", true)
  const [daysAsRows, toggleDaysAsRows, setDaysAsRows] = usePersistedToggle("labrota_days_as_rows", false)
  const [colorChips, toggleColorChips, setColorChips] = usePersistedToggle("labrota_color_chips", true)
  const { enabled: highlightHover, setEnabled: setHighlightHover } = useStaffHover()

  // Favorite views (desktop + mobile) — synced to DB, cached in localStorage
  type FavoriteView = { view: string; calendarLayout: string; daysAsRows: boolean; compact: boolean; colorChips: boolean; highlightEnabled: boolean }
  type MobileFavoriteView = { viewMode: string; compact: boolean; deptColor: boolean }
  const [favoriteView, setFavoriteView] = useState<FavoriteView | null>(() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(localStorage.getItem("labrota_favorite_view") ?? "null") } catch { return null }
  })
  const [mobileFavoriteView, setMobileFavoriteView] = useState<MobileFavoriteView | null>(() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(localStorage.getItem("labrota_mobile_favorite_view") ?? "null") } catch { return null }
  })
  const [currentDate, setCurrentDateState] = useState(() => {
    // When SSR provides initialData, start on that week to avoid a mismatch
    // that would discard the pre-fetched data and trigger a redundant client fetch
    if (initialData?.weekStart) {
      const firstDay = initialData.weekStart
      return firstDay
    }
    if (typeof window === "undefined") return TODAY
    return sessionStorage.getItem("labrota_current_date") || TODAY
  })
  const setCurrentDate: typeof setCurrentDateState = (v) => {
    setCurrentDateState((prev) => {
      const next = typeof v === "function" ? v(prev) : v
      sessionStorage.setItem("labrota_current_date", next)
      return next
    })
  }
  const [weekData, setWeekData]         = useState<RotaWeekData | null>(null)

  const [monthSummary, setMonthSummary] = useState<RotaMonthSummary | null>(null)
  const [loadingWeek, setLoadingWeek]   = useState(!initialData)
  const [activeStrategy, setActiveStrategy] = useState<GenerationStrategy | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(!!initialData)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [showReasoningModal, setShowReasoningModal] = useState(false)
  const aiReasoningRef = useRef<string | null>(null) // preserve reasoning across fetches
  const reasoningSourceRef = useRef<"claude" | "hybrid" | null>(null)
  const [multiWeekScope, setMultiWeekScope] = useState<string[] | null>(null) // week starts to generate
  const [showMultiWeekDialog, setShowMultiWeekDialog] = useState(false)
  const [showCopyConfirm, setShowCopyConfirm] = useState(false)
  const [prevWeekHasRota, setPrevWeekHasRota] = useState(false)
  const [isPending, startTransition]    = useTransition()
  const [pendingAction, setPendingAction] = useState<"generating" | "deleting" | null>(null)

  // Staff for assignment sheet
  const [staffList, setStaffList] = useState<StaffWithSkills[]>([])
  const [staffLoaded, setStaffLoaded] = useState(false)

  // Day edit sheet state
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sheetDate, setSheetDate] = useState<string | null>(null)

  // Staff profile panel state
  const [profileOpen, setProfileOpen]       = useState(false)
  const [profileStaffId, setProfileStaffId] = useState<string | null>(null)
  const [saveTemplateOpen, setSaveTemplateOpen]   = useState(false)
  const [liveDays, setLiveDays] = useState<RotaDay[] | null>(null)

  // Share capture ref
  const mobileContentRef = useRef<HTMLDivElement>(null)

  // Mobile edit mode state
  const [mobileEditMode, setMobileEditMode] = useState(false)
  const [preEditSnapshot, setPreEditSnapshot] = useState<RotaWeekData | null>(null)
  const [dayWarningsOpen, setDayWarningsOpen] = useState(false)
  const [mobileCompact, toggleMobileCompact, setMobileCompact] = usePersistedToggle("labrota_mobile_compact", true)
  const [mobileDeptColor, toggleMobileDeptColor, setMobileDeptColor] = usePersistedToggle("labrota_mobile_dept_color", true)
  const [mobileViewMode, setMobileViewMode] = useState<"shift" | "person">("shift")
  const [mobileAddSheet, setMobileAddSheet] = useState<{ open: boolean; role: string }>({ open: false, role: "" })
  const [historyOpen, setHistoryOpen] = useState(false)
  const [monthViewMode, setMonthViewMode] = usePersistedState<"shift" | "person">("labrota_month_view", "shift")

  // Department filter (extracted to hook)
  const {
    departments, globalDeptMaps, ALL_DEPTS, deptAbbrMap,
    deptFilter, allDeptsSelected, toggleDept, setAllDepts, setOnlyDept,
    filteredStaffList,
  } = useDepartmentFilter(weekData, staffList)
  const [applyTemplateOpen, setApplyTemplateOpen] = useState(false)

  // Swap state for desktop viewers
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<{ id: string; shiftType: string; date: string } | null>(null)
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

  // Local punctions override
  const [punctionsOverride, setPunctionsOverrideLocal] = useState<Record<string, number>>(initialData?.rota?.punctions_override ?? {})

  // Handle biopsy override: back-calculate punction adjustments for D-5 and D-6
  // Formula: since d5Pct + d6Pct = 1, ΔP = ΔBiopsies / conversionRate
  function handleBiopsyChange(date: string, biopsyNew: number) {
    const cr = weekData?.biopsyConversionRate ?? monthSummary?.biopsyConversionRate ?? 0.5
    const d5Pct = weekData?.biopsyDay5Pct ?? monthSummary?.biopsyDay5Pct ?? 0.5
    const d6Pct = weekData?.biopsyDay6Pct ?? monthSummary?.biopsyDay6Pct ?? 0.5
    const pd = weekData?.punctionsDefault ?? {}

    const d = new Date(date + "T12:00:00")
    const d5 = new Date(d); d5.setDate(d5.getDate() - 5); const d5str = d5.toISOString().split("T")[0]
    const d6 = new Date(d); d6.setDate(d6.getDate() - 6); const d6str = d6.toISOString().split("T")[0]

    const P5 = punctionsOverride[d5str] ?? pd[d5str] ?? monthSummary?.days.find((dd) => dd.date === d5str)?.punctions ?? 0
    const P6 = punctionsOverride[d6str] ?? pd[d6str] ?? monthSummary?.days.find((dd) => dd.date === d6str)?.punctions ?? 0

    const bForecast = Math.round(P5 * cr * d5Pct + P6 * cr * d6Pct)
    const delta = biopsyNew - bForecast
    if (Math.abs(delta) < 0.5 || cr === 0) return

    const pDelta = delta / cr  // distribute equally since d5Pct + d6Pct = 1
    const P5new = Math.max(0, Math.round(P5 + pDelta))
    const P6new = Math.max(0, Math.round(P6 + pDelta))

    setPunctionsOverrideLocal((prev) => ({ ...prev, [d5str]: P5new, [d6str]: P6new }))
  }

  // Derived
  const weekStart  = getMondayOfWeek(new Date(currentDate + "T12:00:00"))
  const monthStart = getMonthStart(currentDate)

  // Fetch week data
  const fetchVersionRef = useRef(0)
  const initialDataUsed = useRef(false)
  const weekCache = useRef<Map<string, RotaWeekData>>(new Map())
  // Stable ref so fetchWeek doesn't depend on initialData prop identity
  // (avoids double-fetch when streaming causes initialData to change reference)
  const initialDataRef = useRef<RotaWeekData | undefined>(initialData)
  useEffect(() => { initialDataRef.current = initialData }, [initialData])

  function weekOffset(ws: string, days: number): string {
    const dt = new Date(ws + "T12:00:00"); dt.setDate(dt.getDate() + days); return dt.toISOString().split("T")[0]
  }

  function prefetchAdjacent(ws: string) {
    // Defer prefetch to idle time so it doesn't compete with the main render
    const run = () => {
      const prev = weekOffset(ws, -7)
      const next = weekOffset(ws, 7)
      if (!weekCache.current.has(prev)) {
        getRotaWeek(prev).then((d) => { weekCache.current.set(prev, d) }).catch(() => {})
      }
      if (!weekCache.current.has(next)) {
        getRotaWeek(next).then((d) => { weekCache.current.set(next, d) }).catch(() => {})
      }
    }
    if (typeof requestIdleCallback === "function") requestIdleCallback(run)
    else setTimeout(run, 200)
  }

  const fetchWeek = useCallback((ws: string) => {
    // On first call, if the server pre-fetched this exact week, use it directly
    // (avoids a network round-trip on initial load for new sessions viewing today's week)
    const initialData = initialDataRef.current
    if (!initialDataUsed.current && initialData?.weekStart === ws) {
      initialDataUsed.current = true
      weekCache.current.set(ws, initialData)
      setInitialLoaded(true)
      setWeekData(initialData)
      setPunctionsOverrideLocal(initialData.rota?.punctions_override ?? {})
      setLoadingWeek(false)
      prefetchAdjacent(ws)
      return
    }

    // Cache hit — show instantly, then silently refresh in background
    const cached = weekCache.current.get(ws)
    if (cached) {
      setInitialLoaded(true)
      setWeekData(cached)
      setPunctionsOverrideLocal(cached.rota?.punctions_override ?? {})
      setLoadingWeek(false)
      setLiveDays(null)
      setError(null)
      aiReasoningRef.current = null
      reasoningSourceRef.current = null
      setActiveStrategy(null)
      getRotaWeek(ws).then((d) => {
        weekCache.current.set(ws, d)
        setWeekData(d)
        setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
        prefetchAdjacent(ws)
      }).catch(() => {})
      return
    }

    const version = ++fetchVersionRef.current
    aiReasoningRef.current = null
    reasoningSourceRef.current = null
    setActiveStrategy(null)
    setLoadingWeek(true)
    setLiveDays(null)
    setError(null)
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Request timed out. Please refresh.")), 15000))
    Promise.race([getRotaWeek(ws), timeout]).then((d) => {
      if (fetchVersionRef.current !== version) return
      weekCache.current.set(ws, d)
      setInitialLoaded(true)
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
      setLoadingWeek(false)
      prefetchAdjacent(ws)
    }).catch((e: unknown) => {
      if (fetchVersionRef.current !== version) return
      setInitialLoaded(true)
      setWeekData(null)
      setError(e instanceof Error ? e.message : "Failed to load schedule data.")
      setLoadingWeek(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — reads initialData via ref to stay stable

  // Silent refresh — used after drag-drop so the grid doesn't flash skeleton
  // lastFetchId lets us discard results from fetches that were superseded (e.g. by Undo)
  const lastFetchId = useRef(0)
  const fetchWeekSilent = useCallback((ws: string) => {
    const id = ++lastFetchId.current
    getRotaWeek(ws).then((d) => {
      if (id !== lastFetchId.current) return // stale — a newer fetch is in flight
      weekCache.current.set(ws, d)
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
    }).catch(() => {/* ignore — grid stays as-is */})
  }, [])

  const handleRefresh = useCallback(() => {
    fetchWeekSilent(weekStart)
  }, [fetchWeekSilent, weekStart])

  // DnD (extracted to hook)
  const {
    draggingId, draggingFrom, dragOverDate,
    handleChipDragStart, handleChipDragEnd,
    handleColumnDragOver, handleColumnDragLeave, handleColumnDrop,
  } = useCalendarDnd({ weekStart, fetchWeek, setError })

  // ── Undo/Redo (extracted to hook) ───────────────────────────────────────────
  // gridSetDaysRef lets undo/redo update the active grid's localDays directly
  // (same path as drag-and-drop), bypassing the full CalendarPanelInner re-render
  const gridSetDaysRef = useRef<((days: import("@/app/(clinic)/rota/actions").RotaDay[]) => void) | null>(null)
  const {
    undoLen, redoLen, showSaved,
    triggerSaved, cancelLastUndo, pushUndo, handleUndo, handleRedo,
  } = useUndoRedo({ weekStart, locale, weekData, setWeekData, fetchWeekSilent, lastFetchId, gridSetDaysRef })

  // Fetch 4-week rolling summary
  const fetchMonth = useCallback((ms: string, ws?: string) => {
    setMonthSummary(null)
    setLoadingMonth(true)
    getRotaMonthSummary(ms, ws).then((d) => {
      setMonthSummary(d)
      setLoadingMonth(false)
    })
  }, [])

  // Skip initial fetch if server-prefetched data was provided
  const skipInitialFetch = useRef(!!initialData)
  useEffect(() => {
    if (skipInitialFetch.current) { skipInitialFetch.current = false; return }
    fetchWeek(weekStart)
  }, [weekStart, fetchWeek])

  // Apply favorite view on first mount — only if no session-stored view exists
  const favAppliedRef = useRef(false)
  useEffect(() => {
    if (favAppliedRef.current || !favoriteView) return
    favAppliedRef.current = true
    // Only apply the favorite view mode if there's no session-stored value (i.e. new tab, not a refresh)
    const sessionView = typeof window !== "undefined" ? sessionStorage.getItem("labrota_view") : null
    if (!sessionView) setView(favoriteView.view as ViewMode)
    setCalendarLayout(favoriteView.calendarLayout as CalendarLayout)
    setDaysAsRows(favoriteView.daysAsRows)
    setCompact(favoriteView.compact)
    setColorChips(favoriteView.colorChips)
    setHighlightHover(favoriteView.highlightEnabled)
  }, [favoriteView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Apply mobile favorite view on first mount
  const mobileFavAppliedRef = useRef(false)
  useEffect(() => {
    if (mobileFavAppliedRef.current || !mobileFavoriteView) return
    mobileFavAppliedRef.current = true
    setMobileViewMode(mobileFavoriteView.viewMode as "shift" | "person")
    setMobileCompact(mobileFavoriteView.compact)
    setMobileDeptColor(mobileFavoriteView.deptColor)
  }, [mobileFavoriteView]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync favorite views from DB when localStorage is empty (new browser)
  useEffect(() => {
    const hasDesktop = localStorage.getItem("labrota_favorite_view")
    const hasMobile = localStorage.getItem("labrota_mobile_favorite_view")
    if (hasDesktop && hasMobile) return
    getUserPreferences().then((prefs) => {
      if (!hasDesktop && prefs.favoriteView) {
        localStorage.setItem("labrota_favorite_view", JSON.stringify(prefs.favoriteView))
        setFavoriteView(prefs.favoriteView as FavoriteView)
      }
      if (!hasMobile && prefs.mobileFavoriteView) {
        localStorage.setItem("labrota_mobile_favorite_view", JSON.stringify(prefs.mobileFavoriteView))
        setMobileFavoriteView(prefs.mobileFavoriteView as MobileFavoriteView)
      }
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Check if previous week has a rota (for "copy previous week" button)
  // Only fetch for editors in week view — button is hidden otherwise
  useEffect(() => {
    if (!canEdit || view !== "week") return
    let cancelled = false
    const prev = new Date(weekStart + "T12:00:00")
    prev.setDate(prev.getDate() - 7)
    const prevWs = prev.toISOString().split("T")[0]
    getRotaWeek(prevWs).then((d) => {
      if (!cancelled) setPrevWeekHasRota(d.days.some((day) => day.assignments.length > 0))
    }).catch(() => { if (!cancelled) setPrevWeekHasRota(false) })
    return () => { cancelled = true }
  }, [weekStart, canEdit, view])
  useEffect(() => {
    if (view === "month") fetchMonth(monthStart, weekStart)
  }, [monthStart, weekStart, view, fetchMonth])

  useEffect(() => {
    if (refreshKey === 0) return
    fetchWeek(weekStart)
    if (view === "month") fetchMonth(monthStart, weekStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // Use activeStaff from weekData (returned by getRotaWeek) — avoids duplicate fetch
  const initialStaffUsed = useRef(false)
  useEffect(() => {
    if (!initialStaffUsed.current && initialStaff && initialStaff.length > 0) {
      initialStaffUsed.current = true
      setStaffList(initialStaff)
      setStaffLoaded(true)
      return
    }
    // Staff will be set from weekData.activeStaff when fetchWeek resolves — no separate call needed
    if (!staffLoaded && !weekData?.activeStaff) {
      // Fallback: fetch separately only if weekData doesn't include staff (e.g., older cached data)
      const staffTimeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Staff load timed out")), 15000))
      Promise.race([getActiveStaff(), staffTimeout]).then((s) => { setStaffList(s); setStaffLoaded(true) }).catch(() => { setStaffLoaded(true) })
    }
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // When weekData arrives with activeStaff, use it (deduplicates the staff fetch)
  // Compare by staff IDs to avoid cascading re-renders on undo (same staff, new reference)
  const prevStaffIdsRef = useRef("")
  useEffect(() => {
    if (!weekData?.activeStaff || weekData.activeStaff.length === 0) return
    const ids = weekData.activeStaff.map((s) => s.id).sort().join(",")
    if (ids === prevStaffIdsRef.current) return
    prevStaffIdsRef.current = ids
    setStaffList(weekData.activeStaff)
    setStaffLoaded(true)
  }, [weekData?.activeStaff])

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
      const newData = await getRotaWeek(ws)
      setWeekData(newData)
      setPunctionsOverrideLocal(newData.rota?.punctions_override ?? {})
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
  const hasSkillGaps   = hasAssignments && (weekData?.days.some((d) => d.skillGaps.length > 0) ?? false)
  // Show task assignment UI only in by_task mode, or in by_shift when the feature flag is on
  const showTaskAssignment = weekData?.rotaDisplayMode === "by_task" || (weekData?.enableTaskInShift ?? false)
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null
  const showActions    = canEdit

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
        locale={locale} TODAY={TODAY} goToToday={goToToday} navigate={navigate}
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
          const d5 = new Date(sheetDate + "T12:00:00"); d5.setDate(d5.getDate() - 5)
          const d6 = new Date(sheetDate + "T12:00:00"); d6.setDate(d6.getDate() - 6)
          const cr = weekData.biopsyConversionRate ?? 0.5
          return Math.round(getPunc(d5.toISOString().split("T")[0]) * cr * (weekData.biopsyDay5Pct ?? 0.5) + getPunc(d6.toISOString().split("T")[0]) * cr * (weekData.biopsyDay6Pct ?? 0.5))
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
