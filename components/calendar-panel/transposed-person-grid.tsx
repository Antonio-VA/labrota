"use client"

import { useState, useRef, useEffect, Fragment } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Check, ArrowRightLeft, Plus } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { removeAssignment, upsertAssignment, type RotaWeekData, type RotaDay, type ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { PersonShiftSelector } from "./person-shift-selector"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "./types"
import { ROLE_ORDER, TODAY, DEFAULT_DEPT_MAPS } from "./constants"

// ── Task-mode helpers (mirrored from person-grid) ─────────────────────────────

const COLOR_HEX_T: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}
function resolveColorT(color: string): string {
  if (!color) return "#94A3B8"
  if (color.startsWith("#")) return color
  return COLOR_HEX_T[color] ?? "#94A3B8"
}

function TaskChipT({ label, color, onRemove }: { label: string; color: string; onRemove?: () => void }) {
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
        <button className="ml-0.5 leading-none opacity-70 hover:opacity-100" onClick={(e) => { e.stopPropagation(); onRemove() }}>×</button>
      )}
    </span>
  )
}

function TaskPickerT({ tecnicas, assigned, onSelect, onClose }: {
  tecnicas: Tecnica[]; assigned: Set<string>; onSelect: (codigo: string) => void; onClose: () => void
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
    <div ref={ref} className="absolute left-0 top-full mt-0.5 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-[200px] overflow-y-auto">
      {available.map((t) => (
        <button key={t.id} className="flex items-center gap-2 w-full px-2.5 py-1 text-[11px] hover:bg-muted text-left transition-colors"
          onClick={(e) => { e.stopPropagation(); onSelect(t.codigo); onClose() }}>
          <span className="size-2 rounded-full shrink-0" style={{ background: resolveColorT(t.color) }} />
          <span className="truncate">{t.nombre_es}</span>
        </button>
      ))}
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

  if (!data) return null

  const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
  const ROLE_LABEL_MAP: Record<string, string> = {}
  for (const d of data.departments ?? []) { if (!d.parent_id) ROLE_LABEL_MAP[d.code] = d.name }

  const activeStaff = staffList
    .filter((s) => s.onboarding_status !== "inactive")
    .sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
    })

  const [localDays, setLocalDays] = useState(data.days)
  // Register this grid's day setter for direct undo/redo updates
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

  // Task mode
  const isTaskMode = data?.rotaDisplayMode === "by_task"
  const tecnicaByCodeT = Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.codigo, t]))
  const defaultShiftCodeT = (data?.shiftTypes?.[0]?.code ?? "T1") as import("@/app/(clinic)/rota/actions").ShiftType

  // Multi-assignment map: staffId → date → Assignment[]
  const taskAssignMapT: Record<string, Record<string, Assignment[]>> = {}
  if (isTaskMode) {
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!taskAssignMapT[a.staff_id]) taskAssignMapT[a.staff_id] = {}
        if (!taskAssignMapT[a.staff_id][day.date]) taskAssignMapT[a.staff_id][day.date] = []
        taskAssignMapT[a.staff_id][day.date].push(a)
      }
    }
  }

  // Whole-team by date
  const wholeTeamByDateT: Record<string, Assignment[]> = {}
  if (isTaskMode) {
    for (const day of localDays) {
      wholeTeamByDateT[day.date] = day.assignments.filter((a) => a.whole_team && a.function_label)
    }
  }

  const [pickerStateT, setPickerStateT] = useState<{ staffId: string | null; date: string } | null>(null)

  async function handleTaskRemoveT(assignmentId: string) {
    setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) })))
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
  }

  async function handleTaskAddT(staffId: string | null, date: string, tecnicaCodigo: string) {
    const tempId = `temp-${Date.now()}-${Math.random()}`
    const staffMember = staffId ? allMembers.find((s) => s.id === staffId) : null
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId ?? "", shift_type: defaultShiftCodeT,
        is_manual_override: true, trainee_staff_id: null, notes: null,
        function_label: tecnicaCodigo, tecnica_id: null, whole_team: staffId === null,
        staff: staffMember ? { id: staffMember.id, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never } : { id: "", first_name: "All", last_name: "", role: "lab" as never },
      }],
    }))
    const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: staffId ?? "", date, shiftType: defaultShiftCodeT, functionLabel: tecnicaCodigo })
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

        {/* Header: empty corner + ALL column (task mode) + staff names */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-20" style={{ minHeight: 48 }} />
        {isTaskMode && (
          <div className="border-b border-r border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1">
            <span className={cn("font-semibold text-muted-foreground text-center", compact ? "text-[9px]" : "text-[10px]")}>ALL</span>
          </div>
        )}
        {allMembers.map((s, i) => {
          // Check if this is the first in a new role group
          const prevRole = i > 0 ? allMembers[i - 1].role : null
          const isNewGroup = s.role !== prevRole
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
              {/* Day label cell — click opens day view */}
              <div
                className={cn(
                  "border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center justify-end gap-1.5 px-2 cursor-pointer hover:bg-muted/80",
                  holiday && "bg-amber-50/60"
                )}
                style={isSat ? { borderTop: "1px dashed var(--border)" } : undefined}
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
              {isTaskMode && (() => {
                const assigns = wholeTeamByDateT[day.date] ?? []
                const assignedCodes = new Set(assigns.map((a) => a.function_label!).filter(Boolean))
                const isOpen = pickerStateT?.staffId === null && pickerStateT?.date === day.date
                return (
                  <div
                    className={cn("border-b border-r border-border relative flex flex-wrap gap-0.5 items-center bg-background transition-colors", compact ? "px-0.5 py-0 min-h-[22px]" : "px-0.5 py-0.5 min-h-[28px]", !isPublished && "cursor-pointer hover:bg-muted/30")}
                    onClick={!isPublished ? () => setPickerStateT(isOpen ? null : { staffId: null, date: day.date }) : undefined}
                  >
                    {assigns.map((a) => {
                      const tec = tecnicaByCodeT[a.function_label!]
                      return <TaskChipT key={a.id} label={a.function_label!} color={tec ? resolveColorT(tec.color) : "#94A3B8"} onRemove={!isPublished ? () => handleTaskRemoveT(a.id) : undefined} />
                    })}
                    {!isPublished && !isOpen && <span className="inline-flex items-center justify-center size-4 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Plus className="size-3" /></span>}
                    {isOpen && <TaskPickerT tecnicas={data?.tecnicas ?? []} assigned={assignedCodes} onSelect={(c) => handleTaskAddT(null, day.date, c)} onClose={() => setPickerStateT(null)} />}
                  </div>
                )
              })()}

              {/* Staff cells for this day */}
              {allMembers.map((s, i) => {
                const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)

                // ── Task mode cell ──────────────────────────────────────────
                if (isTaskMode) {
                  const taskAssigns = (taskAssignMapT[s.id]?.[day.date] ?? []).filter((a) => a.function_label && !a.function_label.startsWith("dept_") && !a.whole_team)
                  const assignedCodes = new Set(taskAssigns.map((a) => a.function_label!))
                  const isOpen = pickerStateT?.staffId === s.id && pickerStateT?.date === day.date
                  const isLast = i === allMembers.length - 1
                  return (
                    <div
                      key={s.id}
                      className={cn("border-b border-r border-border relative flex flex-wrap gap-0.5 items-center bg-background transition-colors", isLast && "last:border-r-0", compact ? "px-0.5 py-0 min-h-[22px]" : "px-0.5 py-0.5 min-h-[28px]", onLeave && "bg-muted/20", !isPublished && !onLeave && "cursor-pointer hover:bg-muted/30")}
                      onClick={!isPublished && !onLeave ? () => setPickerStateT(isOpen ? null : { staffId: s.id, date: day.date }) : undefined}
                    >
                      {onLeave ? (
                        <span className={cn("text-muted-foreground italic w-full text-center", compact ? "text-[9px]" : "text-[11px]")}>{t("leaveShort")}</span>
                      ) : (
                        <>
                          {taskAssigns.map((a) => {
                            const tec = tecnicaByCodeT[a.function_label!]
                            return <TaskChipT key={a.id} label={a.function_label!} color={tec ? resolveColorT(tec.color) : "#94A3B8"} onRemove={!isPublished ? () => handleTaskRemoveT(a.id) : undefined} />
                          })}
                          {!isPublished && !isOpen && <span className="inline-flex items-center justify-center size-4 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"><Plus className="size-3" /></span>}
                          {isOpen && <TaskPickerT tecnicas={data?.tecnicas ?? []} assigned={assignedCodes} onSelect={(c) => handleTaskAddT(s.id, day.date, c)} onClose={() => setPickerStateT(null)} />}
                        </>
                      )}
                    </div>
                  )
                }

                // ── Shift mode cell (existing logic) ────────────────────────
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
