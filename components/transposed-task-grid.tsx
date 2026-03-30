"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useStaffHover } from "@/components/staff-hover-context"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"

const ROLE_BORDER: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }
const COLOR_HEX: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}
function resolveStaffColor(color: string): string {
  if (color.startsWith("#")) return color
  return COLOR_HEX[color] ?? "#94A3B8"
}

const TECNICA_DOT_COLOR: Record<string, string> = {
  amber: "#F59E0B", blue: "#3B82F6", green: "#10B981",
  purple: "#8B5CF6", coral: "#EF4444", teal: "#14B8A6",
  slate: "#64748B", red: "#EF4444",
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
  onRemoveAssignment?: (id: string) => void
  onCellClick?: (date: string, tecnicaCode: string) => void
  onChipClick?: (staff_id: string) => void
  onDateClick?: (date: string) => void
}

export function TransposedTaskGrid({
  data, staffList, locale, isPublished, publicHolidays, onLeaveByDate, compact,
  colorChips = true, onRemoveAssignment, onCellClick, onChipClick, onDateClick,
}: TransposedTaskGridProps) {
  const t = useTranslations("schedule")
  const { hoveredStaffId, setHovered } = useStaffHover()

  const localDays = data?.days ?? []
  const tecnicas = useMemo(() => (data?.tecnicas ?? []).filter((t) => t.activa).sort((a, b) => a.orden - b.orden), [data?.tecnicas])
  const today = new Date().toISOString().split("T")[0]

  const visibleStaffIds = useMemo(() => new Set(staffList.map((s) => s.id)), [staffList])
  const staffColorMap = useMemo(() =>
    Object.fromEntries(staffList.map((s) => [s.id, s.color ? resolveStaffColor(s.color) : (ROLE_BORDER[s.role] ?? "#64748B")]))
  , [staffList])

  if (!data || localDays.length === 0 || tecnicas.length === 0) return null

  // Grid: day label + técnica columns + OFF column
  const gridCols = `100px repeat(${tecnicas.length}, minmax(80px, 1fr)) minmax(80px, 1fr)`

  return (
    <div className="overflow-auto flex-1 rounded-lg border border-border">
      <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: gridCols }}>
        {/* Header row: corner + técnica columns + OFF */}
        <div className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2" />
        {tecnicas.map((tec) => {
          const dotColor = TECNICA_DOT_COLOR[tec.color] ?? TECNICA_DOT_COLOR.blue
          return (
            <div key={tec.id} className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-center">
              <div className="flex items-center justify-center gap-1.5">
                <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                <span className="text-[12px] font-semibold" style={{ color: dotColor }}>{tec.codigo}</span>
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

          // Coverage status for left border color
          const hasWarnings = day.warnings.length > 0
          const hasAssignments = day.assignments.length > 0
          const coverageColor = !hasAssignments ? "#D4D4D8" : hasWarnings ? "#F59E0B" : "#10B981"

          // Off staff: not assigned AND not on leave
          const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
          const offStaff = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id) && visibleStaffIds.has(s.id))

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
                style={{
                  borderLeft: `3px solid ${coverageColor}`,
                  ...(isSat ? { borderTop: "1px dashed var(--border)" } : {}),
                }}
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

                return (
                  <div
                    key={`${day.date}-${tec.codigo}`}
                    className={cn(
                      "border-b border-border px-1 py-1 flex flex-wrap gap-0.5 content-start",
                      isSat && "border-t border-dashed",
                      isWeekend && "bg-muted/30",
                      assignments.length > 0 ? "bg-background" : "",
                      !isPublished && onCellClick && "cursor-pointer hover:bg-accent/10"
                    )}
                    onClick={() => !isPublished && onCellClick?.(day.date, tec.codigo)}
                  >
                    {assignments.map((a) => {
                      const sColor = staffColorMap[a.staff_id]
                      const isHov = hoveredStaffId === a.staff_id
                      return (
                        <Tooltip key={a.id}>
                          <TooltipTrigger render={
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 rounded font-semibold bg-background group/chip transition-colors duration-100",
                                compact ? "text-[9px] px-1 py-0.5 min-h-[20px]" : "text-[10px] px-1.5 py-0.5 min-h-[24px]"
                              )}
                              style={{
                                border: `1px solid ${sColor}40`,
                                borderLeft: `3px solid ${sColor}`,
                                borderRadius: 4,
                                ...(isHov ? { backgroundColor: `${sColor}20` } : {}),
                              }}
                              onMouseEnter={() => setHovered(a.staff_id)}
                              onMouseLeave={() => setHovered(null)}
                              onClick={(e) => { e.stopPropagation(); onChipClick?.(a.staff_id) }}
                            >
                              {a.staff.first_name[0]}{a.staff.last_name[0]}
                              {!isPublished && onRemoveAssignment && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onRemoveAssignment(a.id) }}
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
                    {!isPublished && onCellClick && assignments.length === 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCellClick(day.date, tec.codigo) }}
                        className="inline-flex items-center justify-center size-5 rounded border border-dashed border-primary/30 text-primary text-[10px] hover:bg-primary/5 active:bg-primary/10 transition-colors"
                      >+</button>
                    )}
                  </div>
                )
              })}

              {/* OFF column */}
              <div
                key={`off-${day.date}`}
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
                {offStaff.slice(0, compact ? 3 : 5).map((s) => {
                  const isHov = hoveredStaffId === s.id
                  return (
                    <div
                      key={s.id}
                      className={cn("flex items-center gap-1 rounded border border-border/50 px-1.5 text-muted-foreground transition-colors duration-100", compact ? "py-0 text-[10px]" : "py-0.5 text-[11px]")}
                      onMouseEnter={() => setHovered(s.id)}
                      onMouseLeave={() => setHovered(null)}
                      style={isHov && staffColorMap[s.id] ? { backgroundColor: `${staffColorMap[s.id]}30`, color: "#1e293b" } : undefined}
                    >
                      <span className="truncate">{s.first_name} {s.last_name[0]}.</span>
                    </div>
                  )
                })}
                {offStaff.length > (compact ? 3 : 5) && (
                  <span className="text-[9px] text-muted-foreground/50 self-center">+{offStaff.length - (compact ? 3 : 5)}</span>
                )}
              </div>
            </>
          )
        })}
      </div>
    </div>
  )
}
