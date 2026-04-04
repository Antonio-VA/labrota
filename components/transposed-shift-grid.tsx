"use client"

import { useCallback, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase, Hourglass } from "lucide-react"
import { DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { moveAssignment, moveAssignmentShift, removeAssignment, upsertAssignment } from "@/app/(clinic)/rota/actions"
import { useStaffHover } from "@/components/staff-hover-context"
import type { StaffWithSkills, ShiftType, Tecnica } from "@/lib/types/database"
import type { RotaWeekData, ShiftTimes } from "@/app/(clinic)/rota/actions"

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
const ROLE_BORDER: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

const TECNICA_PILL: Record<string, string> = {
  amber: "bg-amber-500/10 border-amber-500/30 text-amber-600",
  blue: "bg-blue-500/10 border-blue-500/30 text-blue-600",
  green: "bg-green-500/10 border-green-500/30 text-green-600",
  purple: "bg-purple-500/10 border-purple-500/30 text-purple-600",
  coral: "bg-red-500/10 border-red-500/30 text-red-600",
  teal: "bg-teal-500/10 border-teal-500/30 text-teal-600",
  slate: "bg-muted border-border text-muted-foreground",
  red: "bg-red-500/10 border-red-500/30 text-red-600",
}

interface TransposedShiftGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  publicHolidays: Record<string, string>
  onLeaveByDate: Record<string, string[]>
  compact?: boolean
  colorChips?: boolean
  timeFormat?: string
  loading?: boolean
  onCellClick?: (date: string) => void
  onChipClick?: (assignment: { staff_id: string }, date: string) => void
  onRefresh?: () => void
}

// Draggable pill
function DraggablePill({ id, children, disabled }: { id: string; children: React.ReactNode; disabled?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id, disabled })
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={cn(isDragging && "opacity-30")}>
      {children}
    </div>
  )
}

// Droppable cell
function DroppableCell({ id, children, className, style }: { id: string; children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  const { setNodeRef, isOver } = useDroppable({ id })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-primary/30 ring-inset")} style={style}>
      {children}
    </div>
  )
}

