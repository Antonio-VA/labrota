"use client"

import { useState } from "react"
import { useTranslations, useLocale } from "next-intl"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format-date"
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
  const _t = useTranslations("hr")
  const tl = useTranslations("leaves")
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

  // Build leave day map: dateStr → leave info
  const leaveDays = new Map<string, { color: string; name: string; status: string; startDate: string; endDate: string; days: number | null }>()

  // Map legacy type names to company leave types
  const LEGACY_MAP: Record<string, string[]> = {
    annual: ["vacaciones", "annual leave"],
    sick: ["baja por enfermedad", "sick leave"],
    personal: ["personal"],
    training: ["formacion", "training"],
    maternity: ["baja por maternidad", "maternity leave"],
  }

  function resolveLeaveType(leave: Leave) {
    if (leave.leave_type_id) {
      const lt = leaveTypes.find((t) => t.id === leave.leave_type_id)
      if (lt) return { color: lt.color, name: locale === "en" && lt.name_en ? lt.name_en : lt.name }
    }
    // Try matching legacy type to a company leave type
    const legacyNames = LEGACY_MAP[leave.type] ?? []
    for (const lt of leaveTypes) {
      if (legacyNames.includes(lt.name.toLowerCase()) || legacyNames.includes((lt.name_en ?? "").toLowerCase())) {
        return { color: lt.color, name: locale === "en" && lt.name_en ? lt.name_en : lt.name }
      }
    }
    return { color: "#3b82f6", name: leave.type }
  }

  for (const leave of leaves) {
    if (leave.status === "rejected" || leave.status === "cancelled") continue
    const { color, name } = resolveLeaveType(leave)

    const start = new Date(leave.start_date + "T00:00:00")
    const end = new Date(leave.end_date + "T00:00:00")
    const cursor = new Date(start)
    while (cursor <= end) {
      const dateStr = toDateStr(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())
      if (!leaveDays.has(dateStr)) {
        leaveDays.set(dateStr, {
          color,
          name,
          status: leave.status,
          startDate: leave.start_date,
          endDate: leave.end_date,
          days: leave.days_counted,
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }
  }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfWeek(viewYear, viewMonth)
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())

  const cells: Array<{ day: number | null; dateStr: string | null }> = []
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, dateStr: toDateStr(viewYear, viewMonth, d) })

  // Legend: show all tracked leave types
  const legendTypes = leaveTypes
    .filter((t) => t.has_balance && !t.is_archived)
    .map((lt) => ({ color: lt.color, name: locale === "en" && lt.name_en ? lt.name_en : lt.name }))

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden lg:h-full lg:flex lg:flex-col">
      {/* Month header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <button type="button" onClick={prevMonth} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ChevronLeft className="size-4 text-muted-foreground" />
        </button>
        <span className="text-[14px] font-medium">
          {monthNames[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="p-1.5 rounded-md hover:bg-muted transition-colors">
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 shrink-0">
        {dayHeaders.map((d, i) => (
          <div key={i} className={cn(
            "text-center py-2 text-[12px] font-medium",
            i >= 5 ? "text-muted-foreground/40" : "text-muted-foreground"
          )}>
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 lg:flex-1" style={{ gridAutoRows: "1fr" }}>
        {cells.map(({ day, dateStr }, i) => {
          const leaveInfo = dateStr ? leaveDays.get(dateStr) : null
          const isToday = dateStr === todayStr
          const isWeekend = i % 7 >= 5

          // Build tooltip
          const tooltip = leaveInfo
            ? `${leaveInfo.name}\n${formatDate(leaveInfo.startDate, locale)} – ${formatDate(leaveInfo.endDate, locale)}${leaveInfo.days ? ` (${leaveInfo.days}d)` : ""}${leaveInfo.status === "pending" ? "\n⏳ " + tl("status.pending") : ""}`
            : undefined

          return (
            <div
              key={i}
              className={cn(
                "relative h-10 lg:h-full flex items-center justify-center text-[13px]",
                !day && "bg-muted/10",
                isWeekend && day && !leaveInfo && "text-muted-foreground/40",
              )}
              title={tooltip}
            >
              {day && (
                <>
                  {leaveInfo && (
                    <div
                      className="absolute inset-[12%] rounded-md"
                      style={{ backgroundColor: leaveInfo.color + "55" }}
                    />
                  )}
                  <span className={cn(
                    "relative z-10 size-7 flex items-center justify-center rounded-full text-[13px]",
                    isToday && !leaveInfo && "bg-primary text-primary-foreground font-bold",
                    isToday && leaveInfo && "font-bold",
                    leaveInfo && !isToday && "font-medium",
                    leaveInfo && leaveInfo.status === "pending" && "opacity-60",
                  )} style={leaveInfo && isToday ? { color: leaveInfo.color } : undefined}>
                    {day}
                  </span>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Legend */}
      {legendTypes.length > 0 && (
        <div className="flex flex-wrap gap-4 px-4 py-3 border-t border-border shrink-0">
          {legendTypes.map((info) => (
            <div key={info.name} className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full border" style={{ backgroundColor: info.color + "55", borderColor: info.color }} />
              <span className="text-[13px] text-muted-foreground">{info.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
