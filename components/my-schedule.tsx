"use client"

import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { Palmtree, ArrowLeftRight, ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, FileDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import type { RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { Tecnica } from "@/lib/types/database"

const SwapRequestDialog = dynamic(
  () => import("@/components/swap-request-dialog").then(m => ({ default: m.SwapRequestDialog })),
  { ssr: false }
)

const CARD_H = "min-h-[52px]"

const DOW_ES = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
const DOW_EN = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MON_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
const MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function getMondayOf(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  const dow = d.getDay()
  const diff = dow === 0 ? -6 : 1 - dow
  d.setDate(d.getDate() + diff)
  return d.toISOString().split("T")[0]
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

function formatWeekOption(mondayStr: string, locale: "es" | "en"): string {
  const start = new Date(mondayStr + "T12:00:00")
  const end = new Date(mondayStr + "T12:00:00")
  end.setDate(start.getDate() + 6)
  const months = locale === "es" ? MON_ES : MON_EN
  const sDay = start.getDate()
  const eDay = end.getDate()
  const sMon = months[start.getMonth()]
  const eMon = months[end.getMonth()]
  const yr = end.getFullYear()
  if (sMon === eMon) return `${sDay}–${eDay} ${sMon} ${yr}`
  return `${sDay} ${sMon} – ${eDay} ${eMon} ${yr}`
}

function formatCardDate(dateStr: string, locale: "es" | "en"): string {
  const d = new Date(dateStr + "T12:00:00")
  const dow = (locale === "es" ? DOW_ES : DOW_EN)[(d.getDay() + 6) % 7]
  const day = d.getDate()
  const mon = (locale === "es" ? MON_ES : MON_EN)[d.getMonth()]
  return `${dow} ${day} ${mon}`
}

function generateWeekOptions(currentMonday: string, locale: "es" | "en") {
  const options: { monday: string; label: string }[] = []
  // 4 weeks back, current, 4 weeks forward
  for (let i = -4; i <= 4; i++) {
    const monday = addDays(currentMonday, i * 7)
    options.push({ monday, label: formatWeekOption(monday, locale) })
  }
  return options
}

interface MyScheduleProps {
  staffId: string
  days: RotaDay[]
  onLeaveByDate: Record<string, string[]>
  shiftTimes: ShiftTimes | null
  tecnicas: Tecnica[]
  locale: "es" | "en"
  timeFormat?: string
  initialDate?: string
  swapEnabled?: boolean
  rotaPublished?: boolean
  onDateChange?: (date: string) => void
  onWeekChange?: (dir: -1 | 1) => void
  loading?: boolean
  weekData?: import("@/app/(clinic)/rota/actions").RotaWeekData | null
  orgName?: string
}

export function MySchedule({
  staffId, days, onLeaveByDate, shiftTimes, tecnicas, locale, timeFormat, initialDate,
  swapEnabled = false, rotaPublished = false, onDateChange, onWeekChange, loading = false,
  weekData, orgName,
}: MyScheduleProps) {
  const t = useTranslations("mySchedule")
  const tc = useTranslations("common")
  const today = new Date().toISOString().split("T")[0]
  const [currentDate, setCurrentDate] = useState(initialDate ?? today)

  // Sync internal state when parent changes the week (via prev/next buttons)
  useEffect(() => {
    if (initialDate && initialDate !== currentDate) {
      setCurrentDate(initialDate)
    }
  }, [initialDate]) // eslint-disable-line react-hooks/exhaustive-deps
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<{ id: string; shiftType: string; date: string } | null>(null)
  const [openMenuDate, setOpenMenuDate] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const canSwap = swapEnabled && rotaPublished

  useEffect(() => {
    if (!openMenuDate) return
    function onTap(e: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpenMenuDate(null)
    }
    document.addEventListener("mousedown", onTap)
    document.addEventListener("touchstart", onTap)
    return () => { document.removeEventListener("mousedown", onTap); document.removeEventListener("touchstart", onTap) }
  }, [openMenuDate])

  useEffect(() => { onDateChange?.(currentDate) }, [currentDate, onDateChange])

  const isCurrentWeek = days.some((d) => d.date === today)
  const currentMonday = days[0]?.date ? getMondayOf(days[0].date) : getMondayOf(today)
  const weekOptions = generateWeekOptions(currentMonday, locale)

  // Derive staff first name from assignments
  const staffFirstName = (() => {
    for (const day of days) {
      const a = day.assignments.find((a) => a.staff_id === staffId)
      if (a) return a.staff.first_name
    }
    return null
  })()

  const myDays = days.map((day) => {
    const myAssignments = day.assignments.filter((a) => a.staff_id === staffId)
    const isOnLeave = onLeaveByDate[day.date]?.includes(staffId) ?? false
    return { ...day, myAssignments, isOnLeave }
  })

  const nextShift = isCurrentWeek
    ? myDays.find((d) => d.date >= today && d.myAssignments.length > 0)
    : null

  const allDays = myDays.map((d) => ({
    ...d,
    isNextShift: nextShift ? d.date === nextShift.date : false,
  }))

  const isTaskOrg = weekData?.rotaDisplayMode === "by_task"
  const TASK_COLORS: Record<string, string> = {
    amber: "#F59E0B", blue: "#3B82F6", green: "#10B981", purple: "#8B5CF6",
    coral: "#EF4444", teal: "#14B8A6", slate: "#64748B", red: "#EF4444",
  }

  function renderSwapMenu(dayDate: string, assignmentId: string, shiftType: string, iconColor: string, hoverBg: string) {
    if (!canSwap) return null
    return (
      <div className="relative" ref={openMenuDate === dayDate ? menuRef : undefined}>
        <button
          onClick={() => setOpenMenuDate(openMenuDate === dayDate ? null : dayDate)}
          className={cn("size-7 flex items-center justify-center rounded-md transition-colors", hoverBg)}
        >
          <MoreHorizontal className={cn("size-4", iconColor)} />
        </button>
        {openMenuDate === dayDate && (
          <div className="absolute right-0 top-8 z-10 bg-white rounded-lg border border-border shadow-lg py-1 min-w-[160px]">
            <button
              onClick={() => {
                setOpenMenuDate(null)
                setSwapAssignment({ id: assignmentId, shiftType, date: dayDate })
                setSwapDialogOpen(true)
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-[13px] font-medium text-foreground hover:bg-muted active:bg-accent transition-colors"
            >
              <ArrowLeftRight className="size-3.5" />
              {t("requestSwap")}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col md:hidden flex-1 overflow-auto">
      {/* Week selector toolbar */}
      <div className="flex items-center h-12 px-3 border-b border-border bg-background lg:hidden sticky top-0 z-10 gap-2">
        <div className="relative shrink-0">
          <select
            value={currentMonday}
            onChange={(e) => setCurrentDate(e.target.value)}
            className="appearance-none text-[14px] font-semibold capitalize bg-transparent pr-5 py-1 cursor-pointer focus:outline-none"
          >
            {weekOptions.map((opt) => (
              <option key={opt.monday} value={opt.monday}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown className="size-3.5 text-muted-foreground absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
        {!isCurrentWeek && (
          <button
            onClick={() => setCurrentDate(today)}
            className="text-[12px] font-medium text-primary px-1.5 py-0.5 rounded-md active:bg-primary/10 transition-colors shrink-0"
          >
            {tc("today")}
          </button>
        )}
        <div className="flex-1" />
        {staffFirstName && (
          <span className="text-[13px] text-muted-foreground truncate">
            {t("staffShiftsLabel", { name: staffFirstName })}
          </span>
        )}
        {weekData && !loading && (
          <button
            onClick={() => {
              const on = orgName ?? document.querySelector("[data-org-name]")?.textContent ?? "LabRota"
              const name = staffFirstName ?? "staff"
              import("@/lib/export-pdf").then(({ exportPdfMySchedule }) => {
                exportPdfMySchedule(staffId, name, weekData, tecnicas, on, locale)
              })
            }}
            className="shrink-0 size-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted active:bg-accent transition-colors"
            title={t("downloadPdf")}
          >
            <FileDown className="size-4" />
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3 flex-1 pb-24">
        {loading ? (
          <>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={cn("rounded-lg border border-border px-4 animate-pulse flex items-center", CARD_H)}>
                <div className="h-4 w-20 rounded bg-muted" />
                <div className="mx-auto flex flex-col items-center gap-1">
                  <div className="h-5 w-8 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted" />
                </div>
                <div className="size-7" />
              </div>
            ))}
          </>
        ) : (
          <>
            {allDays.map((day) => {
              const assignment = day.myAssignments[0]
              const times = assignment ? shiftTimes?.[assignment.shift_type] : null
              const isToday = day.date === today
              const isPast = day.date < today
              const dateLabel = formatCardDate(day.date, locale)

              // For by-task: resolve all assigned tecnicas
              const myTecnicas = isTaskOrg
                ? day.myAssignments
                    .map((a) => {
                      const tec = a.function_label ? tecnicas.find((t) => t.codigo === a.function_label) ?? null : null
                      return { assignment: a, tec }
                    })
                    .filter((x) => x.tec !== null)
                : []

              // Single-assignment helpers (by-shift or fallback)
              const tecnica = isTaskOrg && assignment?.function_label
                ? tecnicas.find((t) => t.codigo === assignment.function_label) ?? null
                : null
              const tecColor = tecnica?.color?.startsWith("#")
                ? tecnica.color
                : (TASK_COLORS[tecnica?.color ?? ""] ?? "#3B82F6")
              const tecLabel = tecnica ? (locale === "en" ? tecnica.nombre_en : tecnica.nombre_es) : null

              // ── Next shift card ──
              if (day.isNextShift && assignment) {
                return (
                  <div key={`next-${day.date}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 pt-2.5 pb-3">
                    <p className="text-[10px] text-emerald-700 font-semibold uppercase tracking-wider mb-1.5">{t("nextShift")}</p>
                    <div className="flex items-center">
                      <span className="text-[14px] font-semibold capitalize w-[100px] shrink-0">{dateLabel}</span>
                      <div className="flex items-center justify-center gap-2 flex-1 flex-wrap">
                        {isTaskOrg && myTecnicas.length > 0 ? (
                          myTecnicas.map(({ tec, assignment: a }) => {
                            const tc = tec!
                            const c = tc.color?.startsWith("#") ? tc.color : (TASK_COLORS[tc.color ?? ""] ?? "#3B82F6")
                            const lbl = locale === "en" ? tc.nombre_en : tc.nombre_es
                            return (
                              <span key={a.id} className="flex items-center gap-1">
                                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: c }} />
                                <span className="text-[12px] font-semibold text-emerald-700">{lbl}</span>
                              </span>
                            )
                          })
                        ) : tecnica ? (
                          <span className="flex items-center gap-1.5">
                            <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: tecColor }} />
                            <span className="text-[13px] font-semibold text-emerald-700">{tecLabel}</span>
                          </span>
                        ) : (
                          <span className="text-[13px] font-semibold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                            {assignment.shift_type}
                          </span>
                        )}
                        {times && !isTaskOrg && (
                          <span className="text-[12px] text-emerald-600/70">
                            {formatTime(times.start, timeFormat)} — {formatTime(times.end, timeFormat)}
                          </span>
                        )}
                      </div>
                      <div className="w-7 shrink-0 flex justify-end">
                        {!isTaskOrg && renderSwapMenu(day.date, assignment.id, assignment.shift_type, "text-emerald-600", "hover:bg-emerald-100 active:bg-emerald-200")}
                      </div>
                    </div>
                  </div>
                )
              }

              // ── On leave ──
              if (day.isOnLeave) {
                return (
                  <div key={day.date} className={cn("rounded-lg border px-4 flex items-center", CARD_H, isPast ? "border-border bg-muted/40" : "border-amber-200 bg-amber-50/50")}>
                    <span className={cn("text-[14px] font-medium capitalize w-[100px] shrink-0", isPast ? "text-muted-foreground" : isToday ? "text-primary" : "")}>{dateLabel}</span>
                    <div className="flex items-center gap-1.5 justify-center flex-1">
                      <Palmtree className={cn("size-3.5", isPast ? "text-muted-foreground" : "text-amber-500")} />
                      <span className={cn("text-[12px] font-medium", isPast ? "text-muted-foreground" : "text-amber-600")}>{t("onLeave")}</span>
                    </div>
                    <div className="w-7 shrink-0" />
                  </div>
                )
              }

              // ── Has assignment ──
              if (assignment) {
                // By-task: may have multiple tasks — stack them in the card
                if (isTaskOrg && myTecnicas.length > 0) {
                  return (
                    <div key={day.date} className={cn("rounded-lg border px-4 py-2.5 flex items-start gap-3", CARD_H, isPast ? "border-border bg-muted/40" : "border-border")}>
                      <span className={cn("text-[14px] font-medium capitalize w-[100px] shrink-0 pt-0.5", isPast ? "text-muted-foreground" : isToday ? "text-primary" : "")}>{dateLabel}</span>
                      <div className="flex flex-col gap-1 flex-1 min-w-0">
                        {myTecnicas.map(({ tec, assignment: a }) => {
                          const tc = tec!
                          const c = tc.color?.startsWith("#") ? tc.color : (TASK_COLORS[tc.color ?? ""] ?? "#3B82F6")
                          const lbl = locale === "en" ? tc.nombre_en : tc.nombre_es
                          return (
                            <span key={a.id} className="flex items-center gap-1.5">
                              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: isPast ? "#94A3B8" : c }} />
                              <span className={cn("text-[13px] font-medium", isPast ? "text-muted-foreground" : "text-foreground")}>{lbl}</span>
                            </span>
                          )
                        })}
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={day.date} className={cn("rounded-lg border px-4 flex items-center", CARD_H, isPast ? "border-border bg-muted/40" : "border-border")}>
                    <span className={cn("text-[14px] font-medium capitalize w-[100px] shrink-0", isPast ? "text-muted-foreground" : isToday ? "text-primary" : "")}>{dateLabel}</span>
                    <div className="flex items-center justify-center gap-2 flex-1">
                      {tecnica ? (
                        <span className="flex items-center gap-1.5">
                          <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: isPast ? "#94A3B8" : tecColor }} />
                          <span className={cn("text-[13px] font-medium", isPast ? "text-muted-foreground" : "text-foreground")}>{tecLabel}</span>
                        </span>
                      ) : (
                        <span className={cn("text-[13px] font-semibold px-2 py-0.5 rounded", isPast ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground")}>
                          {assignment.shift_type}
                        </span>
                      )}
                      {times && (
                        <span className={cn("text-[12px]", isPast ? "text-muted-foreground" : "text-muted-foreground")}>
                          {formatTime(times.start, timeFormat)} — {formatTime(times.end, timeFormat)}
                        </span>
                      )}
                    </div>
                    <div className="w-7 shrink-0 flex justify-end">
                      {!isPast && renderSwapMenu(day.date, assignment.id, assignment.shift_type, "text-muted-foreground", "hover:bg-muted active:bg-accent")}
                    </div>
                  </div>
                )
              }

              // ── Free day ──
              return (
                <div
                  key={day.date}
                  className={cn("rounded-lg border px-4 flex items-center", CARD_H, isPast ? "border-border bg-muted/40" : "border-border")}
                  style={!isPast ? {
                    backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
                    backgroundSize: "12px 12px",
                  } : undefined}
                >
                  <span className={cn("text-[14px] capitalize w-[100px] shrink-0", isToday ? "font-medium text-primary" : isPast ? "text-muted-foreground" : "text-muted-foreground/60")}>{dateLabel}</span>
                  <span className={cn("text-[12px] flex-1 text-center", isPast ? "text-muted-foreground" : "text-muted-foreground/50")}>{t("free")}</span>
                  <div className="w-7 shrink-0" />
                </div>
              )
            })}
          </>
        )}

        {/* Bottom week navigation */}
        {onWeekChange && !loading && (
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => onWeekChange(-1)}
              className="flex items-center gap-1 text-[13px] font-medium text-primary px-3 py-2 rounded-lg active:bg-primary/10 transition-colors"
            >
              <ChevronLeft className="size-4" />
              {t("previousWeek")}
            </button>
            <button
              onClick={() => onWeekChange(1)}
              className="flex items-center gap-1 text-[13px] font-medium text-primary px-3 py-2 rounded-lg active:bg-primary/10 transition-colors"
            >
              {t("nextWeek")}
              <ChevronRight className="size-4" />
            </button>
          </div>
        )}
      </div>

      {canSwap && swapAssignment && (
        <SwapRequestDialog
          open={swapDialogOpen}
          onOpenChange={setSwapDialogOpen}
          assignmentId={swapAssignment.id}
          shiftType={swapAssignment.shiftType}
          date={swapAssignment.date}
          dateLabel={formatCardDate(swapAssignment.date, locale)}
          locale={locale}
        />
      )}
    </div>
  )
}
