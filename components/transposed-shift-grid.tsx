"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase, Hourglass } from "lucide-react"
import { DndContext, DragOverlay, useDraggable, useDroppable, useSensor, useSensors, PointerSensor, type DragEndEvent } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { toast } from "sonner"
import { moveAssignment, moveAssignmentShift, removeAssignment } from "@/app/(clinic)/rota/actions"
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
  compact, colorChips = true, timeFormat = "24h", onCellClick, onChipClick, onRefresh,
}: TransposedShiftGridProps) {
  const t = useTranslations("schedule")
  const { hoveredStaffId, setHovered } = useStaffHover()
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const localDays = data?.days ?? []
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

  if (!data || localDays.length === 0) return null

  const gridCols = `120px repeat(${shiftCodes.length}, 1fr) minmax(80px, 1fr)`

  // Find assignment by DnD ID
  function findAssignment(id: string) {
    for (const day of localDays) {
      const a = day.assignments.find((a) => a.id === id)
      if (a) return { assignment: a, date: day.date }
    }
    return null
  }

  async function handleDragEnd(e: DragEndEvent) {
    setActiveId(null)
    if (!e.over || isPublished) return
    const src = findAssignment(String(e.active.id))
    if (!src) return
    const targetId = String(e.over.id) // format: "shiftCode-date" e.g. "A-2026-03-29"
    // Extract date (YYYY-MM-DD) from the end, shift code is everything before it
    const dateMatch = targetId.match(/(\d{4}-\d{2}-\d{2})$/)
    const targetDate = dateMatch ? dateMatch[1] : ""
    const targetShift = targetDate ? targetId.slice(0, targetId.length - targetDate.length - 1) : targetId
    if (!targetDate) return

    if (targetDate !== src.date) {
      // Move to different day
      const result = await moveAssignment(src.assignment.id, targetDate)
      if (result.error) toast.error(result.error)
      else onRefresh?.()
    } else if (targetShift !== src.assignment.shift_type && targetShift !== "OFF") {
      // Change shift on same day
      const result = await moveAssignmentShift(src.assignment.id, targetShift)
      if (result.error) toast.error(result.error)
      else onRefresh?.()
    }
  }

  const activeAssignment = activeId ? findAssignment(activeId) : null

  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActiveId(String(e.active.id))} onDragEnd={handleDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="overflow-auto flex-1 rounded-lg border border-border">
        <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: gridCols }}>
          {/* Header row */}
          <div className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2" />
          {shiftCodes.map((code) => {
            const st = shiftTypeMap[code]
            return (
              <div key={code} className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-center">
                <p className="text-[13px] font-semibold text-foreground">{code}</p>
                {st && (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}
                  </p>
                )}
              </div>
            )
          })}
          <div className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-center">
            <p className="text-[11px] font-semibold text-muted-foreground">OFF</p>
          </div>

          {/* Day rows */}
          {localDays.map((day) => {
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
                        "border-b border-border p-1 flex flex-col gap-0.5",
                        isSat && "border-t border-dashed",
                        !isActive && "bg-muted/30",
                        isActive && !isPublished && "cursor-pointer hover:bg-accent/10"
                      )}
                    >
                      {!isActive ? null : dayShifts.map((a) => {
                        const isHov = hoveredStaffId === a.staff_id
                        const sColor = staffColorMap[a.staff_id]
                        const taskDisabled = data?.rotaDisplayMode === "by_shift" && !(data as any)?.enableTaskInShift
                        const cleanFn = a.function_label?.startsWith("dept_") ? null : a.function_label
                        const tec = (!taskDisabled && cleanFn) ? tecnicas.find((tc) => tc.codigo === cleanFn) : null
                        const pillColor = tec ? TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue : null

                        return (
                          <DraggablePill key={a.id} id={a.id} disabled={isPublished}>
                            <div
                              className={cn(
                                "flex items-center gap-1 rounded border border-border bg-background text-foreground font-medium cursor-pointer transition-colors duration-150",
                                compact ? "px-1 py-0 text-[10px] min-h-[20px]" : "px-1.5 py-0.5 text-[11px] min-h-[24px]"
                              )}
                              style={{
                                borderLeft: colorChips
                                  ? `3px solid ${ROLE_BORDER[a.staff.role] ?? "#94A3B8"}`
                                  : undefined,
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
                  className={cn("border-b border-border p-1 flex flex-col gap-0.5 bg-muted/20", isSat && "border-t border-dashed")}
                >
                  {[...leaveIds].map((sid) => {
                    const s = staffList.find((st) => st.id === sid)
                    if (!s) return null
                    return (
                      <div key={sid} className={cn("flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5", compact ? "py-0 text-[10px]" : "py-0.5 text-[11px]")}>
                        <Briefcase className="size-2.5 text-amber-500 shrink-0" />
                        <span className="truncate text-amber-700">{s.first_name} {s.last_name[0]}.</span>
                      </div>
                    )
                  })}
                  {offStaff.slice(0, compact ? 3 : 5).map((s) => (
                    <div
                      key={s.id}
                      className={cn("flex items-center gap-1 rounded border border-border/50 px-1.5 text-muted-foreground", compact ? "py-0 text-[10px]" : "py-0.5 text-[11px]")}
                      onMouseEnter={() => setHovered(s.id)}
                      onMouseLeave={() => setHovered(null)}
                      style={colorChips && hoveredStaffId === s.id && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : undefined}
                    >
                      <span className="truncate">{s.first_name} {s.last_name[0]}.</span>
                    </div>
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
      <DragOverlay>
        {activeAssignment && (
          <div className="opacity-90 shadow-lg rounded border border-border bg-background px-2 py-1 text-[11px] font-medium"
            style={{
              borderLeft: colorChips
                ? `3px solid ${ROLE_BORDER[activeAssignment.assignment.staff.role] ?? "#94A3B8"}`
                : "3px solid #D4D4D8",
              borderRadius: 4,
            }}
          >
            {activeAssignment.assignment.staff.first_name} {activeAssignment.assignment.staff.last_name[0]}.
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}
