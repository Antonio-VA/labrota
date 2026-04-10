"use client"

import { useMemo, useState, useRef, useEffect, Fragment } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { AlertTriangle, Plus, X } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { removeAssignment, upsertAssignment, type RotaWeekData, type RotaDay } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "@/components/calendar-panel/types"
import { ROLE_ORDER, DEFAULT_DEPT_MAPS } from "@/components/calendar-panel/constants"
import { TODAY } from "@/components/calendar-panel/constants"

// ── Helpers ───────────────────────────────────────────────────────────────────

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

/** One staff × one day task cell — manages its own picker portal */
function TaskPersonCell({
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

// ── Main component ────────────────────────────────────────────────────────────

interface TaskPersonGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  publicHolidays: Record<string, string>
  onLeaveByDate: Record<string, string[]>
  compact?: boolean
  colorChips?: boolean
  loading?: boolean
  onChipClick?: (staff_id: string) => void
  onDateClick?: (date: string) => void
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}

export function TaskPersonGrid({
  data, staffList, locale, isPublished, publicHolidays, onLeaveByDate,
  compact, colorChips = true, loading, onChipClick, onDateClick, gridSetDaysRef,
}: TaskPersonGridProps) {
  const t = useTranslations("schedule")

  // Loading skeleton
  if (loading) {
    const skelStaff = 8
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="rounded-lg border border-border overflow-auto w-full">
          <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${skelStaff}, minmax(${compact ? "48px" : "60px"}, 1fr))`, minWidth: skelStaff * (compact ? 53 : 65) + 80 }}>
            <div className="border-b border-r border-border bg-muted" style={{ minHeight: 48 }} />
            {Array.from({ length: skelStaff }).map((_, i) => (
              <div key={i} className="border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1 gap-1">
                <div className="shimmer-bar h-2.5 w-10" />
                <div className="shimmer-bar h-2 w-4" />
              </div>
            ))}
            {Array.from({ length: 7 }).map((_, row) => (
              <Fragment key={row}>
                <div className="border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center justify-end gap-1 px-1.5">
                  <div className="shimmer-bar h-2.5 w-5" />
                  <div className="shimmer-bar w-5 h-5 rounded-full" />
                </div>
                {Array.from({ length: skelStaff }).map((_, col) => (
                  <div key={col} className={cn("border-b border-r last:border-r-0 border-border flex flex-wrap gap-0.5 items-start content-start p-0.5", compact ? "min-h-[22px]" : "min-h-[32px]")}>
                    <div className="shimmer-bar h-4 w-7 rounded" />
                    {col % 3 === 0 && <div className="shimmer-bar h-4 w-6 rounded" />}
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredTecnica, setHoveredTecnica] = useState<string | null>(null)

  const [localDays, setLocalDays] = useState(data?.days ?? [])
  if (gridSetDaysRef) gridSetDaysRef.current = setLocalDays
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setLocalDays(data?.days ?? [])
  }

  const tecnicas = useMemo(() => (data?.tecnicas ?? []).filter((t) => t.activa).sort((a, b) => a.orden - b.orden), [data?.tecnicas])
  const tecnicaByCode = useMemo(() => Object.fromEntries(tecnicas.map((t) => [t.codigo, t])), [tecnicas])
  const defaultShiftCode = (data?.shiftTypes?.[0]?.code ?? "T1") as import("@/lib/types/database").ShiftType

  const deptLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of (data?.departments ?? [])) { if (!d.parent_id) m[d.code] = d.name }
    return m
  }, [data?.departments])

  // Multi-assignment map: staffId → date → Assignment[]
  const taskAssignMap = useMemo(() => {
    const map: Record<string, Record<string, Assignment[]>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!map[a.staff_id]) map[a.staff_id] = {}
        if (!map[a.staff_id][day.date]) map[a.staff_id][day.date] = []
        map[a.staff_id][day.date].push(a)
      }
    }
    return map
  }, [localDays])

  // Whole-team by date
  const wholeTeamByDate = useMemo(() => {
    const map: Record<string, Assignment[]> = {}
    for (const day of localDays) {
      map[day.date] = day.assignments.filter((a) => a.whole_team && a.function_label)
    }
    return map
  }, [localDays])

  async function handleTaskRemove(assignmentId: string) {
    setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) })))
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
  }

  async function handleTaskAdd(staffId: string | null, date: string, tecnicaCodigo: string) {
    const tempId = `temp-${Date.now()}-${Math.random()}`
    const staffMember = staffId ? activeStaff.find((s) => s.id === staffId) : null
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId ?? "", shift_type: defaultShiftCode,
        is_manual_override: true, trainee_staff_id: null, notes: null,
        function_label: tecnicaCodigo, tecnica_id: null, whole_team: staffId === null,
        staff: staffMember
          ? { id: staffMember.id, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never }
          : { id: "", first_name: "All", last_name: "", role: "lab" as never },
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

  const activeStaff = useMemo(() =>
    staffList
      .filter((s) => s.onboarding_status !== "inactive")
      .sort((a, b) => {
        const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
      })
  , [staffList])

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

  if (!data || localDays.length === 0) return null

  const gridCols = `80px minmax(${compact ? "48px" : "60px"}, 1fr) repeat(${activeStaff.length}, minmax(${compact ? "48px" : "60px"}, 1fr))`
  const totalCols = activeStaff.length + 2 // +1 for day label, +1 for ALL

  return (
    <div className="rounded-lg border border-border overflow-auto w-full">
      <div style={{ display: "grid", gridTemplateColumns: gridCols, minWidth: totalCols * (compact ? 53 : 65) + 80 }}>

        {/* Header: corner + ALL + staff names */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-20" style={{ minHeight: 48 }} />
        <div className="border-b border-r border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1">
          <span className={cn("font-semibold text-muted-foreground text-center", compact ? "text-[9px]" : "text-[10px]")}>ALL</span>
        </div>
        {activeStaff.map((s) => (
          <div
            key={s.id}
            className="border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1"
            style={colorChips ? { borderTop: `3px solid ${DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8"}` } : { borderTop: "none" }}
          >
            <button onClick={() => onChipClick?.(s.id)}
              className="flex flex-col items-center cursor-pointer hover:opacity-70 transition-opacity">
              <span className={cn("font-medium text-center leading-tight truncate w-full", compact ? "text-[9px]" : "text-[10px]")}>
                {s.first_name}
              </span>
              <span className={cn("text-muted-foreground text-center truncate w-full", compact ? "text-[8px]" : "text-[9px]")}>
                {s.last_name[0]}.
              </span>
            </button>
          </div>
        ))}

        {/* Day rows */}
        {localDays.map((day) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).slice(0, 2).toUpperCase()
          const dayN = String(d.getDate())
          const isToday = day.date === TODAY
          const holiday = publicHolidays[day.date]

          return (
            <Fragment key={day.date}>
              {/* Day label */}
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
                    isToday ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary"
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

              {/* ALL cell */}
              <TaskPersonCell
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

              {/* Staff cells */}
              {activeStaff.map((s, i) => {
                const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)
                const taskAssigns = (taskAssignMap[s.id]?.[day.date] ?? []).filter((a) => a.function_label && !a.function_label.startsWith("dept_") && !a.whole_team)
                return (
                  <TaskPersonCell
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
                    isLast={i === activeStaff.length - 1}
                    hoveredTecnica={hoveredTecnica}
                    highlightEnabled={highlightEnabled}
                    onHoveredChange={setHoveredTecnica}
                    onAdd={handleTaskAdd}
                    onRemove={handleTaskRemove}
                  />
                )
              })}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
