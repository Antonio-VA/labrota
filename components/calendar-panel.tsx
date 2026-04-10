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
  if (!initialLoaded && !staffLoaded) return (
    <main className="flex flex-1 flex-col overflow-hidden">
      <div className="hidden lg:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background">
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-16 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-4 w-40 rounded" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-7 w-20 rounded" />
          <Skeleton className="h-7 w-20 rounded" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </div>
      <div className="flex-1 px-4 py-2 overflow-hidden">
        <div className="grid grid-cols-7 gap-px mb-1">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center py-2">
              <Skeleton className="h-3 w-8 rounded mb-1" />
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, row) => (
          <div key={row} className="grid grid-cols-7 gap-px mb-2">
            {Array.from({ length: 7 }).map((_, col) => (
              <div key={col} className="flex flex-col gap-1 p-1.5">
                {Array.from({ length: 3 }).map((_, j) => (
                  <Skeleton key={j} className="h-5 w-full rounded" />
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </main>
  )

  return (
    <main className="flex flex-1 flex-col min-h-0 overflow-hidden">
      {/* Desktop toolbar — LEFT · CENTRE (absolute) · RIGHT */}
      <div className="hidden lg:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background relative">

        {/* LEFT: Today · ‹ › · date range */}
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={goToToday} disabled={currentDate === TODAY}>
            {tc("today")}
          </Button>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label={t("previousPeriod")}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label={t("nextPeriod")}>
              <ChevronRight />
            </Button>
          </div>
          <WeekJumpButton
            currentDate={currentDate}
            weekStart={weekStart}
            view={view}
            locale={locale}
            onSelect={(date) => { setCurrentDate(date); setShowStrategyModal(false) }}
          />
        </div>

        {/* CENTRE — absolutely positioned so it stays centred regardless of left/right width */}
        <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(["week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-[13px] transition-colors min-w-[72px] text-center",
                  view === v
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:bg-muted font-medium"
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
                      {weekData?.rotaDisplayMode === "by_task"
                        ? <Grid3X3 className="size-[14px]" />
                        : <Rows3 className="size-[14px]" />
                      }
                    </button>
                  } />
                  <TooltipContent side="bottom">{weekData?.rotaDisplayMode === "by_task" ? t("byTask") : t("shiftLayout")}</TooltipContent>
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

        {/* RIGHT: saved · undo/redo · dept filter · warnings · generate · overflow ··· */}
        <div className="flex items-center gap-2 shrink-0">
          {view === "week" && canEdit && (
            <div className="flex items-center gap-0.5">
              <span className={cn(
                "text-[12px] text-muted-foreground flex items-center gap-1 transition-opacity duration-700 select-none pr-1",
                showSaved ? "opacity-100" : "opacity-0 pointer-events-none"
              )}>
                <Check className="size-3 text-emerald-500" />
                {locale === "es" ? "Guardado" : "Saved"}
              </span>
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={handleUndo}
                    disabled={undoLen === 0}
                    className="rounded-md w-[30px] h-[28px] flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Undo2 className="size-[14px]" />
                  </button>
                } />
                <TooltipContent side="bottom">Undo (⌘Z)</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={handleRedo}
                    disabled={redoLen === 0}
                    className="rounded-md w-[30px] h-[28px] flex items-center justify-center text-muted-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
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
                selected={deptFilter}
                allDepts={ALL_DEPTS}
                onToggle={toggleDept}
                onSetAll={setAllDepts}
                onSetOnly={setOnlyDept}
                deptLabels={globalDeptMaps.label}
                deptColors={globalDeptMaps.border}
                deptAbbr={deptAbbrMap}
              />
            </div>
          )}
          {weekData && hasAssignments && (
            <WarningsPill days={weekData.days} staffList={filteredStaffList} onLeaveByDate={weekData.onLeaveByDate} />
          )}
          {(weekData?.aiReasoning || aiReasoningRef.current) && hasAssignments && view !== "month" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReasoningModal(true)}
              title={t("viewAiReasoning")}
              className="h-8 gap-1.5 shrink-0"
            >
              <BrainCircuit className="size-3.5" />
              <span className="hidden sm:inline">{t("aiInsights")}</span>
            </Button>
          )}
          {showActions && (view === "month" ? !anyMonthWeekPublished || monthSummary?.weekStatuses?.some((ws) => ws.status !== "published") : !isPublished) && (
            <Button variant="outline" size="sm" onClick={handleGenerateClick} disabled={isPending} className="h-8 shrink-0">
              {isPending ? (pendingAction === "deleting" ? tc("deleting") : tc("generating")) : hasAssignments ? t("regenerateRota") : t("generateRota")}
            </Button>
          )}
          {(showActions || hasAssignments) && (
            <OverflowMenu items={[
              // ── Group 1: Actions (publish) ──
              ...(canEdit && isDraft && hasAssignments && view === "week" ? [{
                label: hasNotifications ? t("publishRota") : t("publishOnly"),
                icon: <Lock className="size-3.5" />,
                onClick: handlePublish,
                disabled: isPending,
              }] : []),
              ...(canEdit && isPublished && view === "week" ? [{
                label: t("unlockRota"),
                icon: <Lock className="size-3.5" />,
                onClick: handleUnlock,
                disabled: isPending,
              }] : []),
              // ── Export ──
              ...(hasAssignments && view === "week" ? [{
                label: t("exportPdf"),
                icon: <FileText className="size-3.5" />,
                dividerBefore: true,
                sectionLabel: locale === "es" ? "Exportar" : "Export",
                onClick: () => {
                  if (!weekData) return
                  import("@/lib/export-pdf").then(({ exportPdfByShift, exportPdfByPerson, exportPdfByTask }) => {
                    const on = document.querySelector("[data-org-name]")?.textContent ?? "LabRota"
                    const notesEl = document.querySelector("[data-week-notes]")
                    const noteTexts = notesEl
                      ? Array.from(notesEl.querySelectorAll("[data-note-text]")).map((el) => el.textContent ?? "").filter(Boolean)
                      : []
                    const n = noteTexts.length > 0 ? noteTexts : undefined
                    if (weekData.rotaDisplayMode === "by_task") {
                      exportPdfByTask(weekData, weekData.tecnicas ?? [], on, locale, n, daysAsRows)
                    } else if (calendarLayout === "person") {
                      exportPdfByPerson(weekData, on, locale, n, daysAsRows)
                    } else {
                      exportPdfByShift(weekData, on, locale, n, daysAsRows)
                    }
                  })
                },
              }, {
                label: t("exportExcel"),
                icon: <Sheet className="size-3.5" />,
                onClick: () => {
                  if (!weekData) return
                  import("@/lib/export-excel").then(({ exportWeekByShift, exportWeekByPerson, exportWeekByTask }) => {
                    if (weekData.rotaDisplayMode === "by_task") {
                      exportWeekByTask(weekData, weekData.tecnicas ?? [], locale, daysAsRows)
                    } else if (calendarLayout === "person") {
                      exportWeekByPerson(weekData, locale, daysAsRows)
                    } else {
                      exportWeekByShift(weekData, locale, daysAsRows)
                    }
                  })
                },
              }] : []),
              // ── Templates ──
              ...(view === "week" && canEdit && hasAssignments ? [{
                label: t("saveAsTemplate"),
                icon: <BookmarkPlus className="size-3.5" />,
                onClick: () => setSaveTemplateOpen(true),
                dividerBefore: true,
                sectionLabel: locale === "es" ? "Plantillas" : "Templates",
              }, ...(!isPublished ? [{
                label: t("applyTemplate"),
                icon: <BookmarkCheck className="size-3.5" />,
                onClick: () => setApplyTemplateOpen(true),
              }] : [])] : view === "week" && canEdit && !isPublished ? [{
                label: t("applyTemplate"),
                icon: <BookmarkCheck className="size-3.5" />,
                onClick: () => setApplyTemplateOpen(true),
                dividerBefore: true,
                sectionLabel: locale === "es" ? "Plantillas" : "Templates",
              }] : []),
              // ── View options ──
              ...((view === "week" || (view === "month" && calendarLayout === "person")) ? [
              ...(view === "week" ? [{
                label: t("daysAsRows"),
                icon: <ArrowRightLeft className="size-3.5" />,
                onClick: toggleDaysAsRows,
                active: daysAsRows,
                dividerBefore: true,
                sectionLabel: locale === "es" ? "Personalización" : "View",
              }] : []),
              ...(!(view === "month" && calendarLayout === "person") ? [{
                label: t("compactView"),
                icon: <Rows3 className="size-3.5" />,
                onClick: () => setCompact((c) => !c),
                active: compact,
              },
              {
                label: locale === "es" ? "Vista simplificada" : "Simplified view",
                icon: <LayoutList className="size-3.5" />,
                onClick: togglePersonSimplified,
                active: personSimplified,
              }] : []),
              {
                label: t("staffColors"),
                icon: <span className="size-3.5 rounded-full bg-gradient-to-br from-amber-400 via-blue-400 to-emerald-400 shrink-0" />,
                onClick: toggleColorChips,
                active: colorChips,
                ...(view === "month" && calendarLayout === "person" ? { dividerBefore: true, sectionLabel: locale === "es" ? "Personalización" : "View" } : {}),
              }, {
                label: t("highlightPerson"),
                icon: <span className="size-3.5 rounded-sm shrink-0" style={{ backgroundColor: "#FDE047" }} />,
                onClick: toggleHighlightHover,
                active: highlightHover,
              }] : []),
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
                  onClick: () => {
                    const fav = { view, calendarLayout, daysAsRows, compact, colorChips, highlightEnabled: highlightHover }
                    setFavoriteView(fav)
                    localStorage.setItem("labrota_favorite_view", JSON.stringify(fav))
                    saveUserPreferences({ favoriteView: fav })
                    toast.success(t("favoriteViewSaved"))
                  },
                }
                // When on favorite → nothing shown. When not on favorite → show go-to (if exists) + save.
                if (isFav) return []
                if (favoriteView) return [{
                  label: t("goToFavoriteView"),
                  icon: <Star className="size-3.5 text-amber-400 fill-amber-400" />,
                  dividerBefore: true,
                  onClick: () => {
                    setView(favoriteView.view as ViewMode)
                    setCalendarLayout(favoriteView.calendarLayout as CalendarLayout)
                    setDaysAsRows(favoriteView.daysAsRows)
                    setCompact(favoriteView.compact)
                    setColorChips(favoriteView.colorChips)
                    setHighlightHover(favoriteView.highlightEnabled)
                  },
                }, saveFavItem]
                return [{ ...saveFavItem, dividerBefore: true }]
              })(),
              // ── History ──
              ...(view === "week" && hasAssignments ? [{
                label: t("viewHistory"),
                icon: <Clock className="size-3.5" />,
                onClick: () => setHistoryOpen(true),
                dividerBefore: true,
              }] : []),
              // ── Destructive ──
              ...(canEdit && hasAssignments && !(view === "month" ? anyMonthWeekPublished : isPublished) ? [{
                label: view === "month" ? t("delete4Weeks") : t("deleteRota"),
                icon: <Trash2 className="size-3.5" />,
                onClick: () => {
                  const msg = view === "month"
                    ? t("confirm4WeeksDelete")
                    : t("deleteWeekConfirm")
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
                },
                dividerBefore: true,
                destructive: true,
              }] : []),
            ]} />
          )}
        </div>
      </div>

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
          <div className="hidden lg:flex flex-col flex-1 min-h-0 px-4 py-2 gap-0 overflow-hidden">
            <div data-calendar-content className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative" style={{ minHeight: 400 }}>
              {/* Shimmer — replaces content during loading (also wait for staffList on first load) */}
              {(loadingWeek || !staffLoaded) && (
                <div className="absolute inset-0 z-10 bg-background flex flex-col">
                  {weekData?.rotaDisplayMode === "by_task" ? (
                    <TaskGrid data={null} staffList={[]} loading locale={locale} isPublished={false} onRefresh={() => {}} taskConflictThreshold={3} punctionsDefault={{}} punctionsOverride={{}} onPunctionsChange={() => {}} compact={compact} colorBorders={colorChips} showPuncBiopsy={false} />
                  ) : calendarLayout === "person" ? (
                    <PersonGrid data={null} staffList={[]} loading locale={locale} isPublished={false} shiftTimes={null} onLeaveByDate={{}} publicHolidays={{}} onChipClick={() => {}} simplified={personSimplified} />
                  ) : (
                    <ShiftGrid data={null} staffList={[]} loading locale={locale} onCellClick={() => {}} onChipClick={() => {}} isPublished={false} shiftTimes={null} onLeaveByDate={{}} publicHolidays={{}} punctionsDefault={{}} punctionsOverride={{}} onPunctionsChange={() => {}} onRefresh={() => {}} weekStart={weekStart} compact={compact} colorChips={colorChips} />
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
              {weekData && (weekData.rotaDisplayMode === "by_task" && calendarLayout === "person" && daysAsRows ? (
                <TransposedPersonGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onChipClick={handleDesktopChipClick}
                  onDateClick={handleMonthDayClick}
                  colorChips={colorChips}
                  compact={compact}
                  simplified={personSimplified}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
                  gridSetDaysRef={gridSetDaysRef}
                />
              ) : weekData.rotaDisplayMode === "by_task" && calendarLayout === "person" ? (
                <TaskPersonGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  compact={compact}
                  colorChips={colorChips}
                  onChipClick={openProfile}
                  onDateClick={handleMonthDayClick}
                />
              ) : weekData.rotaDisplayMode === "by_task" && daysAsRows ? (
                <TransposedTaskGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  compact={compact}
                  colorChips={colorChips}
                  onRemoveAssignment={async (id) => {
                    const snapshot = weekData
                    const assignment = weekData?.days.flatMap((d) => d.assignments.map((a) => ({ ...a, date: d.date }))).find((a) => a.id === id)
                    const result = await removeAssignment(id)
                    if (result.error) { toast.error(result.error); return }
                    fetchWeekSilent(weekStart)
                    if (snapshot && assignment && canEdit) {
                      pushUndo(
                        snapshot,
                        () => upsertAssignment({ weekStart, staffId: assignment.staff_id, date: assignment.date, shiftType: assignment.shift_type, functionLabel: assignment.function_label ?? undefined }),
                        () => removeAssignment(id),
                      )
                    }
                  }}
                  onCellClick={handleOpenSheet}
                  onChipClick={openProfile}
                  onDateClick={handleMonthDayClick}
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
                      <p className="text-[14px] text-muted-foreground mt-2 max-w-[380px] mx-auto leading-relaxed">
                        {t("emptyWeekDesc")}
                      </p>
                    </div>
                    {!showCopyConfirm ? (
                      <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={handleGenerateClick} className="gap-1.5">
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
                          <Button size="sm" onClick={() => {
                            setShowCopyConfirm(false)
                            setLoadingWeek(true)
                            startTransition(async () => {
                              const result = await copyPreviousWeek(weekStart)
                              if (result.error) { toast.error(result.error); return }
                              toast.success(t("copyAssignments", { count: result.count ?? 0 }))
                              fetchWeek(weekStart)
                            })
                          }}>
                            {t("copy")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowCopyConfirm(false)}>{tc("cancel")}</Button>
                        </div>
                      </div>
                    )}
                  </div>
                  )}
                </div>
              ) : weekData.rotaDisplayMode === "by_task" ? (
                <TaskGrid
                  data={weekData}
                  staffList={staffList}
                  loading={false}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  onRefresh={handleRefresh}
                  onAfterMutation={canEdit ? pushUndo : undefined}
                  onCancelUndo={canEdit ? cancelLastUndo : undefined}
                  onSaved={canEdit ? triggerSaved : undefined}
                  gridSetDaysRef={gridSetDaysRef}
                  taskConflictThreshold={weekData?.taskConflictThreshold ?? 3}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={handlePunctionsChange}
                  onBiopsyChange={handleBiopsyChange}
                  biopsyConversionRate={weekData?.biopsyConversionRate}
                  biopsyDay5Pct={weekData?.biopsyDay5Pct}
                  biopsyDay6Pct={weekData?.biopsyDay6Pct}
                  shiftLabel={weekData?.shiftTypes?.[0] ? `${weekData.shiftTypes[0].start_time} – ${weekData.shiftTypes[0].end_time}` : undefined}
                  compact={compact}
                  colorBorders={colorChips}
                  showPuncBiopsy={!compact && !personSimplified}
                  onDateClick={handleMonthDayClick}
                  onChipClick={openProfile}
                />
              ) : calendarLayout === "shift" && daysAsRows ? (
                <TransposedShiftGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  compact={compact}
                  colorChips={colorChips}
                  timeFormat={weekData?.timeFormat}
                  onCellClick={handleOpenSheet}
                  onChipClick={handleDesktopChipClick}
                  onRefresh={handleRefresh}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
                  gridSetDaysRef={gridSetDaysRef}
                />
              ) : calendarLayout === "shift" ? (
                <ShiftGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  loading={false}
                  isGenerating={isPending}
                  locale={locale}
                  onCellClick={() => {}}
                  onChipClick={handleDesktopChipClick}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={handlePunctionsChange}
                  onBiopsyChange={handleBiopsyChange}
                  onRefresh={handleRefresh}
                  onAfterMutation={canEdit ? pushUndo : undefined}
                  onCancelUndo={canEdit ? cancelLastUndo : undefined}
                  onSaved={canEdit ? triggerSaved : undefined}
                  weekStart={weekStart}
                  compact={compact}
                  colorChips={colorChips}
                  simplified={personSimplified}
                  onDateClick={handleMonthDayClick}
                  onLocalDaysChange={setLiveDays}
                  ratioOptimal={weekData?.ratioOptimal}
                  ratioMinimum={weekData?.ratioMinimum}
                  timeFormat={weekData?.timeFormat}
                  biopsyConversionRate={weekData?.biopsyConversionRate}
                  biopsyDay5Pct={weekData?.biopsyDay5Pct}
                  biopsyDay6Pct={weekData?.biopsyDay6Pct}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
                  gridSetDaysRef={gridSetDaysRef}
                />
              ) : calendarLayout === "person" && daysAsRows ? (
                <TransposedPersonGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onChipClick={handleDesktopChipClick}
                  onDateClick={handleMonthDayClick}
                  colorChips={colorChips}
                  compact={compact}
                  simplified={personSimplified}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
                  gridSetDaysRef={gridSetDaysRef}
                />
              ) : (
                <PersonGrid
                  data={weekData}
                  staffList={filteredStaffList}
                  loading={false}
                  isGenerating={isPending}
                  locale={locale}
                  isPublished={!!isPublished || !canEdit}
                  shiftTimes={weekData?.shiftTimes ?? null}
                  onLeaveByDate={weekData?.onLeaveByDate ?? {}}
                  publicHolidays={weekData?.publicHolidays ?? {}}
                  onChipClick={handleDesktopChipClick}
                  onDateClick={handleMonthDayClick}
                  colorChips={colorChips}
                  compact={compact}
                  punctionsDefault={weekData?.punctionsDefault ?? {}}
                  punctionsOverride={punctionsOverride}
                  onPunctionsChange={canEdit ? handlePunctionsChange : undefined}
                  simplified={personSimplified}
                  swapStaffId={desktopSwapEnabled ? viewerStaffId : null}
                  gridSetDaysRef={gridSetDaysRef}
                />
              ))}
            </div>
          </div>
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
        <div className={cn("flex flex-col overflow-auto lg:hidden flex-1")}>
          {/* Date carousel — hidden in edit mode */}
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
          {/* Sticky toolbar */}
          {mobileEditMode ? (
            <div data-mobile-toolbar className="flex items-center justify-between h-[68px] px-4 bg-primary text-primary-foreground border-b border-primary lg:hidden sticky top-0 z-20">
              <span className="text-[16px] font-semibold">
                {currentDayData ? formatDate(currentDayData.date, locale as "es" | "en") : ""}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    // Undo: restore snapshot and re-fetch server state
                    if (preEditSnapshot) {
                      setWeekData(preEditSnapshot)
                    }
                    setMobileEditMode(false)
                    setPreEditSnapshot(null)
                    fetchWeekSilent(weekStart)
                  }}
                  className="h-10 px-4 text-[13px] font-medium text-primary-foreground/70 active:text-primary-foreground rounded-lg"
                >
                  {tc("cancel")}
                </button>
                <Button size="sm" variant="secondary" onClick={() => { setMobileEditMode(false); setPreEditSnapshot(null) }} className="h-10 px-5 text-[14px]">
                  {locale === "es" ? "Listo" : "Done"}
                </Button>
              </div>
            </div>
          ) : (
            <div data-mobile-toolbar className="flex items-center gap-1 h-14 px-2 border-b border-border bg-background lg:hidden sticky top-0 z-20">
              {/* Left: date selector */}
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
              {/* Day status icon — tappable, opens warnings panel */}
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
                    else { toast.success(locale === "es" ? "Día regenerado" : "Day regenerated"); fetchWeekSilent(weekStart) }
                  } : undefined}
                  onShare={undefined}
                  isPending={isPending}
                  compact={mobileCompact}
                  onToggleCompact={toggleMobileCompact}
                  deptColor={mobileDeptColor}
                  onToggleDeptColor={toggleMobileDeptColor}
                  isFavorite={!!(mobileFavoriteView && mobileFavoriteView.viewMode === mobileViewMode && mobileFavoriteView.compact === mobileCompact && mobileFavoriteView.deptColor === mobileDeptColor)}
                  hasFavorite={!!mobileFavoriteView}
                  onSaveFavorite={() => {
                    const fav: MobileFavoriteView = { viewMode: mobileViewMode, compact: mobileCompact, deptColor: mobileDeptColor }
                    setMobileFavoriteView(fav)
                    localStorage.setItem("labrota_mobile_favorite_view", JSON.stringify(fav))
                    saveUserPreferences({ mobileFavoriteView: fav })
                    toast.success(t("favoriteViewSaved"))
                  }}
                  onGoToFavorite={mobileFavoriteView ? () => {
                    setMobileViewMode(mobileFavoriteView.viewMode as "shift" | "person")
                    setMobileCompact(mobileFavoriteView.compact)
                    setMobileDeptColor(mobileFavoriteView.deptColor)
                  } : undefined}
                />
              )}
            </div>
          )}
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
                  // Optimistic remove
                  setWeekData((prev) => {
                    if (!prev) return prev
                    return { ...prev, days: prev.days.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== id) })) }
                  })
                  const result = await removeAssignment(id)
                  if (result.error) { toast.error(result.error); fetchWeekSilent(weekStart) }
                }}
                onAddToTask={(tecCode) => setMobileAddSheet({ open: true, role: "lab" })}
                loading={loadingWeek || !staffLoaded || !currentDayData}
                locale={locale}
              />
            ) : (
              <DayView
                day={currentDayData}
                loading={loadingWeek || !staffLoaded || !currentDayData}
                locale={locale}
                departments={weekData?.departments ?? []}
                data={weekData}
                isEditMode={mobileEditMode}
                onRemoveAssignment={async (id) => {
                  // Optimistic: remove from local state immediately
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
                  const d5 = new Date(currentDayData.date + "T12:00:00"); d5.setDate(d5.getDate() - 5)
                  const d6 = new Date(currentDayData.date + "T12:00:00"); d6.setDate(d6.getDate() - 6)
                  return Math.round(getPunc(d5.toISOString().split("T")[0]) * cr * (weekData.biopsyDay5Pct ?? 0.5) + getPunc(d6.toISOString().split("T")[0]) * cr * (weekData.biopsyDay6Pct ?? 0.5))
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
          // Compute weekly assignment counts
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
      </div>

      {/* Day warnings panel */}
      {dayWarningsOpen && currentDayData && createPortal(
        <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden" onClick={() => setDayWarningsOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div className="relative bg-background rounded-t-2xl shadow-xl px-4 pt-4 pb-8 max-h-[60vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[16px] font-semibold capitalize">{formatDate(currentDayData.date, locale as "es" | "en")}</span>
              <button onClick={() => setDayWarningsOpen(false)} className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            {currentDayData.skillGaps.length === 0 && currentDayData.warnings.length === 0 ? (
              <div className="flex items-center gap-2 py-3">
                <Check className="size-5 text-emerald-500 shrink-0" />
                <span className="text-[14px] text-emerald-600">{locale === "es" ? "Sin alertas para este día" : "No issues for this day"}</span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {currentDayData.skillGaps.map((gap, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                    <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-medium text-red-700">{locale === "es" ? "Habilidad sin cubrir" : "Uncovered skill"}</p>
                      <p className="text-[13px] text-red-600">{gap}</p>
                    </div>
                  </div>
                ))}
                {currentDayData.warnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
                    <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[12px] font-medium text-amber-700">{w.category === "coverage" ? (locale === "es" ? "Cobertura" : "Coverage") : w.category === "skill_gap" ? (locale === "es" ? "Habilidad" : "Skill") : (locale === "es" ? "Aviso" : "Warning")}</p>
                      <p className="text-[13px] text-amber-600">{w.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

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
