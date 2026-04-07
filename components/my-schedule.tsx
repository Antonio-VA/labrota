"use client"

import { useState, useEffect, useRef } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { CalendarDays, Clock, Palmtree, ArrowLeftRight, ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format-date"
import { formatTime } from "@/lib/format-time"
import { WeeklyStrip } from "@/components/weekly-strip"
import type { RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { Tecnica } from "@/lib/types/database"

const SwapRequestDialog = dynamic(
  () => import("@/components/swap-request-dialog").then(m => ({ default: m.SwapRequestDialog })),
  { ssr: false }
)

// Uniform card height for non-next-shift cards
const CARD_H = "min-h-[52px]"

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
}

export function MySchedule({
  staffId, days, onLeaveByDate, shiftTimes, tecnicas, locale, timeFormat, initialDate,
  swapEnabled = false, rotaPublished = false, onDateChange, onWeekChange, loading = false,
}: MyScheduleProps) {
  const t = useTranslations("mySchedule")
  const today = new Date().toISOString().split("T")[0]
  const [currentDate, setCurrentDate] = useState(initialDate ?? today)
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<{ id: string; shiftType: string; date: string } | null>(null)
  const [openMenuDate, setOpenMenuDate] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const canSwap = swapEnabled && rotaPublished

  // Close menu on outside tap
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

  // Swap menu helper
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
              {locale === "es" ? "Solicitar cambio" : "Request swap"}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col md:hidden flex-1 overflow-auto">
      <WeeklyStrip
        days={myDays.map((d) => ({
          date: d.date,
          staffCount: d.myAssignments.length,
          hasSkillGaps: false,
          isWorking: d.myAssignments.length > 0,
          isOnLeave: d.isOnLeave,
        }))}
        currentDate={currentDate}
        onSelectDay={setCurrentDate}
        locale={locale}
        personalMode
      />

      <div className="flex flex-col gap-2 px-4 py-3 flex-1 pb-24">
        {loading ? (
          <>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={cn("rounded-lg border border-border px-4 animate-pulse flex items-center gap-2", CARD_H)}>
                <div className="size-4 rounded bg-muted" />
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="h-5 w-8 rounded bg-muted" />
                  <div className="h-4 w-24 rounded bg-muted" />
                </div>
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

              // ── Next shift card (taller, green highlight) ──
              if (day.isNextShift && assignment) {
                return (
                  <div key={`next-${day.date}`} className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 pt-2 pb-3">
                    <p className="text-[10px] text-emerald-700 font-medium uppercase tracking-wide mb-1">{t("nextShift")}</p>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="size-4 text-emerald-600 shrink-0" />
                      <span className="text-[14px] font-medium">{formatDate(day.date, locale)}</span>
                      <div className="flex items-center gap-1.5 ml-auto">
                        <span className="text-[12px] font-medium text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                          {assignment.shift_type}
                        </span>
                        {times && (
                          <span className="text-[12px] text-emerald-600/70 flex items-center gap-1">
                            <Clock className="size-3" />
                            {formatTime(times.start, timeFormat)} — {formatTime(times.end, timeFormat)}
                          </span>
                        )}
                        {renderSwapMenu(day.date, assignment.id, assignment.shift_type, "text-emerald-600", "hover:bg-emerald-100 active:bg-emerald-200")}
                      </div>
                    </div>
                  </div>
                )
              }

              // ── On leave ──
              if (day.isOnLeave) {
                return (
                  <div key={day.date} className={cn("rounded-lg border px-4 flex items-center gap-2", CARD_H, isPast ? "border-border bg-muted/40" : "border-amber-200 bg-amber-50/50")}>
                    <CalendarDays className={cn("size-4 shrink-0", isPast ? "text-muted-foreground" : "text-amber-500")} />
                    <span className={cn("text-[14px] font-medium", isPast ? "text-muted-foreground" : isToday ? "text-primary" : "")}>{formatDate(day.date, locale)}</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Palmtree className={cn("size-3.5", isPast ? "text-muted-foreground" : "text-amber-500")} />
                      <span className={cn("text-[12px] font-medium", isPast ? "text-muted-foreground" : "text-amber-600")}>{t("onLeave")}</span>
                    </div>
                  </div>
                )
              }

              // ── Has assignment ──
              if (assignment) {
                return (
                  <div key={day.date} className={cn("rounded-lg border px-4 flex items-center gap-2", CARD_H, isPast ? "border-border bg-muted/40" : "border-border")}>
                    <CalendarDays className="size-4 text-muted-foreground shrink-0" />
                    <span className={cn("text-[14px] font-medium", isPast ? "text-muted-foreground" : isToday ? "text-primary" : "")}>{formatDate(day.date, locale)}</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <span className={cn("text-[12px] font-medium px-1.5 py-0.5 rounded", isPast ? "bg-muted text-muted-foreground" : "bg-muted text-muted-foreground")}>
                        {assignment.shift_type}
                      </span>
                      {times && (
                        <span className={cn("text-[12px] flex items-center gap-1", isPast ? "text-muted-foreground" : "text-muted-foreground")}>
                          <Clock className="size-3" />
                          {formatTime(times.start, timeFormat)} — {formatTime(times.end, timeFormat)}
                        </span>
                      )}
                      {!isPast && renderSwapMenu(day.date, assignment.id, assignment.shift_type, "text-muted-foreground", "hover:bg-muted active:bg-accent")}
                    </div>
                  </div>
                )
              }

              // ── Free day — dotted background pattern ──
              return (
                <div
                  key={day.date}
                  className={cn("rounded-lg border px-4 flex items-center gap-2", CARD_H, isPast ? "border-border bg-muted/40" : "border-border")}
                  style={!isPast ? {
                    backgroundImage: "radial-gradient(circle, var(--border) 1px, transparent 1px)",
                    backgroundSize: "12px 12px",
                  } : undefined}
                >
                  <CalendarDays className={cn("size-4 shrink-0", isPast ? "text-muted-foreground" : "text-muted-foreground/40")} />
                  <span className={cn("text-[14px]", isToday ? "font-medium text-primary" : isPast ? "text-muted-foreground" : "text-muted-foreground/60")}>{formatDate(day.date, locale)}</span>
                  <span className={cn("text-[12px] ml-auto", isPast ? "text-muted-foreground" : "text-muted-foreground/50")}>{t("free")}</span>
                </div>
              )
            })}
          </>
        )}

        {/* Week navigation */}
        {onWeekChange && !loading && (
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={() => onWeekChange(-1)}
              className="flex items-center gap-1 text-[13px] font-medium text-primary px-3 py-2 rounded-lg active:bg-primary/10 transition-colors"
            >
              <ChevronLeft className="size-4" />
              {locale === "es" ? "Semana anterior" : "Previous week"}
            </button>
            <button
              onClick={() => onWeekChange(1)}
              className="flex items-center gap-1 text-[13px] font-medium text-primary px-3 py-2 rounded-lg active:bg-primary/10 transition-colors"
            >
              {locale === "es" ? "Semana siguiente" : "Next week"}
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
          dateLabel={formatDate(swapAssignment.date, locale)}
          locale={locale}
        />
      )}
    </div>
  )
}
