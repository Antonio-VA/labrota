"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { formatDateRange } from "@/lib/format-date"
import { getRotaWeek, type RotaWeekData } from "@/app/(clinic)/rota/actions"
import { getMondayOfWeek } from "@/lib/rota-engine"

const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

export function MobileWeekClient() {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale() as "es" | "en"
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()))
  const [data, setData] = useState<RotaWeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setLoading(true)
    getRotaWeek(weekStart).then((d) => { setData(d); setLoading(false) })
  }, [weekStart])

  function navigate(dir: number) {
    const d = new Date(weekStart + "T12:00:00")
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(getMondayOfWeek(d))
  }

  function goToToday() {
    setWeekStart(getMondayOfWeek(new Date()))
  }

  const today = new Date().toISOString().split("T")[0]
  const currentWeek = getMondayOfWeek(new Date())
  const isCurrentWeek = weekStart === currentWeek

  // Week end date
  const endDate = (() => { const d = new Date(weekStart + "T12:00:00"); d.setDate(d.getDate() + 6); return d.toISOString().split("T")[0] })()

  const days = data?.days ?? []
  const shiftTypes = data?.shiftTypes?.filter((s) => s.active !== false) ?? []
  const shiftTypeMap = Object.fromEntries(shiftTypes.map((s) => [s.code, s]))
  const timeFormat = data?.timeFormat ?? "24h"

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Sticky week toolbar */}
      <div className="flex items-center gap-2 h-14 px-3 border-b border-border bg-background sticky top-0 z-10">
        <button onClick={() => navigate(-1)} className="size-9 flex items-center justify-center rounded-full active:bg-accent shrink-0">
          <ChevronLeft className="size-5 text-muted-foreground" />
        </button>
        <span className="text-[15px] font-semibold capitalize flex-1 text-center">
          {formatDateRange(weekStart, endDate, locale)}
        </span>
        <button onClick={() => navigate(1)} className="size-9 flex items-center justify-center rounded-full active:bg-accent shrink-0">
          <ChevronRight className="size-5 text-muted-foreground" />
        </button>
        <button
          onClick={goToToday}
          disabled={isCurrentWeek}
          className={cn("text-[13px] font-medium px-2.5 py-1 rounded-md transition-colors shrink-0", isCurrentWeek ? "text-muted-foreground/30" : "text-primary active:bg-primary/10")}
        >
          {tc("today")}
        </button>
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-[13px]">{tc("loading")}</div>
        ) : !data || days.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-[13px]">{t("noRota")}</div>
        ) : (
          <div className="min-w-[600px]">
            {/* Header: days */}
            <div
              className="sticky top-0 z-10 grid border-b border-border bg-muted"
              style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
            >
              <div className="px-2 py-2 border-r border-border" />
              {days.map((day) => {
                const date = new Date(day.date + "T12:00:00")
                const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date)
                const num = date.getDate()
                const isToday = day.date === today
                const isWeekend = [0, 6].includes(date.getDay())
                return (
                  <div key={day.date} className={cn("px-1 py-2 text-center border-r border-border last:border-r-0", isWeekend && "bg-muted/60")}>
                    <p className={cn("text-[10px] uppercase", isToday ? "text-primary font-semibold" : "text-muted-foreground")}>{wday}</p>
                    <p className={cn("text-[14px] font-semibold", isToday && "text-primary")}>{num}</p>
                  </div>
                )
              })}
            </div>

            {/* Rows: shifts or tasks depending on display mode */}
            {data.rotaDisplayMode === "by_task" && data.tecnicas ? (
              // By task: técnicas as rows
              data.tecnicas.filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden).map((tec) => {
                const dotColor = ({ amber: "#F59E0B", blue: "#3B82F6", green: "#10B981", purple: "#8B5CF6", coral: "#EF4444", teal: "#14B8A6", slate: "#64748B" } as Record<string, string>)[tec.color] ?? "#3B82F6"
                return (
                  <div key={tec.id} className="grid border-b border-border" style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}>
                    <div className="px-2 py-2 border-r border-border bg-muted/30 flex items-center justify-end gap-1">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                      <span className="text-[10px] font-semibold text-foreground">{tec.codigo}</span>
                    </div>
                    {days.map((day) => {
                      const assignments = day.assignments.filter((a) => a.function_label === tec.codigo || a.tecnica_id === tec.id)
                      const isWeekend = [0, 6].includes(new Date(day.date + "T12:00:00").getDay())
                      return (
                        <div key={day.date} className={cn("px-1 py-1 border-r border-border last:border-r-0 flex flex-wrap gap-0.5 content-start", isWeekend && "bg-muted/20")}>
                          {assignments.map((a) => (
                            <span key={a.id} className="text-[8px] font-semibold rounded px-1 py-0.5 border border-border bg-background" style={{ borderLeft: `2px solid ${ROLE_COLOR[a.staff.role] ?? "#64748B"}` }}>
                              {a.staff.first_name[0]}{a.staff.last_name[0]}
                            </span>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            ) : (
              // By shift: shift types as rows
              shiftTypes.map((st) => (
                <div key={st.code} className="grid border-b border-border" style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}>
                  <div className="px-2 py-2 border-r border-border bg-muted/30 flex flex-col items-end justify-center">
                    <span className="text-[11px] font-semibold text-foreground">{st.code}</span>
                    <span className="text-[9px] text-muted-foreground tabular-nums">{formatTime(st.start_time, timeFormat)}</span>
                  </div>
                  {days.map((day) => {
                    const assignments = day.assignments.filter((a) => a.shift_type === st.code)
                    const isWeekend = [0, 6].includes(new Date(day.date + "T12:00:00").getDay())
                    const activeDays = (shiftTypeMap[st.code] as { active_days?: string[] })?.active_days
                    const dowKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(day.date + "T12:00:00").getDay()]
                    const isActive = !activeDays || activeDays.includes(dowKey)
                    return (
                      <div key={day.date} className={cn("px-1 py-1 border-r border-border last:border-r-0 flex flex-col gap-0.5", isWeekend && "bg-muted/20", !isActive && "bg-muted/40")}>
                        {!isActive ? (
                          <span className="text-[8px] text-muted-foreground/30 italic self-center mt-auto mb-auto">—</span>
                        ) : assignments.map((a) => (
                          <div key={a.id} className="text-[9px] font-medium rounded px-1 py-0.5 border border-border bg-background truncate" style={{ borderLeft: `2px solid ${ROLE_COLOR[a.staff.role] ?? "#64748B"}` }}>
                            {a.staff.first_name} {a.staff.last_name[0]}.
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
