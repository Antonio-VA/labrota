"use client"

import { useState, useEffect } from "react"
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
  onDateChange?: (date: string) => void
}

export function MySchedule({
  staffId, days, onLeaveByDate, shiftTimes, tecnicas, locale, timeFormat, initialDate,
  swapEnabled = false, rotaPublished = false, onDateChange,
}: MyScheduleProps) {
  const t = useTranslations("mySchedule")
  const today = new Date().toISOString().split("T")[0]
  const [currentDate, setCurrentDate] = useState(initialDate ?? today)
  const [swapDialogOpen, setSwapDialogOpen] = useState(false)
  const [swapAssignment, setSwapAssignment] = useState<{ id: string; shiftType: string; date: string } | null>(null)

  const canSwap = swapEnabled && rotaPublished

  // Sync currentDate back to parent when it changes
  useEffect(() => { onDateChange?.(currentDate) }, [currentDate, onDateChange])

  // Find viewer's assignments and leave status per day
  const myDays = days.map((day) => {
    const myAssignments = day.assignments.filter((a) => a.staff_id === staffId)
    const isOnLeave = onLeaveByDate[day.date]?.includes(staffId) ?? false
    return { ...day, myAssignments, isOnLeave }
  })

  // Next upcoming shift
  const nextShift = myDays.find((d) => d.date >= today && d.myAssignments.length > 0)

  // Default selection to next shift date
  const selectedDate = currentDate

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

      <div className="flex flex-col gap-3 px-4 py-3 flex-1 pb-24">
        {/* Next shift card — only if next shift is on a different day */}
        {nextShift && nextShift.date !== selectedDate && (
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
          </button>
        )}

        {/* Shift cards for each day */}
        <div className="flex flex-col gap-2">
          {myDays.map((day) => {
            const isSelected = day.date === selectedDate
            const isToday = day.date === today
            const assignment = day.myAssignments[0]
            const times = assignment ? shiftTimes?.[assignment.shift_type] : null
            const tec = assignment?.function_label ? tecnicas.find((tc) => tc.codigo === assignment.function_label) : null

            // On leave
            if (day.isOnLeave) {
              return (
                <button
                  key={day.date}
                  onClick={() => setCurrentDate(day.date)}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-colors",
                    isSelected
                      ? "border-amber-300 bg-amber-50 ring-1 ring-amber-300"
                      : "border-border bg-background active:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className={cn("size-4 shrink-0", isSelected ? "text-amber-600" : "text-muted-foreground")} />
                    <span className={cn("text-[14px] font-medium", isToday && "text-primary")}>{formatDate(day.date, locale)}</span>
                    <div className="flex items-center gap-1.5 ml-auto">
                      <Palmtree className="size-3.5 text-amber-500" />
                      <span className="text-[12px] font-medium text-amber-600">{t("onLeave")}</span>
                    </div>
                  </div>
                </button>
              )
            }

            // Has assignment — shift card
            if (assignment) {
              return (
                <button
                  key={day.date}
                  onClick={() => setCurrentDate(day.date)}
                  className={cn(
                    "rounded-lg border px-4 py-3 text-left transition-colors",
                    isSelected
                      ? "border-primary/30 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border bg-background active:bg-muted/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <CalendarDays className={cn("size-4 shrink-0", isSelected ? "text-primary" : "text-muted-foreground")} />
                    <span className={cn("text-[14px] font-medium", isToday && "text-primary")}>{formatDate(day.date, locale)}</span>
                    {times && (
                      <span className="text-[12px] text-muted-foreground flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatTime(times.start, timeFormat)} — {formatTime(times.end, timeFormat)}
                      </span>
                    )}
                    <span className={cn(
                      "text-[11px] font-medium px-1.5 py-0.5 rounded ml-auto",
                      isSelected ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    )}>
                      {assignment.shift_type}
                    </span>
                  </div>
                  {/* Function label row */}
                  {tec && (
                    <p className={cn("text-[12px] mt-1.5 ml-6", isSelected ? "text-primary" : "text-muted-foreground")}>{tec.nombre_es}</p>
                  )}
                  {assignment.function_label && !tec && (
                    <p className="text-[12px] text-muted-foreground mt-1.5 ml-6">{assignment.function_label}</p>
                  )}
                  {/* Swap button on selected card */}
                  {isSelected && canSwap && (
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSwapAssignment({ id: assignment.id, shiftType: assignment.shift_type, date: day.date })
                          setSwapDialogOpen(true)
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 text-primary text-[12px] font-medium hover:bg-primary/5 active:bg-primary/10 transition-colors"
                      >
                        <ArrowLeftRight className="size-3.5" />
                        {locale === "es" ? "Solicitar cambio" : "Request swap"}
                      </button>
                    </div>
                  )}
                </button>
              )
            }

            // Free day
            return (
              <button
                key={day.date}
                onClick={() => setCurrentDate(day.date)}
                className={cn(
                  "rounded-lg border px-4 py-3 text-left transition-colors",
                  isSelected
                    ? "border-border bg-muted/50 ring-1 ring-border"
                    : "border-border/50 bg-background active:bg-muted/30"
                )}
              >
                <div className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-muted-foreground/40 shrink-0" />
                  <span className={cn("text-[14px] font-medium", isToday ? "text-primary" : "text-muted-foreground/60")}>{formatDate(day.date, locale)}</span>
                  <span className="text-[12px] text-muted-foreground/40 ml-auto">{t("free")}</span>
                </div>
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
