"use client"

import { useMemo, useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useStaffHover } from "@/components/staff-hover-context"
import { toast } from "sonner"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import { upsertAssignment, removeAssignment } from "@/app/(clinic)/rota/actions"

const COLOR_HEX: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}
function resolveColor(color: string): string {
  if (!color) return "#94A3B8"
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}

const ROLE_BORDER: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }
function resolveStaffColor(color: string): string {
  if (!color) return "#94A3B8"
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}

/** Inline popup to pick a staff member to assign to a tecnica cell */
function StaffPicker({ staffList, assignedIds, leaveIds, colorChips, staffColorMap, onSelect, onClose }: {
  staffList: StaffWithSkills[]
  assignedIds: Set<string>
  leaveIds: Set<string>
  colorChips: boolean
  staffColorMap: Record<string, string>
  onSelect: (staffId: string) => void
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

  const available = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id) && s.onboarding_status !== "inactive")
  if (available.length === 0) return null

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-0.5 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-[220px] overflow-y-auto"
    >
      {available.map((s) => {
        const sColor = staffColorMap[s.id]
        return (
          <button
            key={s.id}
            className="flex items-center gap-2 w-full px-2.5 py-1 text-[11px] hover:bg-muted text-left transition-colors"
            onClick={(e) => { e.stopPropagation(); onSelect(s.id); onClose() }}
          >
            {colorChips && sColor && (
              <span className="size-2 rounded-full shrink-0" style={{ background: sColor }} />
            )}
            <span className="truncate">{s.first_name} {s.last_name}</span>
          </button>
        )
      })}
    </div>
  )
}

interface TransposedTaskGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  publicHolidays: Record<string, string>
  onLeaveByDate: Record<string, string[]>
  compact?: boolean
  colorChips?: boolean
  loading?: boolean
  onRemoveAssignment?: (id: string) => void
  onCellClick?: (date: string, tecnicaCode: string) => void
  onChipClick?: (staff_id: string) => void
  onDateClick?: (date: string) => void
}

