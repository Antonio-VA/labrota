"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
const ROLE_BORDER: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

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
  onRemoveAssignment?: (id: string) => void
  onCellClick?: (date: string, tecnicaCode: string) => void
}

export function TransposedTaskGrid({
  data, staffList, locale, isPublished, publicHolidays, onLeaveByDate, compact,
  onRemoveAssignment, onCellClick,
}: TransposedTaskGridProps) {
  const t = useTranslations("schedule")

  const localDays = data?.days ?? []
  const tecnicas = (data?.tecnicas ?? []).filter((t) => t.activa).sort((a, b) => a.orden - b.orden)
  const today = new Date().toISOString().split("T")[0]

  const visibleStaffIds = useMemo(() => new Set(staffList.map((s) => s.id)), [staffList])

  if (!data || localDays.length === 0 || tecnicas.length === 0) return null

  // Equal width columns, min 80px
  const gridCols = `100px repeat(${tecnicas.length}, minmax(80px, 1fr))`

  return (
    <div className="overflow-auto flex-1">
      <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: gridCols }}>
        {/* Header row: corner + técnica columns */}
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

        {/* Day rows */}
        {localDays.map((day) => {
          const dow = new Date(day.date + "T12:00:00").getDay()
          const dayNum = new Date(day.date + "T12:00:00").getDate()
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(day.date + "T12:00:00"))
          const isToday = day.date === today
          const isSat = dow === 6
          const isWeekend = dow === 0 || dow === 6
          const holiday = publicHolidays[day.date]

          // Coverage status for left border color
          const hasWarnings = day.warnings.length > 0
          const hasAssignments = day.assignments.length > 0
          const coverageColor = !hasAssignments ? "#D4D4D8" : hasWarnings ? "#F59E0B" : "#10B981"

          return (
            <>
              {/* Row header: day */}
              <div
                key={`header-${day.date}`}
                className={cn(
                  "border-b border-r border-border px-2 py-1.5 flex flex-col justify-center",
                  isSat && "border-t border-dashed",
                  isToday && "bg-primary/5",
                  isWeekend && !isToday && "bg-muted/30"
                )}
                style={{ borderLeft: `3px solid ${coverageColor}` }}
              >
                <div className="flex items-center gap-1">
                  <span className={cn(
                    "text-[11px] uppercase tracking-wider text-muted-foreground font-medium",
                    isToday && "text-primary font-semibold"
                  )}>
                    {wday}
                  </span>
                  <span className={cn(
                    "text-[15px] font-semibold",
                    isToday ? "text-primary" : "text-foreground"
                  )}>
                    {dayNum}
                  </span>
                  {hasWarnings && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                </div>
                {holiday && <span className="text-[9px] text-amber-600 truncate leading-tight">{holiday}</span>}
              </div>

              {/* Técnica cells */}
              {tecnicas.map((tec) => {
                const assignments = day.assignments.filter(
                  (a) => (a.function_label === tec.codigo || a.tecnica_id === tec.id) && visibleStaffIds.has(a.staff_id)
                )
                const tecDotColor = TECNICA_DOT_COLOR[tec.color] ?? TECNICA_DOT_COLOR.blue

                return (
                  <div
                    key={`${day.date}-${tec.codigo}`}
                    className={cn(
                      "border-b border-border px-1 py-1.5 flex flex-wrap gap-1 content-start",
                      isSat && "border-t border-dashed",
                      isWeekend && "bg-muted/30",
                      assignments.length > 0 ? "bg-background" : ""
                    )}
                  >
                    {assignments.map((a) => {
                      const roleColor = ROLE_BORDER[a.staff.role] ?? "#64748B"
                      return (
                        <Tooltip key={a.id}>
                          <TooltipTrigger render={
                            <span
                              className={cn(
                                "inline-flex items-center gap-0.5 rounded font-semibold bg-background group/chip",
                                compact ? "text-[9px] px-1 py-0.5 min-h-[20px]" : "text-[10px] px-1.5 py-0.5 min-h-[24px]"
                              )}
                              style={{ border: `1px solid ${roleColor}40`, borderLeft: `3px solid ${roleColor}`, borderRadius: 4 }}
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
                    {!isPublished && onCellClick && (
                      <button
                        onClick={() => onCellClick(day.date, tec.codigo)}
                        className="inline-flex items-center justify-center size-5 rounded border border-dashed border-primary/30 text-primary text-[10px] hover:bg-primary/5 active:bg-primary/10 transition-colors"
                      >+</button>
                    )}
                  </div>
                )
              })}
            </>
          )
        })}
      </div>
    </div>
  )
}
