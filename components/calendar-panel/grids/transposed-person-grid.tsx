"use client"

import { useCallback, useEffect, useMemo, useState, useRef, Fragment } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, ArrowRightLeft, Plus, Users } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { removeAssignment, upsertAssignment, type RotaWeekData, type RotaDay, type ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { PersonShiftSelector } from "./person-shift-selector"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "../types"
import { ROLE_ORDER, TODAY, DEFAULT_DEPT_MAPS } from "../constants"
import { resolveColor } from "@/components/task-grid/constants"
import { TaskChip } from "./task-chip"
import { TaskPickerPortal } from "./task-picker"

/** One staff member × one day task cell (transposed layout) — manages its own picker portal */
function TransposedTaskCell({
  staffId, date, assignments, tecnicas, tecnicaByCode, colorChips, compact,
  isPublished, onLeave, leaveShortText, isLast,
  hoveredTecnica, highlightEnabled, onHoveredChange, onAdd, onRemove,
}: {
  staffId: string | null; date: string; assignments: Assignment[]
  tecnicas: Tecnica[]; tecnicaByCode: Record<string, Tecnica>
  colorChips?: boolean; compact?: boolean; isPublished: boolean
  onLeave?: boolean; leaveShortText: string; isLast?: boolean
  hoveredTecnica: string | null; highlightEnabled: boolean
  onHoveredChange: (code: string | null) => void
  onAdd: (staffId: string | null, date: string, codigo: string) => void
  onRemove: (assignmentId: string) => void
}) {
  const [pickerPos, setPickerPos] = useState<{ top: number; left: number } | null>(null)
  const cellRef = useRef<HTMLDivElement>(null)
  const assignedCodes = useMemo(
    () => new Set(assignments.map((a) => a.function_label!).filter(Boolean)),
    [assignments]
  )

  function openPicker() {
    if (isPublished || onLeave) return
    const rect = cellRef.current?.getBoundingClientRect()
    if (rect) {
      const top = Math.min(rect.bottom + 4, window.innerHeight - 220)
      const left = Math.min(rect.left, window.innerWidth - 160)
      setPickerPos({ top, left })
    }
  }

  return (
    <div
      ref={cellRef}
      className={cn(
        "border-b border-r border-border relative flex flex-wrap gap-0.5 items-start content-start group/cell bg-background",
        compact ? "min-h-[22px] p-0.5" : "min-h-[32px] p-0.5 pb-5",
        onLeave && "bg-muted/20",
        isLast && "border-r-0",
      )}
    >
      {onLeave ? (
        <span className={cn("text-muted-foreground italic w-full text-center", compact ? "text-[9px]" : "text-[10px]")}>{leaveShortText}</span>
      ) : (
        <>
          {assignments.map((a) => {
            const tec = tecnicaByCode[a.function_label!]
            const tecColor = tec ? resolveColor(tec.color) : "#94A3B8"
            return (
              <TaskChip
                key={a.id}
                label={a.function_label!}
                tecColor={tecColor}
                compact={compact}
                colorChips={colorChips}
                forceHover={highlightEnabled && hoveredTecnica === a.function_label}
                onHover={onHoveredChange}
                onRemove={!isPublished ? () => onRemove(a.id) : undefined}
              />
            )
          })}
          {!isPublished && (
            <div
              onClick={openPicker}
              className="absolute bottom-0 left-0 right-0 h-5 flex items-center justify-center cursor-pointer opacity-0 group-hover/cell:opacity-100 transition-opacity hover:bg-muted/40 rounded-b"
            >
              <Plus className="size-3 text-muted-foreground" />
            </div>
          )}
          {pickerPos && (
            <TaskPickerPortal
              tecnicas={tecnicas} assigned={assignedCodes} pos={pickerPos}
              onSelect={(c) => { onAdd(staffId, date, c); setPickerPos(null) }}
              onClose={() => setPickerPos(null)}
            />
          )}
        </>
      )}
    </div>
  )
}

interface TransposedPersonGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  onChipClick: (assignment: { staff_id: string }, date: string) => void
  onDateClick?: (date: string) => void
  colorChips?: boolean
  compact?: boolean
  simplified?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  swapStaffId?: string | null
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}