export function TransposedTaskGrid({
  data, staffList, locale, isPublished, publicHolidays, onLeaveByDate, compact,
  colorChips = true, loading, onRemoveAssignment, onCellClick, onChipClick, onDateClick,
}: TransposedTaskGridProps) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")

  // Loading skeleton
  if (loading) {
    const skelTecnicas = 5
    const skelGridCols = `100px repeat(${skelTecnicas}, minmax(80px, 1fr)) minmax(80px, 1fr)`
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="overflow-auto flex-1 rounded-lg border border-border">
          <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: skelGridCols }}>
            <div className="sticky top-0 z-10 border-b border-r border-border bg-muted h-[48px]" />
            {Array.from({ length: skelTecnicas }).map((_, i) => (
              <div key={i} className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2 flex flex-col items-center gap-1">
                <div className="shimmer-bar h-3 w-10 rounded" />
                <div className="shimmer-bar h-2 w-16 rounded" />
              </div>
            ))}
            <div className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 flex items-center justify-center">
              <div className="shimmer-bar h-3 w-8" />
            </div>
            {Array.from({ length: 7 }).map((_, row) => (
              <>
                <div key={`h-${row}`} className="border-b border-r border-border bg-muted px-2 py-1.5 flex items-center justify-end gap-1.5 sticky left-0 z-10">
                  <div className="shimmer-bar h-2.5 w-6" />
                  <div className="shimmer-bar w-5 h-5 rounded-full" />
                </div>
                {Array.from({ length: skelTecnicas }).map((_, col) => (
                  <div key={col} className="border-b border-r border-border px-1 py-1 min-h-[36px] flex flex-wrap gap-0.5 content-start">
                    <div className="shimmer-bar h-5 w-8 rounded" />
                  </div>
                ))}
                <div key={`off-${row}`} className="border-b border-border p-1 min-h-[36px]">
                  <div className="shimmer-bar h-5 w-full rounded" />
                </div>
              </>
            ))}
          </div>
        </div>
      </div>
    )
  }

  const { hoveredStaffId, setHovered } = useStaffHover()

  const tecnicas = useMemo(() => (data?.tecnicas ?? []).filter((t) => t.activa).sort((a, b) => a.orden - b.orden), [data?.tecnicas])
  const today = new Date().toISOString().split("T")[0]

  const visibleStaffIds = useMemo(() => new Set(staffList.map((s) => s.id)), [staffList])
  const staffColorMap = useMemo(() =>
    Object.fromEntries(staffList.map((s) => [s.id, s.color ? resolveStaffColor(s.color) : (ROLE_BORDER[s.role] ?? "#64748B")]))
  , [staffList])
  const staffMap = useMemo(() => Object.fromEntries(staffList.map((s) => [s.id, s])), [staffList])

  // Local state for optimistic updates
  const [localDays, setLocalDays] = useState<RotaDay[]>(data?.days ?? [])
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setLocalDays(data?.days ?? [])
  }

  // picker state: { date, tecnicaCodigo }
  const [pickerState, setPickerState] = useState<{ date: string; tecnicaCodigo: string } | null>(null)

  async function handleAdd(staffId: string, date: string, tecnicaCodigo: string) {
    const defaultShiftCode = (data?.shiftTypes?.[0]?.code ?? "T1") as import("@/app/(clinic)/rota/actions").ShiftType
    const tempId = `temp-${Date.now()}-${Math.random()}`
    const staffMember = staffMap[staffId]
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId, shift_type: defaultShiftCode,
        is_manual_override: true, trainee_staff_id: null, notes: null,
        function_label: tecnicaCodigo, tecnica_id: null, whole_team: false,
        staff: staffMember
          ? { id: staffMember.id, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never }
          : { id: staffId, first_name: "?", last_name: "", role: "lab" as never },
      }],
    }))
    const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId, date, shiftType: defaultShiftCode, functionLabel: tecnicaCodigo })
    if (result.error) {
      toast.error(result.error)
      setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== tempId) })))
    } else {
      setLocalDays((prev) => prev.map((d) => ({
        ...d,
        assignments: d.assignments.map((a) => a.id === tempId ? { ...a, id: result.id ?? tempId } : a),
      })))
    }
  }

  async function handleRemove(assignmentId: string) {
    setLocalDays((prev) => prev.map((d) => ({ ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId) })))
    onRemoveAssignment?.(assignmentId)
  }

  if (!data || localDays.length === 0 || tecnicas.length === 0) return null

  // Grid: day label + técnica columns + OFF column
  const gridCols = `100px repeat(${tecnicas.length}, minmax(80px, 1fr)) minmax(80px, 1fr)`

  return (
    <div className="overflow-auto flex-1 rounded-lg border border-border">
      <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: gridCols }}>
        {/* Header row: corner + técnica columns + OFF */}
        <div className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2" />
        {tecnicas.map((tec) => {
          const dotColor = resolveColor(tec.color)
          return (
            <div key={tec.id} className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                <span className="text-[12px] font-semibold text-foreground">{tec.codigo}</span>
              </div>
              <p className="text-[9px] text-muted-foreground truncate mt-0.5">{tec.nombre_es}</p>
            </div>
          )
        })}
        <div className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-center">
          <p className="text-[11px] font-semibold text-muted-foreground">OFF</p>
        </div>

        {/* Day rows */}
        {localDays.map((day) => {
          const dow = new Date(day.date + "T12:00:00").getDay()
          const dayNum = new Date(day.date + "T12:00:00").getDate()
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(day.date + "T12:00:00"))
          const isToday = day.date === today
          const isSat = dow === 6
          const isWeekend = dow === 0 || dow === 6
          const holiday = publicHolidays[day.date]
          const leaveIds = new Set(onLeaveByDate[day.date] ?? [])
          const hasWarnings = day.warnings.length > 0

          // Off staff: not assigned AND not on leave
          const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
          const offStaff = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id) && visibleStaffIds.has(s.id) && s.onboarding_status !== "inactive")

          return (
            <>
              {/* Row header: day */}
              <div
                key={`header-${day.date}`}
                onClick={() => onDateClick?.(day.date)}
                className={cn(
                  "border-b border-r border-border px-2 py-1.5 flex items-center justify-end gap-1.5 bg-muted sticky left-0 z-10",
                  onDateClick && "cursor-pointer hover:bg-muted/80",
                  holiday && "bg-amber-50/60"
                )}
                style={isSat ? { borderTop: "1px dashed var(--border)" } : undefined}
              >
                {hasWarnings && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase">{wday}</span>
                  <span className={cn(
                    "font-semibold leading-none",
                    isToday ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary"
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

              {/* Técnica cells */}
              {tecnicas.map((tec) => {
                const assignments = day.assignments.filter(
                  (a) => (a.function_label === tec.codigo || a.tecnica_id === tec.id) && visibleStaffIds.has(a.staff_id)
                )
                const assignedInCell = new Set(assignments.map((a) => a.staff_id))
                const isPickerOpen = pickerState?.date === day.date && pickerState?.tecnicaCodigo === tec.codigo

                return (
                  <div
                    key={`${day.date}-${tec.codigo}`}
                    className={cn(
                      "border-b border-r border-border px-1 py-1 relative flex flex-wrap gap-0.5 content-start",
                      isSat && "border-t border-dashed",
                      isWeekend && "bg-muted/30",
                    )}
                  >
                    {assignments.map((a) => {
                      const sColor = staffColorMap[a.staff_id]
                      const isHov = hoveredStaffId === a.staff_id
                      return (
                        <Tooltip key={a.id}>
                          <TooltipTrigger render={
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 rounded font-semibold bg-background group/chip transition-colors duration-100 cursor-pointer",
                                compact ? "text-[9px] px-1 py-0.5 min-h-[20px]" : "text-[10px] px-1.5 py-0.5 min-h-[24px]"
                              )}
                              style={colorChips ? {
                                border: `1px solid ${sColor}40`,
                                borderLeft: `3px solid ${sColor}`,
                                borderRadius: 4,
                                ...(isHov ? { backgroundColor: `${sColor}20` } : {}),
                              } : {
                                border: "1px solid var(--border)",
                                borderRadius: 4,
                              }}
                              onMouseEnter={() => setHovered(a.staff_id)}
                              onMouseLeave={() => setHovered(null)}
                              onClick={(e) => { e.stopPropagation(); onChipClick?.(a.staff_id) }}
                            >
                              {a.staff.first_name[0]}{a.staff.last_name[0]}
                              {!isPublished && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleRemove(a.id) }}
                                  className="text-[8px] text-muted-foreground/0 group-hover/chip:text-destructive transition-colors ml-0.5"
                                >×</button>
                              )}
                            </span>
                          } />
                          <TooltipContent side="top">
                            {a.staff.first_name} {a.staff.last_name} · {a.shift_type}
                          </TooltipContent>
                        </Tooltip>
                      )
                    })}
                    {!isPublished && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setPickerState(isPickerOpen ? null : { date: day.date, tecnicaCodigo: tec.codigo }) }}
                        className="inline-flex items-center justify-center size-5 rounded border border-dashed border-primary/30 text-primary text-[10px] hover:bg-primary/5 active:bg-primary/10 transition-colors"
                      ><Plus className="size-3" /></button>
                    )}
                    {isPickerOpen && (
                      <StaffPicker
                        staffList={staffList}
                        assignedIds={assignedInCell}
                        leaveIds={leaveIds}
                        colorChips={colorChips}
                        staffColorMap={staffColorMap}
                        onSelect={(staffId) => handleAdd(staffId, day.date, tec.codigo)}
                        onClose={() => setPickerState(null)}
                      />
                    )}
                  </div>
                )
              })}

              {/* OFF column — inline initials badges */}
              <div
                key={`off-${day.date}`}
                className={cn("border-b border-border p-1 flex flex-wrap gap-0.5 content-start bg-muted/20", isSat && "border-t border-dashed")}
              >
                {[...leaveIds].map((sid) => {
                  const s = staffList.find((st) => st.id === sid)
                  if (!s) return null
                  return (
                    <Tooltip key={sid}>
                      <TooltipTrigger render={
                        <span className={cn("inline-flex items-center gap-0.5 rounded border border-amber-200 bg-amber-50 px-1 font-medium text-amber-700", compact ? "text-[9px] py-0" : "text-[10px] py-0.5")}>
                          <Briefcase className="size-2.5 text-amber-500 shrink-0" />
                          {s.first_name[0]}{s.last_name[0]}
                        </span>
                      } />
                      <TooltipContent side="top">{s.first_name} {s.last_name}</TooltipContent>
                    </Tooltip>
                  )
                })}
                {offStaff.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  const sColor = staffColorMap[s.id]
                  return (
                    <Tooltip key={s.id}>
                      <TooltipTrigger render={
                        <span
                          className={cn("inline-flex items-center rounded border border-border/50 font-medium text-muted-foreground transition-colors duration-100 cursor-default", compact ? "text-[9px] px-1 py-0" : "text-[10px] px-1 py-0.5")}
                          onMouseEnter={() => setHovered(s.id)}
                          onMouseLeave={() => setHovered(null)}
                          style={isHov && colorChips && sColor ? { backgroundColor: `${sColor}30`, color: "#1e293b", borderColor: `${sColor}60` } : undefined}
                        >
                          {s.first_name[0]}{s.last_name[0]}
                        </span>
                      } />
                      <TooltipContent side="top">{s.first_name} {s.last_name}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </>
          )
        })}
      </div>
    </div>
  )
}