export function TransposedShiftGrid({
  data, staffList, locale, isPublished, shiftTimes, publicHolidays, onLeaveByDate,
  compact, colorChips = true, timeFormat = "24h", loading, onCellClick, onChipClick, onRefresh,
}: TransposedShiftGridProps) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")

  // Loading skeleton — days as rows, shift codes as columns
  if (loading) {
    const skelShifts = 4
    const skelGridCols = `120px repeat(${skelShifts}, 1fr) minmax(80px, 1fr)`
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="overflow-auto flex-1 rounded-lg border border-border">
          <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: skelGridCols }}>
            {/* Header row */}
            <div className="sticky top-0 z-10 border-b border-r border-border bg-muted h-[48px]" />
            {Array.from({ length: skelShifts }).map((_, i) => (
              <div key={i} className="sticky top-0 z-10 border-b border-l border-border bg-muted px-2 py-2 flex flex-col items-center gap-1">
                <div className="shimmer-bar h-3 w-8" />
                <div className="shimmer-bar h-2.5 w-14 rounded" />
              </div>
            ))}
            <div className="sticky top-0 z-10 border-b border-l border-border bg-muted px-2 py-2 flex items-center justify-center">
              <div className="shimmer-bar h-3 w-8" />
            </div>

            {/* Day rows */}
            {Array.from({ length: 7 }).map((_, row) => (
              <>
                <div key={`h-${row}`} className="border-b border-r border-border bg-muted px-2 py-2 flex items-center justify-end gap-1.5 sticky left-0 z-10">
                  <div className="shimmer-bar h-2.5 w-6" />
                  <div className="shimmer-bar w-6 h-6 rounded-full" />
                </div>
                {Array.from({ length: skelShifts }).map((_, col) => (
                  <div key={col} className={`border-b border-l border-border p-1 min-h-[48px] flex flex-col gap-0.5 ${row >= 5 ? "opacity-50" : ""}`}>
                    <div className="shimmer-bar h-5 w-full rounded" />
                    <div className="shimmer-bar h-5 w-3/4 rounded" />
                  </div>
                ))}
                <div key={`off-${row}`} className={`border-b border-l border-border p-1 min-h-[48px] ${row >= 5 ? "opacity-50" : ""}`}>
                  <div className="shimmer-bar h-5 w-full rounded" />
                </div>
              </>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center py-1">
          <span className="generating-label text-[13px] text-muted-foreground">
            {tc("loading")}
          </span>
        </div>
      </div>
    )
  }
  const { hoveredStaffId, setHovered } = useStaffHover()
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const shiftTypes = data?.shiftTypes ?? []
  const shiftCodes = shiftTypes.filter((s) => s.active !== false).map((s) => s.code)
  const shiftTypeMap = Object.fromEntries(shiftTypes.map((s) => [s.code, s]))
  const tecnicas = data?.tecnicas ?? []

  const visibleStaffIds = useMemo(() => new Set(staffList.map((s) => s.id)), [staffList])

  // Staff → department colour map
  const staffColorMap = useMemo(() => {
    const deptColors: Record<string, string> = {}
    for (const dept of (data?.departments ?? [])) deptColors[dept.code] = dept.colour
    const map: Record<string, string> = {}
    for (const s of staffList) map[s.id] = deptColors[s.role] ?? ROLE_BORDER[s.role] ?? "#94A3B8"
    return map
  }, [staffList, data?.departments])

  const today = new Date().toISOString().split("T")[0]

  // Local optimistic state — mirrors data.days but allows instant UI updates
  type DayData = NonNullable<typeof data>["days"][0]
  const [localDays, setLocalDays] = useState<DayData[]>([])
  const prevDataRef = useMemo(() => ({ days: data?.days }), [data?.days])
  if (data?.days && data.days !== prevDataRef.days) {
    // Sync from server when data changes
    // Using this pattern to avoid useEffect flash
  }
  const days = data?.days ?? localDays
  // Keep localDays synced with server data
  const daysToRender = useMemo(() => {
    if (localDays.length > 0) return localDays
    return data?.days ?? []
  }, [localDays, data?.days])

  // Sync local days from server data
  const syncFromServer = useCallback(() => {
    setLocalDays(data?.days ?? [])
  }, [data?.days])

  // Initialize local days from data
  useMemo(() => {
    if (data?.days) setLocalDays(data.days)
  }, [data?.days])

  if (!data || daysToRender.length === 0) return null

  const gridCols = `120px repeat(${shiftCodes.length}, 1fr) minmax(80px, 1fr)`

  // Parse drop target ID: "T1-2026-03-30" → { shift: "T1", date: "2026-03-30" }
  function parseDropId(id: string): { shift: string; date: string } | null {
    const dateMatch = id.match(/(\d{4}-\d{2}-\d{2})$/)
    if (!dateMatch) return null
    const date = dateMatch[1]
    const shift = id.slice(0, id.length - date.length - 1)
    return { shift, date }
  }

  // Find assignment by DnD ID
  function findAssignment(id: string) {
    for (const day of daysToRender) {
      const a = day.assignments.find((a) => a.id === id)
      if (a) return { assignment: a, date: day.date }
    }
    return null
  }

  // Optimistic: move assignment to a different date (keeping same shift)
  function optimisticMoveDate(assignmentId: string, fromDate: string, toDate: string) {
    setLocalDays((prev) => {
      const next = prev.map((d) => ({ ...d, assignments: [...d.assignments] }))
      const srcDay = next.find((d) => d.date === fromDate)
      const destDay = next.find((d) => d.date === toDate)
      if (!srcDay || !destDay) return prev
      const idx = srcDay.assignments.findIndex((a) => a.id === assignmentId)
      if (idx === -1) return prev
      const [moved] = srcDay.assignments.splice(idx, 1)
      destDay.assignments.push(moved)
      return next
    })
  }

  // Optimistic: change shift on same day
  function optimisticChangeShift(assignmentId: string, date: string, newShift: string) {
    setLocalDays((prev) =>
      prev.map((d) =>
        d.date === date
          ? { ...d, assignments: d.assignments.map((a) => a.id === assignmentId ? { ...a, shift_type: newShift } : a) }
          : d
      )
    )
  }

  // Optimistic: remove assignment (move to OFF)
  function optimisticRemove(assignmentId: string, date: string) {
    setLocalDays((prev) =>
      prev.map((d) =>
        d.date === date
          ? { ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) }
          : d
      )
    )
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    if (!e.over || isPublished) return

    const activeIdStr = String(e.active.id)
    const targetId = String(e.over.id)
    const target = parseDropId(targetId)
    if (!target) return

    // Dragging from OFF into a shift cell
    if (activeIdStr.startsWith("off-")) {
      const staffId = activeIdStr.slice(4)
      if (target.shift === "OFF") return
      // Optimistic: add to target cell
      const staff = staffList.find((s) => s.id === staffId)
      if (!staff) return
      const tempId = `temp-${Date.now()}`
      setLocalDays((prev) =>
        prev.map((d) =>
          d.date === target.date
            ? {
                ...d,
                assignments: [...d.assignments, {
                  id: tempId,
                  staff_id: staffId,
                  shift_type: target.shift,
                  is_manual_override: true,
                  trainee_staff_id: null,
                  notes: null,
                  function_label: null,
                  tecnica_id: null,
                  whole_team: false,
                  staff: { id: staffId, first_name: staff.first_name, last_name: staff.last_name, role: staff.role },
                }],
              }
            : d
        )
      )
      const result = await upsertAssignment({ weekStart: data!.weekStart, staffId, date: target.date, shiftType: target.shift })
      if (result.error) { toast.error(result.error); syncFromServer() }
      else onRefresh?.()
      return
    }

    // Dragging existing assignment
    const src = findAssignment(activeIdStr)
    if (!src) return

    // Drop onto OFF = remove
    if (target.shift === "OFF") {
      optimisticRemove(src.assignment.id, src.date)
      const result = await removeAssignment(src.assignment.id)
      if (result.error) { toast.error(result.error); syncFromServer() }
      else onRefresh?.()
      return
    }

    // Move to different day (keep or change shift)
    if (target.date !== src.date) {
      optimisticMoveDate(src.assignment.id, src.date, target.date)
      if (target.shift !== src.assignment.shift_type) {
        optimisticChangeShift(src.assignment.id, target.date, target.shift)
      }
      const result = await moveAssignment(src.assignment.id, target.date)
      if (result.error) { toast.error(result.error); syncFromServer() }
      else {
        // Also change shift if needed
        if (target.shift !== src.assignment.shift_type) {
          const r2 = await moveAssignmentShift(src.assignment.id, target.shift)
          if (r2.error) toast.error(r2.error)
        }
        onRefresh?.()
      }
      return
    }

    // Same day, different shift
    if (target.shift !== src.assignment.shift_type) {
      optimisticChangeShift(src.assignment.id, src.date, target.shift)
      const result = await moveAssignmentShift(src.assignment.id, target.shift)
      if (result.error) { toast.error(result.error); syncFromServer() }
      else onRefresh?.()
    }
  }

  const activeAssignment = activeId ? findAssignment(activeId) : null
  const activeOffStaff = activeId?.startsWith("off-")
    ? staffList.find((s) => s.id === activeId.slice(4))
    : null

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="overflow-auto flex-1 rounded-lg border border-border">
        <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: gridCols }}>
          {/* Header row */}
          <div className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2" />
          {shiftCodes.map((code) => {
            const st = shiftTypeMap[code]
            return (
              <div key={code} className="sticky top-0 z-10 border-b border-l border-border bg-muted px-2 py-2 text-center">
                <p className="text-[13px] font-semibold text-foreground">{code}</p>
                {st && (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}
                  </p>
                )}
              </div>
            )
          })}
          <div className="sticky top-0 z-10 border-b border-l border-border bg-muted px-2 py-2 text-center">
            <p className="text-[11px] font-semibold text-muted-foreground">OFF</p>
          </div>

          {/* Day rows */}
          {daysToRender.map((day) => {
            const dow = new Date(day.date + "T12:00:00").getDay()
            const dayKey = DOW_KEYS[dow]
            const dayNum = new Date(day.date + "T12:00:00").getDate()
            const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(day.date + "T12:00:00"))
            const isToday = day.date === today
            const isSat = dow === 6
            const holiday = publicHolidays[day.date]
            const leaveIds = new Set(onLeaveByDate[day.date] ?? [])
            const offStaff = staffList.filter((s) => !day.assignments.some((a) => a.staff_id === s.id) && !leaveIds.has(s.id) && visibleStaffIds.has(s.id))

            return (
              <>
                {/* Row header — matches transposed PersonGrid style */}
                <div
                  key={`h-${day.date}`}
                  className={cn(
                    "border-b border-r border-border px-2 py-2 flex items-center justify-end gap-1.5 bg-muted sticky left-0 z-10 cursor-pointer hover:bg-muted/80",
                    holiday && "bg-amber-50/60"
                  )}
                  style={isSat ? { borderTop: "1px dashed var(--border)" } : undefined}
                  onClick={() => onCellClick?.(day.date)}
                >
                  {day.warnings.length > 0 && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground uppercase">{wday}</span>
                    <span className={cn(
                      "font-semibold leading-none",
                      isToday ? "size-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[12px]" : "text-[16px] text-primary"
                    )}>
                      {dayNum}
                    </span>
                  </div>
                  {holiday && (
                    <Tooltip>
                      <TooltipTrigger render={<span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>} />
                      <TooltipContent side="right">{holiday}</TooltipContent>
                    </Tooltip>
                  )}
                </div>

                {/* Shift cells */}
                {shiftCodes.map((code) => {
                  const st = shiftTypeMap[code]
                  const activeDays = st?.active_days ?? [...DOW_KEYS]
                  const isActive = activeDays.includes(dayKey)
                  const cellId = `${code}-${day.date}`
                  const dayShifts = day.assignments
                    .filter((a) => a.shift_type === code && visibleStaffIds.has(a.staff_id))
                    .sort((a, b) => a.staff.first_name.localeCompare(b.staff.first_name))

                  return (
                    <DroppableCell
                      key={cellId}
                      id={cellId}
                      className={cn(
                        "border-b border-l border-border p-1 flex flex-col gap-0.5",
                        isSat && "border-t border-dashed",
                        !isActive && "bg-muted/30",
                        isActive && !isPublished && "cursor-pointer hover:bg-accent/10"
                      )}
                    >
                      {!isActive ? null : dayShifts.map((a) => {
                        const isHov = hoveredStaffId === a.staff_id
                        const sColor = staffColorMap[a.staff_id]
                        const taskDisabled = data?.rotaDisplayMode === "by_shift" && !data?.enableTaskInShift
                        const cleanFn = a.function_label?.startsWith("dept_") ? null : a.function_label
                        const tec = (!taskDisabled && cleanFn) ? tecnicas.find((tc) => tc.codigo === cleanFn) : null
                        const pillColor = tec ? TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue : null

                        return (
                          <DraggablePill key={a.id} id={a.id} disabled={isPublished}>
                            <div
                              className={cn(
                                "flex items-center gap-1 rounded border border-transparent hover:border-border bg-background text-foreground font-medium cursor-pointer transition-colors duration-150",
                                compact ? "px-1 py-0 text-[10px] min-h-[20px]" : "px-1.5 py-0.5 text-[11px] min-h-[24px]"
                              )}
                              style={{
                                borderRadius: 4,
                                ...(isHov && sColor ? { backgroundColor: sColor, color: "#1e293b" } : {}),
                              }}
                              onMouseEnter={() => setHovered(a.staff_id)}
                              onMouseLeave={() => setHovered(null)}
                              onClick={(e) => { e.stopPropagation(); onChipClick?.({ staff_id: a.staff_id }, day.date) }}
                            >
                              <span className="truncate">{a.staff.first_name} {a.staff.last_name[0]}.</span>
                              {tec && pillColor && (
                                <span className={cn("font-semibold px-0.5 py-0 rounded border ml-auto shrink-0 text-[8px]", pillColor)}>
                                  {tec.codigo}
                                </span>
                              )}
                            </div>
                          </DraggablePill>
                        )
                      })}
                    </DroppableCell>
                  )
                })}

                {/* OFF column */}
                <DroppableCell
                  key={`OFF-${day.date}`}
                  id={`OFF-${day.date}`}
                  className={cn("border-b border-l border-border p-1 flex flex-col gap-0.5", isSat && "border-t border-dashed")}
                  style={{ backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" }}
                >
                  {[...leaveIds].map((sid) => {
                    const s = staffList.find((st) => st.id === sid)
                    if (!s) return null
                    return (
                      <div key={sid} className={cn("flex items-center gap-1 rounded border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-1.5", compact ? "py-0 text-[10px]" : "py-0.5 text-[11px]")}>
                        <Briefcase className="size-2.5 text-amber-500 shrink-0" />
                        <span className="truncate text-amber-700">{s.first_name} {s.last_name[0]}.</span>
                      </div>
                    )
                  })}
                  {offStaff.slice(0, compact ? 3 : 5).map((s) => (
                    <DraggablePill key={s.id} id={`off-${s.id}`} disabled={isPublished}>
                      <div
                        className={cn(
                          "flex items-center gap-1 rounded border border-border/50 px-1.5 text-muted-foreground transition-colors duration-150 bg-background",
                          compact ? "py-0 text-[10px]" : "py-0.5 text-[11px]",
                          !isPublished && "cursor-grab hover:bg-accent/30"
                        )}
                        onMouseEnter={() => setHovered(s.id)}
                        onMouseLeave={() => setHovered(null)}
                        style={hoveredStaffId === s.id && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : undefined}
                      >
                        <span className="truncate">{s.first_name} {s.last_name[0]}.</span>
                      </div>
                    </DraggablePill>
                  ))}
                  {offStaff.length > (compact ? 3 : 5) && (
                    <span className="text-[9px] text-muted-foreground/50 self-center">+{offStaff.length - (compact ? 3 : 5)}</span>
                  )}
                </DroppableCell>
              </>
            )
          })}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay dropAnimation={null}>
        {activeAssignment && (
          <div className="opacity-90 shadow-lg rounded border border-border bg-background px-2 py-1 text-[11px] font-medium"
            style={{
              borderLeft: `3px solid ${ROLE_BORDER[activeAssignment.assignment.staff.role] ?? "#94A3B8"}`,
              borderRadius: 4,
            }}
          >
            {activeAssignment.assignment.staff.first_name} {activeAssignment.assignment.staff.last_name[0]}.
          </div>
        )}
        {activeOffStaff && (
          <div className="opacity-90 shadow-lg rounded border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground"
            style={{
              borderLeft: `3px solid ${ROLE_BORDER[activeOffStaff.role] ?? "#94A3B8"}`,
              borderRadius: 4,
            }}
          >
            {activeOffStaff.first_name} {activeOffStaff.last_name[0]}.
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
