"use client"

import { useState, useEffect, useTransition, useRef, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { ChevronLeft, ChevronRight, MoreHorizontal, Sparkles, FileDown, AlertTriangle, CheckCircle2, Plane, Cross, User, GraduationCap, Baby, CalendarX, Share } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { formatDateRange } from "@/lib/format-date"
import { TapPopover } from "@/components/tap-popover"
import { getRotaWeek, generateRota, type RotaWeekData } from "@/app/(clinic)/rota/actions"
import { toast } from "sonner"
import { getMondayOfWeek } from "@/lib/rota-engine"

const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

function WeekAvisos({ days, locale }: { days: RotaWeekData["days"]; locale: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  const allWarnings = days.flatMap((d) => d.warnings.map((w) => ({ day: d.date, ...w })))
  if (allWarnings.length === 0) return <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />

  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-600 text-[11px] font-medium active:bg-amber-100">
        <AlertTriangle className="size-3" />
        {allWarnings.length}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-[200] w-72 max-h-[50vh] overflow-y-auto rounded-lg border border-border bg-background shadow-lg py-2">
          {allWarnings.map((w, i) => {
            const dayLabel = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { weekday: "short", day: "numeric" }).format(new Date(w.day + "T12:00:00"))
            return (
              <p key={i} className="px-3 py-1 text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground capitalize">{dayLabel}</span> · {w.message}
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

function WeekOverflow({ weekStart, data, onShare, onRefresh }: { weekStart: string; data: RotaWeekData | null; onShare?: () => void; onRefresh?: () => void }) {
  const t = useTranslations("schedule")
  const locale = useLocale()
  const [generating, setGenerating] = useState(false)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }, [open])

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (dropRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", h)
    document.addEventListener("touchstart", h as any)
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h as any) }
  }, [open])

  return (
    <div className="shrink-0">
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} className="size-9 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
        <MoreHorizontal className="size-5" />
      </button>
      {open && pos && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1"
          style={{ top: pos.top, right: pos.right }}
        >
          {onShare && (
            <button
              onClick={() => { setOpen(false); onShare() }}
              className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors"
            >
              <Share className="size-4" />
              {t("shareImage")}
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false)
              if (!data) return
              import("@/lib/export-pdf").then(({ exportPdfByShift, exportPdfByTask }) => {
                const orgEl = document.querySelector("[data-org-name]")
                const orgName = orgEl?.textContent ?? "LabRota"
                const notesEl = document.querySelector("[data-week-notes]")
                const noteTexts = notesEl
                  ? Array.from(notesEl.querySelectorAll("[data-note-text]")).map((el) => el.textContent ?? "").filter(Boolean)
                  : []
                if (data.rotaDisplayMode === "by_task") {
                  exportPdfByTask(data, data.tecnicas ?? [], orgName, locale, noteTexts.length > 0 ? noteTexts : undefined)
                } else {
                  exportPdfByShift(data, orgName, locale, noteTexts.length > 0 ? noteTexts : undefined)
                }
              })
            }}
            disabled={!data || data.days.every((d) => d.assignments.length === 0)}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors disabled:opacity-40"
          >
            <FileDown className="size-4" />
            {t("exportPdf")}
          </button>
          <button
            onClick={async () => {
              setOpen(false)
              if (generating) return
              setGenerating(true)
              try {
                await generateRota(weekStart, true, "ai_optimal")
                toast.success(locale === "es" ? "Rota generada" : "Rota generated")
                onRefresh?.()
              } catch {
                toast.error(locale === "es" ? "Error al generar" : "Generation failed")
              } finally {
                setGenerating(false)
              }
            }}
            disabled={generating}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors disabled:opacity-40"
          >
            <Sparkles className="size-4" />
            {generating ? (locale === "es" ? "Generando…" : "Generating…") : t("generateRota")}
          </button>
        </div>,
        document.body
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
  const weekGridRef = useRef<HTMLDivElement>(null)

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
        {/* Avisos — tappable with overlay */}
        <WeekAvisos days={days} locale={locale} />
        <WeekOverflow weekStart={weekStart} data={data} onRefresh={() => {
          setLoading(true)
          getRotaWeek(weekStart).then((d) => { setData(d); setLoading(false) })
        }} onShare={async () => {
          if (!weekGridRef.current) return
          const { shareRotaCapture } = await import("@/lib/share-capture")
          const s = new Date(weekStart + "T12:00:00")
          const e = new Date(weekStart + "T12:00:00"); e.setDate(s.getDate() + 6)
          const fmt = (d: Date) => d.toLocaleDateString(locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short" })
          const dateLabel = `${fmt(s)} – ${fmt(e)}`
          await shareRotaCapture({ gridEl: weekGridRef.current, dateLabel, fileName: `rota-week-${weekStart}.png` })
        }} />
      </div>

      {/* Scrollable grid */}
      <div ref={weekGridRef} className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-3 flex flex-col gap-1.5 animate-pulse">
            {/* Header row */}
            <div className="grid grid-cols-8 gap-1">
              <div className="h-10 rounded-md bg-muted-foreground/15" />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted-foreground/15" />
              ))}
            </div>
            {/* Shift rows */}
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="grid grid-cols-8 gap-1">
                <div className="h-14 rounded-md bg-muted-foreground/12" />
                {Array.from({ length: 7 }).map((_, c) => (
                  <div key={c} className="h-14 rounded-md bg-muted-foreground/10" />
                ))}
              </div>
            ))}
            {/* Libres row */}
            <div className="grid grid-cols-8 gap-1">
              <div className="h-8 rounded-md bg-muted-foreground/8" />
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="h-8 rounded-md bg-muted-foreground/6" />
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
                const NAMED_COLORS: Record<string, string> = { amber: "#F59E0B", blue: "#3B82F6", green: "#10B981", purple: "#8B5CF6", coral: "#EF4444", teal: "#14B8A6", slate: "#64748B", red: "#EF4444" }
                const dotColor = tec.color?.startsWith("#") ? tec.color : (NAMED_COLORS[tec.color] ?? "#3B82F6")
                return (
                  <div key={tec.id} className="grid border-b border-border" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
                    <div className="border-r border-border bg-muted sticky left-0 z-[5] flex items-stretch">
                      <div className="w-[3px] shrink-0" style={{ backgroundColor: dotColor }} />
                      <div className="px-1 py-2 flex flex-col items-end justify-center flex-1">
                        <span className="text-[11px] font-semibold text-foreground">{tec.codigo}</span>
                      {tec.typical_shifts?.[0] && shiftTypeMap[tec.typical_shifts[0]] && (
                        <span className="text-[8px] text-muted-foreground tabular-nums">{formatTime(shiftTypeMap[tec.typical_shifts[0]].start_time, timeFormat)}</span>
                      )}
                      </div>
                    </div>
                    {days.map((day) => {
                      const assignments = day.assignments.filter((a) => a.function_label === tec.codigo || a.tecnica_id === tec.id)
                      const isWeekend = [0, 6].includes(new Date(day.date + "T12:00:00").getDay())
                      return (
                        <div key={day.date} className={cn("px-1 py-2 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-1 content-start", isWeekend && "bg-muted/20")}>
                          {assignments.map((a) => (
                            <TapPopover key={a.id} trigger={
                              <span className="text-[11px] font-medium rounded px-1.5 py-1 border border-border bg-background cursor-pointer active:scale-95">
                                {a.staff.first_name[0]}{a.staff.last_name[0]}
                              </span>
                            }>
                              <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                              <p className="text-[11px] opacity-70">{a.shift_type}</p>
                            </TapPopover>
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
                    <span className="text-[13px] font-bold text-foreground">{st.code}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{formatTime(st.start_time, timeFormat)}</span>
                    <span className="text-[9px] text-muted-foreground/60 tabular-nums">{formatTime(st.end_time, timeFormat)}</span>
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
                      <div key={day.date} className={cn("px-1 py-2 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-col gap-1", isWeekend && "bg-muted/20", !isActive && "bg-muted/40", isSatCell && "border-l border-dashed border-l-border")}>
                        {!isActive ? (
                          <span className="text-[8px] text-muted-foreground/30 italic self-center mt-auto mb-auto">—</span>
                        ) : assignments.map((a) => (
                          <TapPopover key={a.id} trigger={
                            <div className="text-[12px] font-medium rounded px-1.5 py-1 border border-border bg-background truncate cursor-pointer active:scale-95">
                              {a.staff.first_name} {a.staff.last_name[0]}.
                            </div>
                          }>
                            <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                            <p className="text-[11px] opacity-70">{a.shift_type}</p>
                          </TapPopover>
                        ))}
                      </div>
                    )
                  })}
                </div>
              ))
            )}
            {/* Libres row */}
            {(() => {
              // Build staff name map from all assignments + staffList
              const staffMap: Record<string, { fn: string; ln: string; role: string }> = {}
              for (const d of days) for (const a of d.assignments) {
                if (!staffMap[a.staff_id]) staffMap[a.staff_id] = { fn: a.staff.first_name, ln: a.staff.last_name, role: a.staff.role }
              }
              const LEAVE_ICONS: Record<string, typeof Plane> = { annual: Plane, sick: Cross, personal: User, training: GraduationCap, maternity: Baby, other: CalendarX }
              const LEAVE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
                annual:    { border: "#7DD3FC", bg: "#F0F9FF", text: "#0369A1" },
                sick:      { border: "#FCA5A5", bg: "#FEF2F2", text: "#DC2626" },
                personal:  { border: "#C4B5FD", bg: "#F5F3FF", text: "#7C3AED" },
                training:  { border: "#FCD34D", bg: "#FFFBEB", text: "#D97706" },
                maternity: { border: "#F9A8D4", bg: "#FDF2F8", text: "#DB2777" },
                other:     { border: "#CBD5E1", bg: "#F8FAFC", text: "#475569" },
              }
              return (
            <div className="grid border-b border-border bg-muted/30" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
              <div className="px-1 py-2 border-r border-border bg-muted sticky left-0 z-[5] flex items-center justify-end">
                <span className="text-[9px] font-medium text-muted-foreground">{locale === "es" ? "Libres" : "Off"}</span>
              </div>
              {days.map((day) => {
                const leaveIds = [...(data?.onLeaveByDate?.[day.date] ?? [])]
                const leaveTypes = data?.onLeaveTypeByDate?.[day.date] ?? {}
                return (
                  <div key={day.date} className="px-0.5 py-1 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-0.5 content-start bg-muted/20">
                    {leaveIds.map((sid) => {
                      const s = staffMap[sid]
                      const lType = (leaveTypes[sid] ?? "other") as keyof typeof LEAVE_ICONS
                      const LeaveIcon = LEAVE_ICONS[lType] ?? CalendarX
                      const colors = LEAVE_COLORS[lType] ?? LEAVE_COLORS.other
                      return (
                        <TapPopover key={sid} trigger={
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-medium rounded px-0.5 py-0.5 border cursor-pointer active:scale-95" style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }} title={s ? `${s.fn} ${s.ln}` : "On leave"}>
                            <LeaveIcon className="size-2 shrink-0" />
                            {s ? `${s.fn[0]}${s.ln[0]}` : "?"}
                          </span>
                        }>
                          <p className="font-medium">{s ? `${s.fn} ${s.ln}` : "Staff"}</p>
                          <p className="text-[11px] opacity-70">{lType}</p>
                        </TapPopover>
                      )
                    })}
                  </div>
                )
              })}
            </div>
              )
            })()}

          </div>
        )}
      </div>
    </div>
  )
}
