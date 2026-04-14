"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Plane, ArrowRightLeft } from "lucide-react"
import { toast } from "sonner"
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import {
  removeAssignment,
  deleteAssignment,
  upsertAssignment,
  moveAssignmentShift,
  setFunctionLabel,
  setTecnica,
  type RotaWeekData,
  type RotaDay,
  type ShiftTimes,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"
import { DraggableShiftBadge, DraggableOffStaff, DroppableCell } from "./dnd-wrappers"
import { AssignmentPopover, DEPT_FOR_ROLE } from "./assignment-popover"
import { DayStatsInput } from "./day-stats-input"
import { ShiftBadge } from "./shift-badge"
import { DayWarningPopover } from "./warnings"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "./types"
import { ROLE_ORDER, ROLE_LABEL, ROLE_BORDER, TODAY, DEFAULT_DEPT_MAPS } from "./constants"
import { buildDeptMaps } from "./utils"

export function ShiftGrid({
  data, staffList, loading, locale,
  onCellClick, onChipClick,
  isPublished, isGenerating,
  shiftTimes, onLeaveByDate, publicHolidays,
  punctionsDefault, punctionsOverride, onPunctionsChange, onBiopsyChange,
  onRefresh, onAfterMutation, onCancelUndo, onSaved, weekStart, compact, colorChips, simplified, onDateClick, onLocalDaysChange,
  ratioOptimal, ratioMinimum, timeFormat = "24h",
  biopsyConversionRate = 0.5, biopsyDay5Pct = 0.5, biopsyDay6Pct = 0.5,
  swapStaffId, gridSetDaysRef,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  onCellClick: (date: string, shiftType: ShiftType) => void
  onChipClick: (assignment: Assignment, date: string) => void
  isPublished: boolean
  isGenerating?: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  punctionsDefault: Record<string, number>
  punctionsOverride: Record<string, number>
  onPunctionsChange: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  onRefresh: () => void
  onAfterMutation?: (snapshot: RotaWeekData, inverse: () => Promise<{ error?: string }>, forward: () => Promise<{ error?: string }>) => void
  onCancelUndo?: () => void
  onSaved?: () => void
  weekStart: string
  compact?: boolean
  colorChips?: boolean
  simplified?: boolean
  onDateClick?: (date: string) => void
  onLocalDaysChange?: (days: RotaDay[]) => void
  ratioOptimal?: number
  ratioMinimum?: number
  timeFormat?: string
  biopsyConversionRate?: number
  biopsyDay5Pct?: number
  biopsyDay6Pct?: number
  swapStaffId?: string | null
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")

  // O(1) staff lookup by ID
  const staffById = useMemo(() => new Map(staffList.map((s) => [s.id, s])), [staffList])

  // Staff color map — maps each staff member to their department colour
  const deptColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const dept of (data?.departments ?? [])) m[dept.code] = dept.colour
    return m
  }, [data?.departments])
  const staffColorMap = useMemo(() =>
    Object.fromEntries(staffList.map((s) => [s.id, s.color || deptColorMap[s.role] || DEFAULT_DEPT_MAPS.border[s.role] || "#94A3B8"]))
  , [staffList, deptColorMap])
  const { hoveredStaffId, setHovered } = useStaffHover()

  // Require 5px movement before drag activates — allows click events to pass through
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Compute header dates from weekStart so they update immediately on navigation
  const headerDates = useMemo(() => {
    const dates: string[] = []
    const base = new Date(weekStart + "T12:00:00")
    for (let i = 0; i < 7; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      dates.push(d.toISOString().split("T")[0])
    }
    return dates
  }, [weekStart])

  // O(1) tecnica lookups — avoids O(n) .find() calls inside render loops
  const tecnicaByCode = useMemo(() =>
    Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.codigo, t]))
  , [data?.tecnicas])
  const tecnicaById = useMemo(() =>
    Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.id, t]))
  , [data?.tecnicas])

  // O(1) skill-level lookups per staff — avoids repeated .find() on skill arrays
  const staffSkillLevelMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {}
    for (const s of staffList) {
      m[s.id] = {}
      for (const sk of s.staff_skills ?? []) m[s.id][sk.skill] = sk.level
    }
    return m
  }, [staffList])

  // Department maps — memoized so buildDeptMaps doesn't run on every render
  const deptMapsMemo = useMemo(() => buildDeptMaps(data?.departments ?? [], locale), [data?.departments, locale])

  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId]     = useState<string | null>(null)
  const [localDays, setLocalDaysRaw] = useState(data?.days ?? [])
  const setLocalDays: typeof setLocalDaysRaw = (update) => {
    setLocalDaysRaw((prev) => {
      const next = typeof update === "function" ? update(prev) : update
      onLocalDaysChange?.(next)
      return next
    })
  }

  // Register this grid's day setter for direct undo/redo updates
  if (gridSetDaysRef) gridSetDaysRef.current = setLocalDaysRaw

  // Sync local state whenever server data arrives — set-during-render avoids one-frame lag
  const [prevData, setPrevData] = useState(data)
  if (data && data !== prevData) {
    setPrevData(data)
    setLocalDaysRaw(data.days)
    onLocalDaysChange?.(data.days)
  }

  const patchLocalAssignment = useCallback((assignmentId: string, patch: Record<string, unknown>) => {
    setLocalDays((prev) => prev.map((d) => ({
      ...d,
      assignments: d.assignments.map((a) =>
        a.id === assignmentId ? { ...a, ...patch } : a
      ),
    })))
  }, [])

  const handleFunctionLabelSave = useCallback(async (assignmentId: string, label: string | null) => {
    patchLocalAssignment(assignmentId, { function_label: label })
    const result = await setFunctionLabel(assignmentId, label)
    if (result.error) { toast.error(result.error); onRefresh() }
  }, [patchLocalAssignment, onRefresh])

  const handleTecnicaSave = useCallback(async (assignmentId: string, tecnicaId: string | null) => {
    patchLocalAssignment(assignmentId, { tecnica_id: tecnicaId })
    const result = await setTecnica(assignmentId, tecnicaId)
    if (result.error) { toast.error(result.error); onRefresh() }
  }, [patchLocalAssignment, onRefresh])

  // Debounced refresh — batches rapid changes into one server fetch
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const debouncedRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => { onRefresh(); refreshTimer.current = null }, 800)
  }, [onRefresh])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setOverId(null)
    if (!over) return

    const activeId = String(active.id)
    const destZone = String(over.id)

    // ── OFF → shift: create a new assignment ─────────────────────────────────
    if (activeId.startsWith("off-")) {
      if (destZone.startsWith("OFF-")) return
      const destDate  = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11) as ShiftType
      const staffId   = activeId.slice(4, activeId.length - 11)
      const staffMember = staffById.get(staffId)

      // Optimistic: add a placeholder assignment immediately
      if (staffMember) {
        setLocalDays((prev) => prev.map((d) => {
          if (d.date !== destDate) return d
          const optimistic = {
            id: `opt-${Date.now()}`, staff_id: staffId,
            staff: { id: staffId, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never },
            shift_type: destShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false,
          }
          return { ...d, assignments: [...d.assignments, optimistic as Assignment] }
        }))
      }

      {
        const snapshot = data
        const idCapture: { value: string | undefined } = { value: undefined }
        if (snapshot) {
          onAfterMutation?.(
            snapshot,
            () => idCapture.value ? deleteAssignment(idCapture.value) : Promise.resolve({ error: "Cannot undo" }),
            () => upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift }),
          )
        }
        try {
          const result = await upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift })
          if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
          idCapture.value = result.id
          onSaved?.()
        } catch {
          onCancelUndo?.(); toast.error(t("assignmentError")); onRefresh(); return
        }
      }
      // No refresh — optimistic state is correct
      return
    }

    // ── Existing assignment → shift or OFF ────────────────────────────────────
    const assignmentId    = activeId
    const sourceAssignment = localDays.flatMap((d) => d.assignments.map((a) => ({ ...a, date: d.date }))).find((a) => a.id === assignmentId)
    if (!sourceAssignment) return

    const sourceZone = `${sourceAssignment.shift_type}-${sourceAssignment.date}`
    if (sourceZone === destZone) return

    if (destZone.startsWith("OFF-")) {
      // Optimistic: remove immediately
      setLocalDays((prev) => prev.map((d) => ({
        ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId),
      })))
      const oldShift = sourceAssignment.shift_type as ShiftType
      const oldDate  = sourceAssignment.date
      const oldStaff = sourceAssignment.staff_id
      const snapshot = data
      if (snapshot) {
        onAfterMutation?.(
          snapshot,
          () => upsertAssignment({ weekStart, staffId: oldStaff, date: oldDate, shiftType: oldShift }),
          () => removeAssignment(assignmentId),
        )
      }
      try {
        const result = await removeAssignment(assignmentId)
        if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
        onSaved?.()
        // No refresh — optimistic state is correct
      } catch {
        onCancelUndo?.(); toast.error(t("removeError")); onRefresh()
      }
    } else {
      const destDate  = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11)

      if (sourceAssignment.date !== destDate) {
        toast.error(t("shiftMoveError"))
        return
      }

      const oldShift = sourceAssignment.shift_type
      const snapshot = data
      // Optimistic: change shift_type immediately
      setLocalDays((prev) => prev.map((d) => ({
        ...d, assignments: d.assignments.map((a) =>
          a.id === assignmentId ? { ...a, shift_type: destShift, is_manual_override: true } : a
        ),
      })))
      if (snapshot) {
        onAfterMutation?.(
          snapshot,
          () => moveAssignmentShift(assignmentId, oldShift),
          () => moveAssignmentShift(assignmentId, destShift),
        )
      }
      try {
        const result = await moveAssignmentShift(assignmentId, destShift)
        if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
        onSaved?.()
        // Don't refresh — optimistic state is already correct
      } catch {
        onCancelUndo?.(); toast.error(t("moveError")); onRefresh()
      }
    }
  }, [localDays, data, weekStart, staffById, onAfterMutation, onCancelUndo, onSaved, onRefresh, t])

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-background overflow-hidden w-full flex flex-col">
        {/* Header */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border" style={{ minHeight: 52 }}>
          <div className="border-r border-border bg-muted" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center justify-center py-1.5 gap-1 border-l border-border bg-muted">
              <div className="shimmer-bar h-2.5 w-6" />
              <div className="shimmer-bar w-8 h-8 rounded-full" />
              <div className="shimmer-bar h-2.5 w-12 rounded" />
            </div>
          ))}
        </div>
        {/* Rows — match real shift row height with multiple name bars */}
        {Array.from({ length: 6 }).map((_, row) => (
          <div key={row} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border">
            <div className="border-r border-border flex items-center justify-end px-2 py-3">
              <div className="shimmer-bar h-3 w-8" />
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="border-l border-border p-2 flex flex-col gap-1.5 justify-center" style={{ minHeight: 80 }}>
                <div className="shimmer-bar h-4 rounded" style={{ width: `${60 + ((row * 7 + i) % 4) * 10}%` }} />
                <div className="shimmer-bar h-4 rounded" style={{ width: `${50 + ((row * 7 + i + 2) % 4) * 10}%` }} />
                <div className="shimmer-bar h-4 rounded" style={{ width: `${55 + ((row * 7 + i + 1) % 3) * 10}%` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (!data) return null

  // Build skill map for coverage dots
  const staffSkillMap: Record<string, string[]> = {}
  for (const s of staffList) {
    staffSkillMap[s.id] = (s.staff_skills ?? []).map((sk) => sk.skill)
  }

  // Dynamic shift rows from data
  const SHIFT_ROWS = data.shiftTypes.map((s) => s.code)
  const shiftTypeMap = Object.fromEntries((data.shiftTypes ?? []).map((st) => [st.code, st]))

  // Staff IDs visible based on department filter
  const visibleStaffIds = new Set(staffList.map((s) => s.id))

  // Dynamic department maps from DB (memoized above)
  const ROLE_BORDER = deptMapsMemo.border
  const ROLE_LABEL = deptMapsMemo.label
  const ROLE_ORDER = deptMapsMemo.order

  // Find the active assignment for drag overlay
  const activeAssignment = activeId
    ? localDays.flatMap((d) => d.assignments).find((a) => a.id === activeId)
    : null

  // Find the active off-staff member for drag overlay (id = "off-{staffId}-{date}")
  const activeOffStaff = activeId?.startsWith("off-")
    ? staffList.find((s) => activeId.startsWith(`off-${s.id}`))
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => { setActiveId(String(e.active.id)); setOverId(null) }}
      onDragOver={(e) => { setOverId(e.over ? String(e.over.id) : null) }}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-lg border border-border bg-background overflow-hidden w-full">

        {/* Header row — uses headerDates (from weekStart) so dates update immediately on navigation */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)] sticky top-0 z-10 border-b border-border" style={{ minHeight: 52 }}>
          <div className="bg-muted" />
          {headerDates.map((dateStr) => {
            const day   = localDays.find((ld) => ld.date === dateStr)
            const d     = new Date(dateStr + "T12:00:00")
            const wday  = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
            const dayN  = String(d.getDate())
            const today = dateStr === TODAY
            const isSat = d.getDay() === 6
            const isSun = d.getDay() === 0
            const isWknd = isSat || isSun
            const holidayName = publicHolidays[dateStr]

            const defaultP      = punctionsDefault[dateStr] ?? 0
            const effectiveP    = punctionsOverride[dateStr] ?? defaultP
            const hasOverride   = punctionsOverride[dateStr] !== undefined

            return (
              <div
                key={dateStr}
                className={cn(
                  "relative flex flex-col items-center justify-center py-1 gap-0 border-l border-border",
                  holidayName ? "bg-amber-500/10" : "bg-muted"
                )}
              >
                {day && day.warnings.length > 0 && (
                  <DayWarningPopover warnings={day.warnings} />
                )}

                <button
                  onClick={() => onDateClick?.(dateStr)}
                  className={cn("flex flex-col items-center gap-0 cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
                >
                  <span className={cn("text-[10px] uppercase tracking-wider", "text-muted-foreground")}>{wday}</span>
                  <span className={cn(
                    "font-semibold leading-none text-[18px]",
                    today ? "size-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[15px]"
                    : holidayName ? "text-amber-600 dark:text-amber-400" : isWknd ? "text-primary/60" : "text-primary"
                  )}>
                    {dayN}
                  </span>
                </button>
                {holidayName && (
                  <Tooltip>
                    <TooltipTrigger render={
                      <span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>
                    } />
                    <TooltipContent side="bottom">{holidayName}</TooltipContent>
                  </Tooltip>
                )}

                {/* Punciones + biopsias — single clickable area (hidden in simplified mode) */}
                {!simplified && (() => {
                  // Biopsy forecast: punciones from 5 and 6 days ago
                  const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
                  function getPuncForDate(ds: string): number {
                    // Try override, then default map, then lab config by weekday
                    if (punctionsOverride[ds] !== undefined) return punctionsOverride[ds]
                    if (punctionsDefault[ds] !== undefined) return punctionsDefault[ds]
                    // Fallback: use weekday default from punctionsDefault of same weekday in current week
                    const dow = new Date(ds + "T12:00:00").getDay()
                    const sameDow = Object.entries(punctionsDefault).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
                    return sameDow ? sameDow[1] : 0
                  }
                  const d5ago = new Date(dateStr + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
                  const d6ago = new Date(dateStr + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
                  const d5str = d5ago.toISOString().split("T")[0]
                  const d6str = d6ago.toISOString().split("T")[0]
                  const p5 = getPuncForDate(d5str)
                  const p6 = getPuncForDate(d6str)
                  const forecast = Math.round(p5 * biopsyConversionRate * biopsyDay5Pct + p6 * biopsyConversionRate * biopsyDay6Pct)
                  const sources: string[] = []
                  if (p5 > 0) sources.push(t("punctionsD5", { count: p5 }))
                  if (p6 > 0) sources.push(t("punctionsD6", { count: p6 }))
                  const tooltip = forecast > 0 ? t("biopsyForecast", { count: forecast, sources: sources.join(", ") }) : t("punctionsLabel", { count: effectiveP })
                  return (
                    <DayStatsInput
                      date={dateStr}
                      value={effectiveP}
                      defaultValue={defaultP}
                      isOverride={hasOverride}
                      onChange={onPunctionsChange}
                      onBiopsyChange={onBiopsyChange}
                      disabled={isPublished || !data.rota}
                      biopsyForecast={forecast}
                      biopsyTooltip={tooltip}
                      compact
                    />
                  )
                })()}

              </div>
            )
          })}
        </div>

        {/* Shift rows */}
        {SHIFT_ROWS.map((shiftRow) => (
          <div key={shiftRow} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border">
            {/* Shift label — right-aligned, three-line: code / start / end */}
            <div className="flex flex-col items-end justify-center px-2.5 py-2 bg-muted">
              <span className="text-[11px] leading-tight font-semibold text-foreground">{shiftRow}</span>
              <span className="text-[13px] font-medium leading-tight tabular-nums text-primary">
                {shiftTypeMap[shiftRow]?.start_time ? formatTime(shiftTypeMap[shiftRow].start_time, timeFormat) : shiftRow}
              </span>
              {shiftTypeMap[shiftRow]?.end_time && (
                <span className="text-[11px] text-muted-foreground leading-tight tabular-nums">
                  {formatTime(shiftTypeMap[shiftRow].end_time, timeFormat)}
                </span>
              )}
            </div>
            {localDays.map((day) => {
              const dayShifts    = [...day.assignments.filter((a) => a.shift_type === shiftRow && visibleStaffIds.has(a.staff_id))].sort((a, b) => a.staff.first_name.localeCompare(b.staff.first_name) || a.staff.last_name.localeCompare(b.staff.last_name))
                .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
              const effectivePDay = punctionsOverride[day.date] ?? punctionsDefault[day.date] ?? 0
              const cellId = `${shiftRow}-${day.date}`
              const cellDow   = new Date(day.date + "T12:00:00").getDay()
              const isSatCell = cellDow === 6
              const isWkndCell = isSatCell || cellDow === 0
              const isEmpty   = dayShifts.length === 0 && effectivePDay === 0
              return (
                <DroppableCell
                  key={day.date}
                  id={cellId}
                  isOver={overId === cellId}
                  isPublished={isPublished}
                  onClick={() => { if (!isPublished) onCellClick(day.date, shiftRow) }}
                  className={cn(
                    "p-1.5 flex flex-col gap-1 border-l border-border",
                    "bg-background",
                    compact ? "min-h-[32px]" : "min-h-[48px]",
                    !isPublished && "cursor-pointer"
                  )}
                  style={undefined}
                >
                  {dayShifts.map((a) => {
                    const staffMember = staffById.get(a.staff_id)
                    const taskDisabled = data?.rotaDisplayMode === "by_shift" && !data?.enableTaskInShift
                    const cleanFn = a.function_label?.startsWith("dept_") ? null : a.function_label
                    const tecnica = taskDisabled ? null
                      : cleanFn
                      ? tecnicaByCode[cleanFn] ?? null
                      : (a.tecnica_id ? tecnicaById[a.tecnica_id] ?? null : null)
                    const isViewerChip = !!swapStaffId && a.staff_id === swapStaffId
                    return (
                      <AssignmentPopover
                        key={a.id}
                        assignment={a}
                        staffSkills={staffMember?.staff_skills ?? []}
                        tecnicas={data?.tecnicas ?? []}
                        departments={data?.departments ?? []}
                        onFunctionSave={handleFunctionLabelSave}
                        isPublished={isPublished}
                        disabled={taskDisabled || isViewerChip}
                      >
                        <Tooltip>
                          <TooltipTrigger render={
                            <div
                              onClick={(taskDisabled || isViewerChip) ? (e: React.MouseEvent) => { e.stopPropagation(); onChipClick(a, day.date) } : undefined}
                              className={cn((taskDisabled || isViewerChip) ? "cursor-pointer" : undefined, isViewerChip && "relative group/swap")}
                            >
                              <DraggableShiftBadge
                                id={a.id}
                                first={a.staff.first_name}
                                last={a.staff.last_name}
                                role={a.staff.role}
                                isOverride={a.is_manual_override}
                                functionLabel={taskDisabled ? null : cleanFn}
                                tecnica={tecnica}
                                compact={compact}
                                borderColor={ROLE_BORDER[a.staff.role]}
                                isTrainingTecnica={!!(cleanFn && staffSkillLevelMap[a.staff_id]?.[cleanFn] === "training")}
                                colorChips={colorChips}
                                readOnly={isPublished || taskDisabled}
                                staffId={a.staff_id}
                                staffColor={staffColorMap[a.staff_id]}
                                departments={data?.departments ?? []}
                                trainingTecCode={data?.trainingByStaff?.[day.date]?.[a.staff_id] ?? null}
                              />
                              {isViewerChip && (
                                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                                  <ArrowRightLeft className="size-2.5" />
                                </span>
                              )}
                            </div>
                          } />
                          <TooltipContent side="right">
                            {isViewerChip
                              ? t("requestShiftSwap")
                              : `${a.staff.first_name} ${a.staff.last_name} · ${ROLE_LABEL[a.staff.role] ?? a.staff.role}${tecnica ? ` · ${tecnica.nombre_es}` : cleanFn ? ` · ${cleanFn}` : ""}${data?.trainingByStaff?.[day.date]?.[a.staff_id] ? ` · ⏳ ${data.trainingByStaff[day.date][a.staff_id]}` : cleanFn && staffSkillLevelMap[a.staff_id]?.[cleanFn] === "training" ? ` · ${t("inTraining")}` : ""}`}
                          </TooltipContent>
                        </Tooltip>
                      </AssignmentPopover>
                    )
                  })}
                  {/* Empty cell — grey bg applied via parent */}
                </DroppableCell>
              )
            })}
          </div>
        ))}

        {/* OFF row */}
        <div className="grid grid-cols-[80px_repeat(7,1fr)]">
          <div className="flex flex-col items-end justify-center px-2.5 py-2 bg-muted">
            <span className="text-[10px] text-muted-foreground leading-tight font-medium uppercase tracking-wide">OFF</span>
          </div>
          {localDays.map((day) => {
            const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
            const leaveIds    = new Set(onLeaveByDate[day.date] ?? [])
            const dow         = new Date(day.date + "T12:00:00").getDay() // 0=Sun, 6=Sat
            const isSaturday   = dow === 6
            const isWeekendOff = dow === 6 || dow === 0
            const offCellId    = `OFF-${day.date}`

            // Unassigned staff — leave people first (non-draggable), then others
            const allOff = staffList.filter((s) => !assignedIds.has(s.id))
            const onLeaveStaff = allOff.filter((s) => leaveIds.has(s.id))
              .sort((a, b) => a.last_name.localeCompare(b.last_name))
            const availableOff = allOff.filter((s) => !leaveIds.has(s.id))
              .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
            return (
              <DroppableCell
                key={day.date}
                id={offCellId}
                isOver={overId === offCellId}
                isPublished={isPublished}
                className="p-1.5 flex flex-col gap-1 border-l border-border bg-background"
                style={{
                  backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)",
                  backgroundSize: "10px 10px",
                }}
              >
                {/* On leave — always first, not draggable, gray + airplane */}
                {onLeaveStaff.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  return (
                  <div
                    key={s.id}
                    onClick={() => onChipClick({ staff_id: s.id } as Assignment, day.date)}
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn("flex items-center gap-1 py-0.5 text-[11px] font-medium w-full bg-card text-muted-foreground border select-none cursor-pointer transition-colors duration-150", colorChips ? "border-border" : "border-transparent")}
                    style={{ borderLeft: colorChips ? `3px solid ${isHov && staffColorMap[s.id] ? staffColorMap[s.id] : "var(--muted-foreground)"}` : undefined, borderRadius: 4, paddingLeft: 5, paddingRight: 6, ...(isHov && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : {}) }}
                  >
                    <span className="truncate italic">{s.first_name} {s.last_name[0]}.</span>
                    <Plane className="size-3 shrink-0 ml-auto text-muted-foreground/40" />
                  </div>
                  )
                })}
                {/* Available — draggable + clickable for profile */}
                {availableOff.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  return (
                  <DraggableOffStaff key={s.id} staffId={s.id} date={day.date} disabled={isPublished}>
                    <div
                      onClick={() => onChipClick({ staff_id: s.id } as Assignment, day.date)}
                      onMouseEnter={() => setHovered(s.id)}
                      onMouseLeave={() => setHovered(null)}
                      className={cn("flex items-center gap-1 py-0.5 text-[11px] font-medium w-full bg-card text-muted-foreground border cursor-pointer transition-colors duration-150", colorChips ? "border-border" : "border-transparent")}
                      style={{ borderLeft: colorChips ? `3px solid ${isHov && staffColorMap[s.id] ? staffColorMap[s.id] : (ROLE_BORDER[s.role] ?? "#94A3B8")}` : undefined, borderRadius: 4, paddingLeft: 5, paddingRight: 6, ...(isHov && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : {}) }}
                    >
                      <span className="truncate">{s.first_name} {s.last_name[0]}.</span>
                    </div>
                  </DraggableOffStaff>
                  )
                })}
              </DroppableCell>
            )
          })}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeAssignment ? (
          <div className="opacity-90 shadow-lg rounded">
            <ShiftBadge
              first={activeAssignment.staff.first_name}
              last={activeAssignment.staff.last_name}
              role={activeAssignment.staff.role}
              isOverride={activeAssignment.is_manual_override}
              functionLabel={activeAssignment.function_label}
              borderColor={ROLE_BORDER[activeAssignment.staff.role]}
              readOnly
              departments={data?.departments ?? []}
              tecnica={activeAssignment.function_label
                ? tecnicaByCode[activeAssignment.function_label] ?? null
                : (activeAssignment.tecnica_id ? tecnicaById[activeAssignment.tecnica_id] ?? null : null)}
            />
          </div>
        ) : activeOffStaff ? (
          <div className="opacity-90 shadow-lg rounded">
            <ShiftBadge
              first={activeOffStaff.first_name}
              last={activeOffStaff.last_name}
              role={activeOffStaff.role}
              isOverride={false}
              functionLabel={null}
              readOnly
              borderColor={ROLE_BORDER[activeOffStaff.role]}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
