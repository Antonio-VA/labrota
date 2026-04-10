"use client"

import { useMemo, useState, useRef, useEffect, Fragment } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { AlertTriangle, ArrowRightLeft, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { removeAssignment, upsertAssignment, type RotaWeekData, type RotaDay, type ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { PersonShiftSelector } from "./person-shift-selector"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "./types"
import { ROLE_ORDER, TODAY, DEFAULT_DEPT_MAPS } from "./constants"

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

/** Pill showing a task technique code — left border in technique color, cross-cell hover */
function TaskChip({
  label, tecColor, compact, colorChips, forceHover, onHover, onRemove,
}: {
  label: string; tecColor: string; compact?: boolean; colorChips?: boolean
  forceHover?: boolean; onHover?: (code: string | null) => void; onRemove?: () => void
}) {
  const [hov, setHov] = useState(false)
  const active = hov || forceHover
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded pl-1.5 pr-1 font-semibold group/chip transition-colors duration-100",
        compact ? "text-[10px] py-0" : "text-[11px] py-0.5",
      )}
      style={{
        borderRadius: 4,
        ...(colorChips && tecColor ? { borderLeft: `3px solid ${tecColor}` } : {}),
        ...(active && tecColor ? { backgroundColor: `${tecColor}40`, color: "#1e293b" } : {}),
      }}
      onMouseEnter={() => { setHov(true); onHover?.(label) }}
      onMouseLeave={() => { setHov(false); onHover?.(null) }}
    >
      {label}
      {onRemove && active && (
        <button className="ml-0.5 leading-none opacity-70 hover:opacity-100 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onRemove() }}>
          <X className="size-2.5" />
        </button>
      )}
    </span>
  )
}

/** Portal-based task technique picker */
function TaskPickerPortal({ tecnicas, assigned, pos, onSelect, onClose }: {
  tecnicas: Tecnica[]; assigned: Set<string>
  pos: { top: number; left: number }; onSelect: (codigo: string) => void; onClose: () => void
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
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 200 }}
      className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-[200px] overflow-y-auto">
      {available.map((t) => (
        <button key={t.id}
          className="flex items-center gap-2 w-full px-2.5 py-1 text-[11px] hover:bg-muted text-left transition-colors"
          onClick={(e) => { e.stopPropagation(); onSelect(t.codigo); onClose() }}>
          <span className="size-2 rounded-full shrink-0 flex-none" style={{ background: resolveColor(t.color) }} />
          <span className="truncate">{t.nombre_es}</span>
        </button>
      ))}
    </div>,
    document.body
  )
}

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

export function TransposedPersonGrid({
  data, staffList, locale, isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick, colorChips, compact, simplified, punctionsDefault, punctionsOverride, onPunctionsChange,
  swapStaffId, gridSetDaysRef,
}: {
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
}) {
  const t = useTranslations("schedule")
  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredShift, setHoveredShift] = useState<string | null>(null)
  const [hoveredTecnica, setHoveredTecnica] = useState<string | null>(null)

  if (!data) return null

  const ROLE_LABEL_MAP: Record<string, string> = {}
  for (const d of data.departments ?? []) { if (!d.parent_id) ROLE_LABEL_MAP[d.code] = d.name }

  const activeStaff = staffList
    .filter((s) => s.onboarding_status !== "inactive")
    .sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
    })

  const [localDays, setLocalDays] = useState(data.days)
  if (gridSetDaysRef) gridSetDaysRef.current = setLocalDays
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setLocalDays(data.days)
  }

  // Build assignment map: staffId → date → assignment
  const assignMap: Record<string, Record<string, Assignment>> = {}
  for (const day of localDays) {
    for (const a of day.assignments) {
      if (!assignMap[a.staff_id]) assignMap[a.staff_id] = {}
      assignMap[a.staff_id][day.date] = a
    }
  }

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

  // Whole-team by date
  const wholeTeamByDate = useMemo(() => {
    if (!isTaskMode) return {} as Record<string, Assignment[]>
    const map: Record<string, Assignment[]> = {}
    for (const day of localDays) {
      map[day.date] = day.assignments.filter((a) => a.whole_team && a.function_label)
    }
    return map
  }, [localDays, isTaskMode])

  async function handleTaskRemove(assignmentId: string) {
    setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) })))
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
  }

  async function handleTaskAdd(staffId: string | null, date: string, tecnicaCodigo: string) {
    const tempId = `temp-${Date.now()}-${Math.random()}`
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
  }

  // Group staff by role for sub-headers
  const roleGroups: { role: string; members: StaffWithSkills[] }[] = []
  for (const s of activeStaff) {
    const last = roleGroups[roleGroups.length - 1]
    if (last && last.role === s.role) last.members.push(s)
    else roleGroups.push({ role: s.role, members: [s] })
  }

  const allMembers = roleGroups.flatMap((g) => g.members)
  const days = localDays

  // Task mode: prepend an ALL column
  const extraCols = isTaskMode ? 1 : 0
  const totalCols = allMembers.length + extraCols

  return (
    <div className="rounded-lg border border-border overflow-auto w-full">
      <div style={{ display: "grid", gridTemplateColumns: `80px ${isTaskMode ? `minmax(${compact ? "48px" : "60px"}, 1fr) ` : ""}repeat(${allMembers.length}, minmax(${compact ? "48px" : "60px"}, 1fr))`, minWidth: totalCols * (compact ? 53 : 65) + 80 }}>

        {/* Header: corner + ALL column (task mode) + staff names */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-20" style={{ minHeight: 48 }} />
        {isTaskMode && (
          <div className="border-b border-r border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1">
            <span className={cn("font-semibold text-muted-foreground text-center", compact ? "text-[9px]" : "text-[10px]")}>ALL</span>
          </div>
        )}
        {allMembers.map((s, i) => {
          return (
            <div
              key={s.id}
              className={cn(
                "border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1",
              )}
              style={colorChips ? { borderTop: `3px solid ${DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8"}` } : { borderTop: "none" }}
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
          const isSat = d.getDay() === 6

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
                    title={isViewerCell ? (locale === "es" ? "Solicitar cambio de turno" : "Request shift swap") : undefined}
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
                        assignment={{ id: "", shift_type: "", staff_id: s.id, staff: s as any, is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false } as Assignment}
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
                              assignments: [...dd.assignments, { id: `temp-${Date.now()}`, staff_id: s.id, staff: s as any, shift_type: newShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false }],
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
