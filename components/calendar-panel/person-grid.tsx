"use client"

import { useCallback, useMemo, useState, useRef, useEffect, Fragment } from "react"
import { useTranslations } from "next-intl"
import { ArrowRightLeft, Plus } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { removeAssignment, upsertAssignment, setFunctionLabel, setTecnica, type RotaWeekData, type RotaDay, type ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { PersonShiftSelector } from "./person-shift-selector"
import { PersonShiftPill } from "./person-shift-pill"
import { AssignmentPopover, DEPT_FOR_ROLE } from "./assignment-popover"
import { DayStatsInput } from "./day-stats-input"
import { DayWarningPopover } from "./warnings"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "./types"
import { ROLE_ORDER, ROLE_DOT, TODAY, DEFAULT_DEPT_MAPS } from "./constants"
import { buildDeptMaps } from "./utils"

// ── Task-mode helpers ─────────────────────────────────────────────────────────

const COLOR_HEX: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}
function resolveColor(color: string): string {
  if (!color) return "#94A3B8"
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}

/** Pill showing a task code — no background by default, hover reveals task color */
function TaskChip({ label, color, onRemove }: { label: string; color: string; onRemove?: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold border transition-all duration-100 cursor-default leading-none"
      style={{
        borderColor: hov ? color + "60" : "transparent",
        background: hov ? color + "18" : "transparent",
        color: hov ? color : "inherit",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {label}
      {onRemove && hov && (
        <button
          className="ml-0.5 leading-none opacity-70 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >×</button>
      )}
    </span>
  )
}

/** Dropdown to pick a tecnica to assign */
function TaskPicker({ tecnicas, assigned, onSelect, onClose }: {
  tecnicas: Tecnica[]
  assigned: Set<string>
  onSelect: (codigo: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  const available = tecnicas.filter((t) => t.activa && !assigned.has(t.codigo))
  if (available.length === 0) return null
  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-0.5 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-[200px] overflow-y-auto"
    >
      {available.map((t) => (
        <button
          key={t.id}
          className="flex items-center gap-2 w-full px-2.5 py-1 text-[11px] hover:bg-muted text-left transition-colors"
          onClick={(e) => { e.stopPropagation(); onSelect(t.codigo); onClose() }}
        >
          <span className="size-2 rounded-full shrink-0 flex-none" style={{ background: resolveColor(t.color) }} />
          <span className="truncate">{t.nombre_es}</span>
        </button>
      ))}
    </div>
  )
}

export function PersonGrid({
  data, staffList, loading, locale,
  isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick, colorChips, compact, punctionsDefault, punctionsOverride, onPunctionsChange, simplified,
  isGenerating, swapStaffId, gridSetDaysRef,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  onChipClick: (assignment: Assignment, date: string) => void
  colorChips?: boolean
  compact?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  simplified?: boolean
  onDateClick?: (date: string) => void
  isGenerating?: boolean
  swapStaffId?: string | null
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const [localDays, setLocalDays] = useState(data?.days ?? [])
  // Register this grid's day setter for direct undo/redo updates
  if (gridSetDaysRef) gridSetDaysRef.current = setLocalDays
  const [prevData, setPrevData] = useState(data)
  if (data && data !== prevData) {
    setPrevData(data)
    setLocalDays(data.days)
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
    if (result.error) toast.error(result.error)
  }, [patchLocalAssignment])

  const handleTecnicaSave = useCallback(async (assignmentId: string, tecnicaId: string | null) => {
    patchLocalAssignment(assignmentId, { tecnica_id: tecnicaId })
    const result = await setTecnica(assignmentId, tecnicaId)
    if (result.error) toast.error(result.error)
  }, [patchLocalAssignment])

  if (loading) {
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)" }}>
          <div className="h-[72px] border-b border-r border-border" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center py-2 border-b border-r last:border-r-0 border-border gap-1">
              <div className="shimmer-bar h-2.5 w-6" />
              <div className="shimmer-bar w-8 h-8 rounded-full" />
              <div className="shimmer-bar h-2.5 w-12 rounded" />
            </div>
          ))}
          {Array.from({ length: 8 }).map((_, i) => (
            <Fragment key={i}>
              <div className="px-3 py-2.5 border-b border-r border-border flex items-center">
                <div className="shimmer-bar h-3 w-28" />
              </div>
              {Array.from({ length: 7 }).map((_, j) => (
                <div key={j} className="p-1.5 border-b border-r last:border-r-0 border-border min-h-[48px] flex items-center">
                  <div className="shimmer-bar h-9 w-full rounded" />
                </div>
              ))}
            </Fragment>
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { label: ROLE_LABEL_MAP, order: ROLE_ORDER_MAP } = buildDeptMaps(data.departments ?? [], locale)

  // Build assignment lookup: staffId → date → assignment
  const assignMap = useMemo(() => {
    const map: Record<string, Record<string, Assignment>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!map[a.staff_id]) map[a.staff_id] = {}
        map[a.staff_id][day.date] = a
      }
    }
    return map
  }, [localDays])

  // Task mode — multi-assignment map and helpers
  const isTaskMode = data?.rotaDisplayMode === "by_task"
  const tecnicaByCode = useMemo(() => Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.codigo, t])), [data?.tecnicas])
  const defaultShiftCode = (data?.shiftTypes?.[0]?.code ?? "T1") as import("@/lib/types/database").ShiftType

  // Multi-assignment map: staffId → date → Assignment[]
  const taskAssignMap = useMemo(() => {
    if (!isTaskMode) return {} as Record<string, Record<string, Assignment[]>>
    const map: Record<string, Record<string, Assignment[]>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!map[a.staff_id]) map[a.staff_id] = {}
        if (!map[a.staff_id][day.date]) map[a.staff_id][day.date] = []
        map[a.staff_id][day.date].push(a)
      }
    }
    return map
  }, [localDays, isTaskMode])

  // Whole-team assignments by date
  const wholeTeamByDate = useMemo(() => {
    if (!isTaskMode) return {} as Record<string, Assignment[]>
    const map: Record<string, Assignment[]> = {}
    for (const day of localDays) {
      map[day.date] = day.assignments.filter((a) => a.whole_team && a.function_label)
    }
    return map
  }, [localDays, isTaskMode])

  const [pickerState, setPickerState] = useState<{ staffId: string | null; date: string } | null>(null)

  const handleTaskRemove = useCallback(async (assignmentId: string) => {
    setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) })))
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
  }, [])

  const handleTaskAdd = useCallback(async (staffId: string | null, date: string, tecnicaCodigo: string) => {
    const tempId = `temp-${Date.now()}-${Math.random()}`
    const staffMember = staffId ? staffList.find((s) => s.id === staffId) : null
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId ?? "", shift_type: defaultShiftCode,
        is_manual_override: true, trainee_staff_id: null, notes: null,
        function_label: tecnicaCodigo, tecnica_id: null, whole_team: staffId === null,
        staff: staffMember ? { id: staffMember.id, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never } : { id: "", first_name: "All", last_name: "", role: "lab" as never },
      }],
    }))
    const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: staffId ?? "", date, shiftType: defaultShiftCode, functionLabel: tecnicaCodigo })
    if (result.error) toast.error(result.error)
    else {
      // Replace temp id with real id
      setLocalDays((prev) => prev.map((d) => ({
        ...d,
        assignments: d.assignments.map((a) => a.id === tempId ? { ...a, id: result.id ?? tempId } : a),
      })))
    }
  }, [staffList, data?.weekStart, defaultShiftCode])

  // Shift highlighting — hover a shift to highlight all same-shift cells
  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredShift, setHoveredShift] = useState<string | null>(null)

  // Active staff sorted by role then first name + role grouping
  const { activeStaff, roleGroups } = useMemo(() => {
    const active = staffList
      .filter((s) => s.onboarding_status !== "inactive")
      .sort((a, b) => {
        const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
      })
    const groups: { role: string; members: StaffWithSkills[] }[] = []
    for (const s of active) {
      const last = groups[groups.length - 1]
      if (last && last.role === s.role) last.members.push(s)
      else groups.push({ role: s.role, members: [s] })
    }
    return { activeStaff: active, roleGroups: groups }
  }, [staffList])

  const days = localDays

  return (
    <div className="rounded-lg border border-border overflow-hidden w-full">
      <div style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)" }}>

        {/* Header row — matches by-shift view */}
        <div className="border-r border-b border-border bg-muted sticky left-0 z-10" style={{ minHeight: 52 }} />
        {days.map((day) => {
          const d       = new Date(day.date + "T12:00:00")
          const wday    = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayN    = String(d.getDate())
          const today   = day.date === TODAY
          const holiday = publicHolidays[day.date]
          const isSat   = d.getDay() === 6
          const isSun   = d.getDay() === 0
          const isWknd  = isSat || isSun
          return (
            <div key={day.date} className={cn(
              "relative flex flex-col items-center justify-center py-1 gap-0 border-b border-r last:border-r-0 border-border",
              holiday ? "bg-amber-100/80" : "bg-muted"
            )}
            style={{
              ...(isSat ? { borderLeft: "1px dashed var(--border)" } : {}),
            }}
            >
              {day.warnings.length > 0 && (
                <DayWarningPopover warnings={day.warnings} />
              )}
              <button
                onClick={() => onDateClick?.(day.date)}
                className={cn("flex flex-col items-center gap-0 cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
              >
                <span className={cn("text-[10px] uppercase tracking-wider", isWknd && !holiday ? "text-muted-foreground/50" : "text-muted-foreground")}>{wday}</span>
                <span className={cn(
                  "font-semibold leading-none text-[18px]",
                  today ? "size-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[15px]"
                  : holiday ? "text-amber-600" : isWknd ? "text-muted-foreground" : "text-primary"
                )}>
                  {dayN}
                </span>
              </button>
              {holiday && (
                <Tooltip>
                  <TooltipTrigger render={<span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>} />
                  <TooltipContent side="bottom">{holiday}</TooltipContent>
                </Tooltip>
              )}
              {/* Punciones / Biopsias — same component as ShiftGrid (hidden in simplified mode) */}
              {!simplified && (() => {
                const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
                function getPunc(dateStr: string): number {
                  if ((punctionsOverride ?? {})[dateStr] !== undefined) return (punctionsOverride ?? {})[dateStr]
                  if ((punctionsDefault ?? {})[dateStr] !== undefined) return (punctionsDefault ?? {})[dateStr]
                  const dow = new Date(dateStr + "T12:00:00").getDay()
                  const sameDow = Object.entries(punctionsDefault ?? {}).find(([d]) => new Date(d + "T12:00:00").getDay() === dow)
                  return sameDow ? sameDow[1] : 0
                }
                const pDefault = (punctionsDefault ?? {})[day.date] ?? 0
                const pEffective = (punctionsOverride ?? {})[day.date] ?? pDefault
                const hasOverride = (punctionsOverride ?? {})[day.date] !== undefined
                const bRate = data?.biopsyConversionRate ?? 0.5
                const bD5 = data?.biopsyDay5Pct ?? 0.5
                const bD6 = data?.biopsyDay6Pct ?? 0.5
                const d5ago = new Date(day.date + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
                const d6ago = new Date(day.date + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
                const p5 = getPunc(d5ago.toISOString().split("T")[0])
                const p6 = getPunc(d6ago.toISOString().split("T")[0])
                const forecast = Math.round(p5 * bRate * bD5 + p6 * bRate * bD6)
                const tooltip = forecast > 0 ? `${forecast} biopsias previstas` : `${pEffective} punciones`
                return (
                  <DayStatsInput
                    date={day.date}
                    value={pEffective}
                    defaultValue={pDefault}
                    isOverride={hasOverride}
                    onChange={onPunctionsChange ?? (() => {})}
                    disabled={!onPunctionsChange}
                    biopsyForecast={forecast}
                    biopsyTooltip={tooltip}
                    compact
                  />
                )
              })()}
            </div>
          )
        })}

        {/* ALL row — whole-team task assignments (task mode only) */}
        {isTaskMode && (
          <Fragment key="__all__">
            <div
              className="px-3 py-1.5 bg-muted border-b border-border flex items-center gap-1.5"
              style={{ gridColumn: "1 / -1" }}
            >
              <span className="size-1.5 rounded-full bg-slate-400 shrink-0" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {t("wholeTeam")}
              </span>
            </div>
            <div className={cn("border-b border-r border-border bg-background sticky left-0 z-10 flex items-center", compact ? "px-1.5 min-h-[28px]" : "px-2 min-h-[36px]")}>
              <span className="text-[12px] font-semibold text-muted-foreground">ALL</span>
            </div>
            {days.map((day) => {
              const assigns = wholeTeamByDate[day.date] ?? []
              const assignedCodes = new Set(assigns.map((a) => a.function_label!).filter(Boolean))
              const isOpen = pickerState?.staffId === null && pickerState?.date === day.date
              return (
                <div
                  key={day.date}
                  className={cn("border-b border-r last:border-r-0 border-border relative flex flex-wrap gap-0.5 items-center bg-background transition-colors", compact ? "px-0.5 py-0 min-h-[24px]" : "px-1 py-0.5 min-h-[36px]", !isPublished && "cursor-pointer hover:bg-muted/30")}
                  onClick={!isPublished ? () => setPickerState(isOpen ? null : { staffId: null, date: day.date }) : undefined}
                >
                  {assigns.map((a) => {
                    const tec = tecnicaByCode[a.function_label!]
                    return (
                      <TaskChip
                        key={a.id}
                        label={a.function_label!}
                        color={tec ? resolveColor(tec.color) : "#94A3B8"}
                        onRemove={!isPublished ? () => handleTaskRemove(a.id) : undefined}
                      />
                    )
                  })}
                  {!isPublished && !isOpen && (
                    <span className="inline-flex items-center justify-center size-4 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                      <Plus className="size-3" />
                    </span>
                  )}
                  {isOpen && (
                    <TaskPicker
                      tecnicas={data?.tecnicas ?? []}
                      assigned={assignedCodes}
                      onSelect={(codigo) => handleTaskAdd(null, day.date, codigo)}
                      onClose={() => setPickerState(null)}
                    />
                  )}
                </div>
              )
            })}
          </Fragment>
        )}

        {/* Role groups */}
        {roleGroups.map(({ role, members }, groupIdx) => (
          <Fragment key={role}>
            {/* Role header — spans all 8 columns */}
            <div
              className="px-3 py-1.5 bg-muted border-b border-border flex items-center gap-1.5"
              style={{ gridColumn: "1 / -1" }}
            >
              <span className={cn("size-1.5 rounded-full shrink-0", ROLE_DOT[role] ?? "bg-slate-400")} />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {ROLE_LABEL_MAP[role] ?? role}
              </span>
            </div>

            {/* Member rows */}
            {members.map((s) => {
              const staffAssigns = assignMap[s.id] ?? {}
              return (
                <Fragment key={s.id}>
                  {/* Name cell — click opens profile */}
                  <div
                    className={cn("border-b border-r border-border bg-background sticky left-0 z-10 flex items-center min-w-0 cursor-pointer hover:bg-muted/50", compact ? "px-1.5 py-0.5 min-h-[28px]" : "px-2 py-1 min-h-[36px]")}
                    style={colorChips ? { borderLeft: `3px solid ${DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8"}` } : undefined}
                    onClick={() => onChipClick({ staff_id: s.id } as Assignment, "")}
                  >
                    <span className="text-[13px] font-medium truncate leading-tight">
                      {s.first_name} {s.last_name}
                    </span>
                  </div>

                  {/* Day cells */}
                  {days.map((day) => {
                    const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)

                    // ── Task mode cell ──────────────────────────────────────
                    if (isTaskMode) {
                      const taskAssigns = (taskAssignMap[s.id]?.[day.date] ?? []).filter((a) => a.function_label && !a.function_label.startsWith("dept_") && !a.whole_team)
                      const assignedCodes = new Set(taskAssigns.map((a) => a.function_label!))
                      const isOpen = pickerState?.staffId === s.id && pickerState?.date === day.date
                      return (
                        <div
                          key={day.date}
                          className={cn("border-b border-r last:border-r-0 border-border relative flex flex-wrap gap-0.5 items-center bg-background transition-colors", compact ? "px-0.5 py-0 min-h-[24px]" : "px-1 py-0.5 min-h-[36px]", onLeave && "bg-muted/20", !isPublished && !onLeave && "cursor-pointer hover:bg-muted/30")}
                          onClick={!isPublished && !onLeave ? () => setPickerState(isOpen ? null : { staffId: s.id, date: day.date }) : undefined}
                        >
                          {onLeave ? (
                            <span className="text-[10px] text-muted-foreground italic w-full text-center">{t("leaveShort")}</span>
                          ) : (
                            <>
                              {taskAssigns.map((a) => {
                                const tec = tecnicaByCode[a.function_label!]
                                return (
                                  <TaskChip
                                    key={a.id}
                                    label={a.function_label!}
                                    color={tec ? resolveColor(tec.color) : "#94A3B8"}
                                    onRemove={!isPublished ? () => handleTaskRemove(a.id) : undefined}
                                  />
                                )
                              })}
                              {!isPublished && !isOpen && (
                                <span className="inline-flex items-center justify-center size-4 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                                  <Plus className="size-3" />
                                </span>
                              )}
                              {isOpen && (
                                <TaskPicker
                                  tecnicas={data?.tecnicas ?? []}
                                  assigned={assignedCodes}
                                  onSelect={(codigo) => handleTaskAdd(s.id, day.date, codigo)}
                                  onClose={() => setPickerState(null)}
                                />
                              )}
                            </>
                          )}
                        </div>
                      )
                    }

                    // ── Shift mode cell (existing logic) ────────────────────
                    const assignment = staffAssigns[day.date]
                    const taskOff = data?.rotaDisplayMode === "by_shift" && !data?.enableTaskInShift
                    const cleanFnLabel = assignment?.function_label?.startsWith("dept_") ? null : assignment?.function_label
                    const tecnica    = (taskOff || !assignment) ? null
                      : cleanFnLabel
                        ? (data.tecnicas ?? []).find((t) => t.codigo === cleanFnLabel) ?? null
                        : (data.tecnicas ?? []).find((t) => t.id === assignment.tecnica_id) ?? null
                    const cellShift = assignment ? assignment.shift_type : (onLeave ? "__leave__" : "__off__")
                    const isShiftHovered = highlightEnabled && hoveredShift && cellShift === hoveredShift
                    const isOffCell = !assignment && !onLeave && isPublished
                    return (
                      <div
                        key={day.date}
                        className={cn("border-b border-r last:border-r-0 border-border flex items-center transition-colors duration-100", compact ? "px-0.5 py-0 min-h-[24px]" : "px-0.5 py-0.5 min-h-[36px]", isShiftHovered ? "bg-primary/10" : "bg-background")}
                        style={isOffCell ? { backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" } : undefined}
                        onMouseEnter={() => setHoveredShift(cellShift)}
                        onMouseLeave={() => setHoveredShift(null)}
                      >
                        {assignment ? (
                          swapStaffId && s.id === swapStaffId && isPublished ? (
                            <Tooltip>
                              <TooltipTrigger render={
                                <div
                                  className="w-full relative group/swap cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); onChipClick(assignment, day.date) }}
                                >
                                  <PersonShiftPill
                                    assignment={assignment}
                                    shiftTimes={shiftTimes}
                                    tecnica={tecnica}
                                    simplified={simplified}
                                  />
                                  <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                                    <ArrowRightLeft className="size-2.5" />
                                  </span>
                                </div>
                              } />
                              <TooltipContent side="right">
                                {t("requestShiftSwap")}
                              </TooltipContent>
                            </Tooltip>
                          ) : taskOff ? (
                            <PersonShiftSelector
                              assignment={assignment}
                              shiftTimes={shiftTimes}
                              shiftTypes={data?.shiftTypes ?? []}
                              isPublished={isPublished}
                              simplified={simplified}
                              onShiftChange={async (newShift) => {
                                if (!newShift) {
                                  patchLocalAssignment(assignment.id, { _removed: true })
                                  setLocalDays((prev) => prev.map((d) => ({
                                    ...d,
                                    assignments: d.assignments.filter((a) => a.id !== assignment.id),
                                  })))
                                  const result = await removeAssignment(assignment.id)
                                  if (result.error) toast.error(result.error)
                                } else {
                                  patchLocalAssignment(assignment.id, { shift_type: newShift })
                                  const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                                  if (result.error) toast.error(result.error)
                                }
                              }}
                            />
                          ) : (
                            <AssignmentPopover
                              assignment={assignment}
                              staffSkills={s.staff_skills ?? []}
                              tecnicas={data?.tecnicas ?? []}
                              departments={data?.departments ?? []}
                              onFunctionSave={handleFunctionLabelSave}
                              isPublished={isPublished}
                            >
                              <div className="w-full">
                                <PersonShiftPill
                                  assignment={assignment}
                                  shiftTimes={shiftTimes}
                                  tecnica={tecnica}
                                  simplified={simplified}
                                />
                              </div>
                            </AssignmentPopover>
                          )
                        ) : onLeave ? (
                          <span className="text-[12px] text-muted-foreground italic w-full text-center">{t("leaveShort")}</span>
                        ) : !isPublished ? (
                          <PersonShiftSelector
                            assignment={{ id: "", shift_type: "", staff_id: s.id, staff: s as any, is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false } as Assignment}
                            shiftTimes={shiftTimes}
                            shiftTypes={data?.shiftTypes ?? []}
                            isPublished={false}
                            simplified={simplified}
                            isOff
                            onShiftChange={async (newShift) => {
                              if (!newShift) return
                              const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                              if (result.error) toast.error(result.error)
                              else {
                                setLocalDays((prev) => prev.map((d) => d.date !== day.date ? d : {
                                  ...d,
                                  assignments: [...d.assignments, { id: result.id ?? `temp-${Date.now()}`, staff_id: s.id, staff: s as any, shift_type: newShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false }],
                                }))
                              }
                            }}
                          />
                        ) : (
                          <span className="text-[12px] text-muted-foreground font-semibold select-none w-full text-center">OFF</span>
                        )}
                      </div>
                    )
                  })}
                </Fragment>
              )
            })}
          </Fragment>
        ))}
      </div>
      {/* Shift legend — shown in simplified mode */}
      {simplified && shiftTimes && Object.keys(shiftTimes).length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-border bg-muted/50">
          {Object.entries(shiftTimes).map(([code, time]) => (
            <span key={code} className="text-[11px] text-muted-foreground">
              <span className="font-semibold" style={{ color: "var(--pref-bg)" }}>{code}</span>
              {" "}{time.start}–{time.end}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
