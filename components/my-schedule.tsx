"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import { CalendarDays, Clock, Palmtree, ArrowLeftRight } from "lucide-react"
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

const SwapRequestsList = dynamic(
  () => import("@/components/swap-requests-list").then(m => ({ default: m.SwapRequestsList })),
  { ssr: false }
)

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
}

export function MySchedule({
  staffId, days, onLeaveByDate, shiftTimes, tecnicas, locale, timeFormat, initialDate,
  swapEnabled = false, rotaPublished = false,
}: MyScheduleProps) {
  const t = useTranslations("mySchedule")
  const today = new Date().toISOString().split("T")[0]
  const [currentDate, setCurrentDate] = useState(initialDate ?? today)
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<{ id: string; shiftType: string; date: string } | null>(null)

  const canSwap = swapEnabled && rotaPublished

  // Find viewer's assignments and leave status per day
  const myDays = days.map((day) => {
    const myAssignments = day.assignments.filter((a) => a.staff_id === staffId)
    const isOnLeave = onLeaveByDate[day.date]?.includes(staffId) ?? false
    return { ...day, myAssignments, isOnLeave }
  })

  // Next upcoming shift
  const nextShift = myDays.find((d) => d.date >= today && d.myAssignments.length > 0)

  // Current day detail
  const currentDay = myDays.find((d) => d.date === currentDate)

  return (
    <div className="flex flex-col md:hidden flex-1 overflow-auto">
      {/* Personal weekly strip */}
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

      <div className="flex flex-col gap-4 px-4 py-3 flex-1">
        {/* Next shift card */}
        {nextShift && nextShift.date !== currentDate && (
          <button
            onClick={() => setCurrentDate(nextShift.date)}
            className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-left active:bg-primary/10 transition-colors"
          >
            <p className="text-[10px] text-primary font-medium uppercase tracking-wide mb-1">{t("nextShift")}</p>
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary shrink-0" />
              <span className="text-[14px] font-medium">{formatDate(nextShift.date, locale)}</span>
              {nextShift.myAssignments[0] && shiftTimes?.[nextShift.myAssignments[0].shift_type] && (
                <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                  <Clock className="size-3" />
                  {formatTime(shiftTimes[nextShift.myAssignments[0].shift_type].start, timeFormat)}
                </span>
              )}
              <span className="text-[11px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded ml-auto">
                {nextShift.myAssignments[0]?.shift_type}
              </span>
            </div>
            {nextShift.myAssignments.some((a) => a.function_label) && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {nextShift.myAssignments.filter((a) => a.function_label).map((a) => {
                  const tec = tecnicas.find((t) => t.codigo === a.function_label)
                  return (
                    <span key={a.id} className="text-[11px] px-1.5 py-0.5 rounded border border-primary/20 bg-primary/5 text-primary font-medium">
                      {tec?.nombre_es ?? a.function_label}
                    </span>
                  )
                })}
              </div>
            )}
          </button>
        )}

        {/* Current day detail */}
        <div>
          <p className="text-[13px] font-medium mb-2">{formatDate(currentDate, locale)}</p>
          {currentDay?.isOnLeave ? (
            <div className="flex items-center gap-2 px-3 py-3 rounded-lg border border-amber-200 bg-amber-50">
              <Palmtree className="size-4 text-amber-500" />
              <span className="text-[14px] font-medium text-amber-700">{t("onLeave")}</span>
            </div>
          ) : currentDay && currentDay.myAssignments.length > 0 ? (
            <div className="flex flex-col gap-2">
              {currentDay.myAssignments.map((a) => {
                const times = shiftTimes?.[a.shift_type]
                const tec = a.function_label ? tecnicas.find((t) => t.codigo === a.function_label) : null
                return (
                  <div key={a.id} className="flex items-center gap-3 px-3 py-3 rounded-lg border border-border bg-background">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-semibold">{a.shift_type}</span>
                        {times && (
                          <span className="text-[12px] text-muted-foreground">
                            {formatTime(times.start, timeFormat)} — {formatTime(times.end, timeFormat)}
                          </span>
                        )}
                      </div>
                      {tec && (
                        <p className="text-[12px] text-primary mt-0.5">{tec.nombre_es}</p>
                      )}
                      {a.function_label && !tec && (
                        <p className="text-[12px] text-muted-foreground mt-0.5">{a.function_label}</p>
                      )}
                    </div>
                    {canSwap && (
                      <button
                        onClick={() => {
                          setSwapAssignment({ id: a.id, shiftType: a.shift_type, date: currentDate })
                          setSwapDialogOpen(true)
                        }}
                        className="shrink-0 size-8 rounded-lg border border-primary/20 flex items-center justify-center hover:bg-primary/5 active:bg-primary/10 transition-colors"
                        title={locale === "es" ? "Solicitar cambio" : "Request swap"}
                      >
                        <ArrowLeftRight className="size-3.5 text-primary" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-3 rounded-lg border border-border bg-muted/30">
              <span className="text-[14px] text-muted-foreground">{t("free")}</span>
            </div>
          )}
        </div>

        {/* Full week list */}
        <div className="flex flex-col gap-1">
          <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-1">{t("thisWeek")}</p>
          {myDays.map((day) => {
            const isToday = day.date === today
            const isActive = day.date === currentDate
            const assignment = day.myAssignments[0]
            const times = assignment ? shiftTimes?.[assignment.shift_type] : null

            return (
              <button
                key={day.date}
                onClick={() => setCurrentDate(day.date)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors",
                  isActive ? "bg-accent" : "hover:bg-muted/50 active:bg-accent"
                )}
              >
                <span className={cn(
                  "text-[12px] font-medium w-16 shrink-0",
                  isToday && "text-primary"
                )}>
                  {formatDate(day.date, locale).split(",")[0] ?? formatDate(day.date, locale).slice(0, 6)}
                </span>
                {day.isOnLeave ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Palmtree className="size-3 text-amber-500" />
                    <span className="text-[12px] text-amber-600">{t("absence")}</span>
                  </div>
                ) : assignment ? (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-[12px] font-medium bg-muted px-1.5 py-0.5 rounded">{assignment.shift_type}</span>
                    {times && (
                      <span className="text-[11px] text-muted-foreground">
                        {formatTime(times.start, timeFormat)}
                      </span>
                    )}
                    {assignment.function_label && (
                      <span className="text-[11px] text-primary ml-auto">{
                        tecnicas.find((t) => t.codigo === assignment.function_label)?.nombre_es ?? assignment.function_label
                      }</span>
                    )}
                  </div>
                ) : (
                  <span className="text-[12px] text-muted-foreground/50">{t("free")}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Swap requests list */}
        {canSwap && (
          <SwapRequestsList staffId={staffId} locale={locale} />
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
