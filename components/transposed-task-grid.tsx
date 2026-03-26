"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

const TECNICA_DOT: Record<string, string> = {
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
}

export function TransposedTaskGrid({
  data, staffList, locale, isPublished, publicHolidays, onLeaveByDate, compact,
}: TransposedTaskGridProps) {
  const t = useTranslations("schedule")

  const localDays = data?.days ?? []
  const tecnicas = (data?.tecnicas ?? []).filter((t) => t.activa).sort((a, b) => a.orden - b.orden)
  const today = new Date().toISOString().split("T")[0]

  const visibleStaffIds = useMemo(() => new Set(staffList.map((s) => s.id)), [staffList])

  if (!data || localDays.length === 0 || tecnicas.length === 0) return null

  const gridCols = `100px repeat(${tecnicas.length}, 1fr)`

  return (
    <div className="overflow-auto flex-1">
      <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: gridCols }}>
        {/* Header row: corner + técnica columns */}
        <div className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2" />
        {tecnicas.map((tec) => {
          const dotColor = TECNICA_DOT[tec.color] ?? TECNICA_DOT.blue
          return (
            <div key={tec.id} className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-center">
              <div className="flex items-center justify-center gap-1">
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                <span className="text-[11px] font-semibold text-foreground">{tec.codigo}</span>
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
          const holiday = publicHolidays[day.date]

          return (
            <>
              {/* Row header: day */}
              <div
                key={`header-${day.date}`}
                className={cn(
                  "border-b border-r border-border px-2 py-2 flex flex-col justify-center bg-muted/50",
                  isSat && "border-t border-dashed",
                  isToday && "bg-primary/5"
                )}
              >
                <div className="flex items-center gap-1">
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider text-muted-foreground",
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
                  {day.warnings.length > 0 && (
                    <AlertTriangle className="size-3 text-amber-500 shrink-0" />
                  )}
                </div>
                {holiday && (
                  <span className="text-[9px] text-amber-600 truncate leading-tight">{holiday}</span>
                )}
              </div>

              {/* Técnica cells */}
              {tecnicas.map((tec) => {
                // Find assignments for this day + técnica
                const assignments = day.assignments.filter(
                  (a) => (a.function_label === tec.codigo || a.tecnica_id === tec.id) && visibleStaffIds.has(a.staff_id)
                )

                return (
                  <div
                    key={`${day.date}-${tec.codigo}`}
                    className={cn(
                      "border-b border-border p-1 flex flex-wrap gap-0.5 content-start",
                      isSat && "border-t border-dashed",
                      assignments.length > 0 ? "bg-background" : "bg-muted/10"
                    )}
                  >
                    {assignments.map((a) => (
                      <Tooltip key={a.id}>
                        <TooltipTrigger render={
                          <span
                            className={cn(
                              "inline-flex items-center justify-center rounded border border-border bg-background font-semibold",
                              compact ? "text-[9px] px-1 py-0 min-h-[18px]" : "text-[10px] px-1.5 py-0.5 min-h-[22px]"
                            )}
                          >
                            {a.staff.first_name[0]}{a.staff.last_name[0]}
                          </span>
                        } />
                        <TooltipContent side="top">
                          {a.staff.first_name} {a.staff.last_name} · {a.shift_type}
                        </TooltipContent>
                      </Tooltip>
                    ))}
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
