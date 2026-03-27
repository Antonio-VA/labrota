"use client"

import { useState, useEffect, useTransition, useRef } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { ChevronLeft, ChevronRight, MoreHorizontal, Sparkles, FileDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { formatDateRange } from "@/lib/format-date"
import { getRotaWeek, type RotaWeekData } from "@/app/(clinic)/rota/actions"
import { getMondayOfWeek } from "@/lib/rota-engine"

const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

function WeekOverflow({ weekStart }: { weekStart: string }) {
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])
  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="size-9 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
        <MoreHorizontal className="size-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1">
          <button
            onClick={() => {
              setOpen(false)
              window.open(`/rota/${weekStart}/print`, "_blank")
            }}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors"
          >
            <FileDown className="size-4" />
            {locale === "es" ? "Exportar PDF" : "Export PDF"}
          </button>
          <button
            onClick={() => {
              setOpen(false)
              window.location.href = `/?generate=${weekStart}`
            }}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors"
          >
            <Sparkles className="size-4" />
            {locale === "es" ? "Generar horario" : "Generate rota"}
          </button>
        </div>
      )}
    </div>
  )
}

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
          {(() => {
            const s = new Date(weekStart + "T12:00:00")
            const e = new Date(endDate + "T12:00:00")
            const fmt = (d: Date) => d.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short" })
            return `${fmt(s)} – ${fmt(e)}`
          })()}
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
        <WeekOverflow weekStart={weekStart} />
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-3 flex flex-col gap-1.5 animate-pulse">
            {/* Header row */}
            <div className="grid grid-cols-8 gap-1">
              <div className="h-10 rounded-md bg-muted" />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted" />
              ))}
            </div>
            {/* Shift rows */}
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="grid grid-cols-8 gap-1">
                <div className="h-14 rounded-md bg-muted/80" />
                {Array.from({ length: 7 }).map((_, c) => (
                  <div key={c} className="h-14 rounded-md bg-muted/60" />
                ))}
              </div>
            ))}
            {/* Libres row */}
            <div className="grid grid-cols-8 gap-1">
              <div className="h-8 rounded-md bg-muted/40" />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-8 rounded-md bg-muted/30" />
              ))}
            </div>
          </div>
        ) : !data || days.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-[13px]">{t("noRota")}</div>
        ) : (
          <div className="min-w-[600px] pb-24">
            {/* Header: days */}
            <div
              className="sticky top-0 z-10 grid border-b border-border bg-muted"
              style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}
            >
              <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[6]" />
              {days.map((day) => {
                const date = new Date(day.date + "T12:00:00")
                const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date)
                const num = date.getDate()
                const isToday = day.date === today
                const isWeekend = [0, 6].includes(date.getDay())
                const isSat = date.getDay() === 6
                return (
                  <div key={day.date} className={cn("px-1 py-2 text-center border-r border-border last:border-r-0", isWeekend && "bg-muted/50", isSat && "border-l border-dashed border-l-border")}>
                    <p className={cn("text-[10px] uppercase", isToday ? "text-primary font-semibold" : "text-muted-foreground")}>{wday}</p>
                    {isToday ? (
                      <span className="inline-flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-[14px] font-bold">{num}</span>
                    ) : (
                      <p className={cn("text-[14px] font-semibold", isWeekend && "text-muted-foreground")}>{num}</p>
                    )}
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
                  <div key={tec.id} className="grid border-b border-border" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
                    <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[5] flex items-center justify-end gap-1">
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                      <span className="text-[10px] font-semibold text-foreground">{tec.codigo}</span>
                    </div>
                    {days.map((day) => {
                      const assignments = day.assignments.filter((a) => a.function_label === tec.codigo || a.tecnica_id === tec.id)
                      const isWeekend = [0, 6].includes(new Date(day.date + "T12:00:00").getDay())
                      return (
                        <div key={day.date} className={cn("px-1 py-1 border-r border-border last:border-r-0 flex flex-wrap gap-0.5 content-start", isWeekend && "bg-muted/20")}>
                          {assignments.map((a) => (
                            <span key={a.id} className="text-[10px] font-semibold rounded-md px-1 py-0.5 border border-border bg-background" style={{ borderLeft: `3px solid ${ROLE_COLOR[a.staff.role] ?? "#64748B"}`, borderRadius: 6 }}>
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
                <div key={st.code} className="grid border-b border-border" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
                  <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[5] flex flex-col items-end justify-center">
                    <span className="text-[11px] font-semibold text-foreground">{st.code}</span>
                    <span className="text-[9px] text-muted-foreground tabular-nums">{formatTime(st.start_time, timeFormat)}</span>
                  </div>
                  {days.map((day) => {
                    const assignments = day.assignments.filter((a) => a.shift_type === st.code)
                    const dow = new Date(day.date + "T12:00:00").getDay()
                    const isWeekend = [0, 6].includes(dow)
                    const isSatCell = dow === 6
                    const isTodayCell = day.date === today
                    const activeDays = (shiftTypeMap[st.code] as { active_days?: string[] })?.active_days
                    const dowKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dow]
                    const isActive = !activeDays || activeDays.includes(dowKey)
                    return (
                      <div key={day.date} className={cn("px-1 py-1 border-r border-border last:border-r-0 flex flex-col gap-0.5", isWeekend && "bg-muted/20", !isActive && "bg-muted/40", isTodayCell && "bg-primary/5", isSatCell && "border-l border-dashed border-l-border")}>
                        {!isActive ? (
                          <span className="text-[8px] text-muted-foreground/30 italic self-center mt-auto mb-auto">—</span>
                        ) : assignments.map((a) => (
                          <div key={a.id} className="text-[11px] font-medium rounded-md px-1.5 py-0.5 border border-border bg-background truncate" style={{ borderLeft: `3px solid ${ROLE_COLOR[a.staff.role] ?? "#64748B"}`, borderRadius: 6 }}>
                            {a.staff.first_name} {a.staff.last_name[0]}.
                          </div>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
            {/* Libres row */}
            <div className="grid border-b border-border bg-muted/20" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
              <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[5] flex items-center justify-end">
                <span className="text-[10px] font-medium text-muted-foreground">{locale === "es" ? "Libres" : "Off"}</span>
              </div>
              {days.map((day) => {
                const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
                const leaveIds = new Set(data?.onLeaveByDate?.[day.date] ?? [])
                const leaveCount = leaveIds.size
                const offCount = Math.max(0, (data?.days?.[0]?.assignments ? 0 : 0))
                return (
                  <div key={day.date} className="px-1 py-1 border-r border-border last:border-r-0 flex flex-col gap-0.5">
                    {leaveCount > 0 && (
                      <span className="text-[9px] text-amber-600 font-medium">{leaveCount} 🌴</span>
                    )}
                    {[...leaveIds].map((sid) => {
                      const s = data?.days?.[0]?.assignments.find((a) => a.staff_id === sid)?.staff
                      return s ? (
                        <span key={sid} className="text-[9px] text-amber-600 italic truncate">{s.first_name[0]}{s.last_name[0]}</span>
                      ) : null
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