// Null-gate wrapper — the inner component holds all the hooks so none of them
// are called conditionally on `data` being present.
export function TransposedPersonGrid(props: TransposedPersonGridProps) {
  if (!props.data) return null
  return <TransposedPersonGridInner {...props} data={props.data} />
}

function TransposedPersonGridInner({
  data, staffList, locale, isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick, colorChips, compact, simplified, punctionsDefault: _punctionsDefault, punctionsOverride: _punctionsOverride, onPunctionsChange: _onPunctionsChange,
  swapStaffId, gridSetDaysRef,
}: TransposedPersonGridProps & { data: RotaWeekData }) {
  const t = useTranslations("schedule")
  const tSwaps = useTranslations("swaps")
  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredShift, setHoveredShift] = useState<string | null>(null)
  const [hoveredTecnica, setHoveredTecnica] = useState<string | null>(null)

  const _ROLE_LABEL_MAP = useMemo(() => {
    const map: Record<string, string> = {}
    for (const d of data.departments ?? []) { if (!d.parent_id) map[d.code] = (locale === "en" && d.name_en) ? d.name_en : d.name }
    return map
  }, [data.departments, locale])

  const activeStaff = useMemo(() => staffList
    .filter((s) => s.onboarding_status !== "inactive")
    .sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
    })
  , [staffList])

  const [localDays, setLocalDays] = useState(data.days)
  // Register this grid's day setter on the parent ref so undo/redo can push
  // state directly. Parent only reads .current from event handlers, so a
  // post-commit effect is fine.
  useEffect(() => {
    if (!gridSetDaysRef) return
    gridSetDaysRef.current = setLocalDays
    return () => { gridSetDaysRef.current = null }
  }, [gridSetDaysRef])
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setLocalDays(data.days)
  }

  // Build assignment map: staffId → date → assignment
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

  const isTaskMode = data?.rotaDisplayMode === "by_task"
  const tecnicaByCode = useMemo(
    () => Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.codigo, t])),
    [data?.tecnicas]
  )
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

  // Whole-team by date (deduplicated by function_label)
  const wholeTeamByDate = useMemo(() => {
    if (!isTaskMode) return {} as Record<string, Assignment[]>
    const map: Record<string, Assignment[]> = {}
    for (const day of localDays) {
      const seen = new Set<string>()
      map[day.date] = day.assignments.filter((a) => {
        if (!a.whole_team || !a.function_label) return false
        if (seen.has(a.function_label)) return false
        seen.add(a.function_label)
        return true
      })
    }
    return map
  }, [localDays, isTaskMode])

  const handleTaskRemove = useCallback(async (assignmentId: string) => {
    setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) })))
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
  }, [])

  // Group staff by role for sub-headers
  const roleGroups = useMemo(() => {
    const groups: { role: string; members: StaffWithSkills[] }[] = []
    for (const s of activeStaff) {
      const last = groups[groups.length - 1]
      if (last && last.role === s.role) last.members.push(s)
      else groups.push({ role: s.role, members: [s] })
    }
    return groups
  }, [activeStaff])

  const allMembers = useMemo(() => roleGroups.flatMap((g) => g.members), [roleGroups])

  const handleTaskAdd = useCallback(async (staffId: string | null, date: string, tecnicaCodigo: string) => {
    const tempId = `temp-${crypto.randomUUID()}`
    const staffMember = staffId ? allMembers.find((s) => s.id === staffId) : null
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
      setLocalDays((prev) => prev.map((d) => ({
        ...d,
        assignments: d.assignments.map((a) => a.id === tempId ? { ...a, id: result.id ?? tempId } : a),
      })))
    }
  }, [allMembers, data?.weekStart, defaultShiftCode])
  const days = localDays

  // Task mode: prepend an ALL column
  const extraCols = isTaskMode ? 1 : 0
  const totalCols = allMembers.length + extraCols

  return (
    <div className="rounded-lg border border-border overflow-auto w-full">
      <div style={{ display: "grid", gridTemplateColumns: `96px ${isTaskMode ? `minmax(${compact ? "48px" : "60px"}, 1fr) ` : ""}repeat(${allMembers.length}, minmax(${compact ? "48px" : "60px"}, 1fr))`, minWidth: totalCols * (compact ? 53 : 65) + 96 }}>

        {/* Header: corner + ALL column (task mode) + staff names */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-20 top-0" style={{ minHeight: 48 }} />
        {isTaskMode && (
          <div className="border-b border-r border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1 sticky top-0 z-10">
            <Users className={cn("text-muted-foreground mb-0.5", compact ? "size-2.5" : "size-3")} />
            <span className={cn("font-semibold text-muted-foreground text-center", compact ? "text-[9px]" : "text-[10px]")}>ALL</span>
          </div>
        )}
        {allMembers.map((s) => {
          const staffColor = colorChips ? (s.color || DEFAULT_DEPT_MAPS.border[s.role] || "#94A3B8") : undefined
          return (
            <div
              key={s.id}
              className={cn(
                "border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1 sticky top-0 z-10",
              )}
              style={staffColor ? { borderBottom: `3px solid ${staffColor}` } : undefined}
            >
              <button
                onClick={() => onChipClick({ staff_id: s.id }, "")}
                className="flex flex-col items-center cursor-pointer hover:opacity-70 transition-opacity"
              >
                <span className={cn("font-medium text-center leading-tight truncate w-full", compact ? "text-[9px]" : "text-[10px]")}>
                  {s.first_name}
                </span>
                <span className={cn("text-muted-foreground text-center truncate w-full", compact ? "text-[8px]" : "text-[9px]")}>
                  {s.last_name[0]}.
                </span>
              </button>
            </div>
          )
        })}

        {/* Day rows */}
        {days.map((day) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).slice(0, 2).toUpperCase()
          const dayN = String(d.getDate())
          const today = day.date === TODAY
          const holiday = publicHolidays[day.date]
          const _isSat = d.getDay() === 6

          return (
            <Fragment key={day.date}>
              {/* Day label cell */}
              <div
                className={cn(
                  "border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center justify-end gap-1 px-1.5 cursor-pointer hover:bg-muted/80",
                  holiday && "bg-amber-50/60"
                )}
                onClick={() => onDateClick?.(day.date)}
              >
                {day.warnings?.length > 0 && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase">{wday}</span>
                  <span className={cn(
                    "font-semibold leading-none",
                    today ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary"
                  )}>
                    {dayN}
                  </span>
                </div>
                {holiday && (
                  <Tooltip>
                    <TooltipTrigger render={<span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>} />
                    <TooltipContent side="right">{holiday}</TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* ALL cell (task mode) */}
              {isTaskMode && (
                <TransposedTaskCell
                  staffId={null}
                  date={day.date}
                  assignments={wholeTeamByDate[day.date] ?? []}
                  tecnicas={data?.tecnicas ?? []}
                  tecnicaByCode={tecnicaByCode}
                  colorChips={colorChips}
                  compact={compact}
                  isPublished={isPublished}
                  leaveShortText={t("leaveShort")}
                  hoveredTecnica={hoveredTecnica}
                  highlightEnabled={highlightEnabled}
                  onHoveredChange={setHoveredTecnica}
                  onAdd={handleTaskAdd}
                  onRemove={handleTaskRemove}
                />
              )}

              {/* Staff cells for this day */}
              {allMembers.map((s, i) => {
                const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)
                const isLast = i === allMembers.length - 1

                // ── Task mode cell ──────────────────────────────────────────
                if (isTaskMode) {
                  const taskAssigns = (taskAssignMap[s.id]?.[day.date] ?? []).filter((a) => a.function_label && !a.function_label.startsWith("dept_") && !a.whole_team)
                  return (
                    <TransposedTaskCell
                      key={s.id}
                      staffId={s.id}
                      date={day.date}
                      assignments={taskAssigns}
                      tecnicas={data?.tecnicas ?? []}
                      tecnicaByCode={tecnicaByCode}
                      colorChips={colorChips}
                      compact={compact}
                      isPublished={isPublished}
                      onLeave={onLeave}
                      leaveShortText={t("leaveShort")}
                      isLast={isLast}
                      hoveredTecnica={hoveredTecnica}
                      highlightEnabled={highlightEnabled}
                      onHoveredChange={setHoveredTecnica}
                      onAdd={handleTaskAdd}
                      onRemove={handleTaskRemove}
                    />
                  )
                }

                // ── Shift mode cell ─────────────────────────────────────────
                const assignment = assignMap[s.id]?.[day.date]
                const cellShift = assignment ? assignment.shift_type : (onLeave ? "__leave__" : "__off__")
                const isHovered = highlightEnabled && hoveredShift && cellShift === hoveredShift
                const isOffCell = !assignment && !onLeave && isPublished
                const isViewerCell = !!swapStaffId && s.id === swapStaffId && !!assignment && isPublished
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "border-b border-r last:border-r-0 border-border flex items-center justify-center transition-colors duration-100",
                      compact ? "min-h-[22px] px-0.5 py-0" : "min-h-[28px] px-0.5 py-0.5",
                      isHovered ? "bg-primary/10" : "bg-background",
                      isViewerCell && "relative group/swap cursor-pointer",
                    )}
                    style={isOffCell ? { backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" } : undefined}
                    onMouseEnter={() => setHoveredShift(cellShift)}
                    onMouseLeave={() => setHoveredShift(null)}
                    onClick={isViewerCell ? (e) => { e.stopPropagation(); onChipClick(assignment!, day.date) } : undefined}
                    title={isViewerCell ? tSwaps("requestShiftSwap") : undefined}
                  >
                    {isViewerCell && (
                      <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                        <ArrowRightLeft className="size-2.5" />
                      </span>
                    )}
                    {assignment ? (
                      !isPublished ? (
                        <PersonShiftSelector
                          assignment={assignment}
                          shiftTimes={shiftTimes}
                          shiftTypes={data?.shiftTypes ?? []}
                          isPublished={false}
                          simplified={simplified !== false}
                          onShiftChange={async (newShift) => {
                            if (!newShift) {
                              setLocalDays((prev) => prev.map((dd) => ({ ...dd, assignments: dd.assignments.filter((a) => a.id !== assignment.id) })))
                              const result = await removeAssignment(assignment.id)
                              if (result.error) toast.error(result.error)
                            } else {
                              setLocalDays((prev) => prev.map((dd) => ({ ...dd, assignments: dd.assignments.map((a) => a.id === assignment.id ? { ...a, shift_type: newShift } : a) })))
                              const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                              if (result.error) toast.error(result.error)
                            }
                          }}
                        />
                      ) : simplified !== false ? (
                        <span className={cn("font-semibold tabular-nums", compact ? "text-[10px]" : "text-[12px]")} style={{ color: "var(--pref-bg)" }}>
                          {assignment.shift_type}
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-0">
                          <span className={cn("font-semibold tabular-nums", compact ? "text-[10px]" : "text-[12px]")} style={{ color: "var(--pref-bg)" }}>
                            {assignment.shift_type}
                          </span>
                          {shiftTimes?.[assignment.shift_type] && (
                            <span className={cn("text-muted-foreground", compact ? "text-[8px]" : "text-[9px]")}>
                              {shiftTimes[assignment.shift_type].start}–{shiftTimes[assignment.shift_type].end}
                            </span>
                          )}
                        </div>
                      )
                    ) : onLeave ? (
                      <span className={cn("text-muted-foreground italic", compact ? "text-[9px]" : "text-[11px]")}>{t("leaveShort")}</span>
                    ) : !isPublished ? (
                      <PersonShiftSelector
                        assignment={{ id: "", shift_type: "", staff_id: s.id, staff: s as unknown as Assignment["staff"], is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false } as Assignment}
                        shiftTimes={shiftTimes}
                        shiftTypes={data?.shiftTypes ?? []}
                        isPublished={false}
                        simplified={simplified !== false}
                        isOff
                        onShiftChange={async (newShift) => {
                          if (!newShift) return
                          const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                          if (result.error) toast.error(result.error)
                          else {
                            setLocalDays((prev) => prev.map((dd) => dd.date !== day.date ? dd : {
                              ...dd,
                              assignments: [...dd.assignments, { id: `temp-${Date.now()}`, staff_id: s.id, staff: s as unknown as Assignment["staff"], shift_type: newShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false }],
                            }))
                          }
                        }}
                      />
                    ) : (
                      <span className={cn("text-muted-foreground font-semibold", compact ? "text-[9px]" : "text-[11px]")}>OFF</span>
                    )}
                  </div>
                )
              })}
            </Fragment>
          )
        })}
      </div>
      {/* Shift legend — shown in simplified mode */}
      {simplified !== false && shiftTimes && Object.keys(shiftTimes).length > 0 && (
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
