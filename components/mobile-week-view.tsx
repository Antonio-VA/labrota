"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { RotateCcw, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"

const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

export function MobileWeekView({ data, weekStart }: { data: RotaWeekData | null; weekStart: string }) {
  const t = useTranslations("schedule")
  const locale = useLocale() as "es" | "en"
  const [isLandscape, setIsLandscape] = useState(false)

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 text-center">
        <div>
          <p className="text-[14px] font-medium text-muted-foreground">{t("noRota")}</p>
          <p className="text-[13px] text-muted-foreground/60 mt-1">{t("noRotaDescription")}</p>
        </div>
      </div>
    )
  }

  const days = data.days
  const shiftTypes = data.shiftTypes?.filter((s) => s.active !== false) ?? []
  const shiftTypeMap = Object.fromEntries(shiftTypes.map((s) => [s.code, s]))
  const timeFormat = data.timeFormat ?? "24h"

  // Build header date labels
  const dayLabels = days.map((d) => {
    const date = new Date(d.date + "T12:00:00")
    const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date)
    const num = date.getDate()
    return { wday, num, date: d.date }
  })

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Landscape hint banner */}
      <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 border-b border-border">
        <RotateCcw className="size-4 text-muted-foreground shrink-0" />
        <p className="text-[12px] text-muted-foreground">
          {locale === "es" ? "Gira tu dispositivo para ver mejor la semana completa" : "Rotate your device for a better view of the full week"}
        </p>
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-[600px]">
          {/* Header: shift labels as columns */}
          <div
            className="sticky top-0 z-10 grid border-b border-border bg-muted"
            style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
          >
            <div className="px-2 py-2 border-r border-border" />
            {dayLabels.map((dl, i) => {
              const isToday = dl.date === new Date().toISOString().split("T")[0]
              const isWeekend = [0, 6].includes(new Date(dl.date + "T12:00:00").getDay())
              return (
                <div
                  key={dl.date}
                  className={cn(
                    "px-1 py-2 text-center border-r border-border last:border-r-0",
                    isWeekend && "bg-muted/60"
                  )}
                >
                  <p className={cn("text-[10px] uppercase", isToday ? "text-primary font-semibold" : "text-muted-foreground")}>
                    {dl.wday}
                  </p>
                  <p className={cn("text-[14px] font-semibold", isToday && "text-primary")}>
                    {dl.num}
                  </p>
                </div>
              )
            })}
          </div>

          {/* Shift rows */}
          {shiftTypes.map((st) => (
            <div
              key={st.code}
              className="grid border-b border-border"
              style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
            >
              {/* Shift label */}
              <div className="px-2 py-2 border-r border-border bg-muted/30 flex flex-col items-end justify-center">
                <span className="text-[11px] font-semibold text-foreground">{st.code}</span>
                <span className="text-[9px] text-muted-foreground tabular-nums">
                  {formatTime(st.start_time, timeFormat)}
                </span>
              </div>
              {/* Day cells */}
              {days.map((day) => {
                const assignments = day.assignments.filter((a) => a.shift_type === st.code)
                const isWeekend = [0, 6].includes(new Date(day.date + "T12:00:00").getDay())
                const activeDays = (shiftTypeMap[st.code] as { active_days?: string[] })?.active_days
                const dowKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(day.date + "T12:00:00").getDay()]
                const isActive = !activeDays || activeDays.includes(dowKey)

                return (
                  <div
                    key={day.date}
                    className={cn(
                      "px-1 py-1 border-r border-border last:border-r-0 flex flex-col gap-0.5",
                      isWeekend && "bg-muted/20",
                      !isActive && "bg-muted/40"
                    )}
                  >
                    {!isActive ? (
                      <span className="text-[8px] text-muted-foreground/30 italic self-center mt-auto mb-auto">—</span>
                    ) : assignments.map((a) => (
                      <div
                        key={a.id}
                        className="text-[9px] font-medium rounded px-1 py-0.5 border border-border bg-background truncate"
                        style={{ borderLeft: `2px solid ${ROLE_COLOR[a.staff.role] ?? "#64748B"}` }}
                      >
                        {a.staff.first_name} {a.staff.last_name[0]}.
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          ))}

          {/* OFF row */}
          <div
            className="grid border-b border-border"
            style={{ gridTemplateColumns: `64px repeat(${days.length}, 1fr)` }}
          >
            <div className="px-2 py-2 border-r border-border bg-muted/30 flex items-center justify-end">
              <span className="text-[10px] font-medium text-muted-foreground">OFF</span>
            </div>
            {days.map((day) => {
              const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
              const leaveIds = new Set(data.onLeaveByDate?.[day.date] ?? [])
              const offCount = Math.max(0, day.assignments.length > 0 ? 0 : 0) // simplified — just show leave count
              return (
                <div key={day.date} className="px-1 py-1 border-r border-border last:border-r-0 bg-muted/10 flex items-center">
                  {leaveIds.size > 0 && (
                    <span className="text-[9px] text-amber-500 font-medium">{leaveIds.size}🌴</span>
                  )}
                  {offCount > 0 && (
                    <span className="text-[9px] text-muted-foreground/50 ml-1">{offCount} off</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
