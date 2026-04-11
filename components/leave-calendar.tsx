"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Leave, CompanyLeaveType } from "@/lib/types/database"

interface Props {
  leaves: Leave[]
  leaveTypes: CompanyLeaveType[]
  year: number
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfWeek(year: number, month: number): number {
  // 0=Sun ... 6=Sat → shift to 0=Mon ... 6=Sun
  const day = new Date(year, month, 1).getDay()
  return day === 0 ? 6 : day - 1
}

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

const MONTH_NAMES_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
const MONTH_NAMES_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DAY_HEADERS_ES = ["L", "M", "X", "J", "V", "S", "D"]
const DAY_HEADERS_EN = ["M", "T", "W", "T", "F", "S", "S"]

export function LeaveCalendar({ leaves, leaveTypes, year: initialYear }: Props) {
  const t = useTranslations("hr")
  const locale = useLocale() as "es" | "en"
  const today = new Date()
  const [viewYear, setViewYear] = useState(initialYear)
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const monthNames = locale === "es" ? MONTH_NAMES_ES : MONTH_NAMES_EN
  const dayHeaders = locale === "es" ? DAY_HEADERS_ES : DAY_HEADERS_EN

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }

  // Build a map: dateStr → leave type info
  const leaveDays = new Map<string, { color: string; name: string; status: string }>()

  for (const leave of leaves) {
    if (leave.status === "rejected") continue
    const lt = leave.leave_type_id
      ? leaveTypes.find((t) => t.id === leave.leave_type_id)
      : null
    const color = lt?.color ?? "#3b82f6"
    const name = lt ? (locale === "en" && lt.name_en ? lt.name_en : lt.name) : leave.type

    const start = new Date(leave.start_date + "T00:00:00")
    const end = new Date(leave.end_date + "T00:00:00")
    const cursor = new Date(start)
    while (cursor <= end) {
      const dateStr = toDateStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
      if (!leaveDays.has(dateStr)) {
        leaveDays.set(dateStr, { color, name, status: leave.status })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth)
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())

  // Build grid cells
  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateStr: toDateStr(viewYear, viewMonth, d) })

  // Legend: unique leave types used this month
  const monthLeaveTypes = new Map<string, { color: string; name: string }>()
  for (const [dateStr, info] of leaveDays) {
    if (dateStr.startsWith(`${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`)) {
      monthLeaveTypes.set(info.name, { color: info.color, name: info.name })
    }
  }

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      {/* Month header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-[14px] font-medium">
          {monthNames[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-muted transition-colors">
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-border">
        {dayHeaders.map((d, i) => (
          <div key={i} className={cn(
            "text-center py-2 text-[12px] font-medium text-muted-foreground",
            i >= 5 && "text-muted-foreground/50"
          )}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {cells.map(({ day, dateStr }, i) => {
          const leaveInfo = dateStr ? leaveDays.get(dateStr) : null
          const isToday = dateStr === todayStr
          const isWeekend = i % 7 >= 5
          const isCancelled = leaveInfo?.status === "cancelled"

          return (
            <div
              key={i}
              className={cn(
                "relative h-10 flex items-center justify-center text-[13px] border-b border-r border-border",
                !day && "bg-muted/20",
                isWeekend && day && !leaveInfo && "bg-muted/10 text-muted-foreground/60",
              )}
              title={leaveInfo ? `${leaveInfo.name}${isCancelled ? " (cancelled)" : ""}` : undefined}
            >
              {day && (
                <>
                  {leaveInfo && (
                    <div
                      className={cn("absolute inset-0.5 rounded-md", isCancelled && "opacity-30")}
                      style={{ backgroundColor: leaveInfo.color + "20", borderLeft: `3px solid ${leaveInfo.color}` }}
                    />
                  )}
                  <span className={cn(
                    "relative z-10",
                    isToday && "font-bold",
                    isToday && !leaveInfo && "text-primary",
                    leaveInfo && !isCancelled && "font-medium",
                    isCancelled && "line-through text-muted-foreground",
                  )}>
                    {day}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      {monthLeaveTypes.size > 0 && (
        <div className="flex flex-wrap gap-3 px-4 py-2.5 border-t border-border bg-muted/20">
          {[...monthLeaveTypes.values()].map((info) => (
            <div key={info.name} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: info.color }} />
              <span className="text-[12px] text-muted-foreground">{info.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
