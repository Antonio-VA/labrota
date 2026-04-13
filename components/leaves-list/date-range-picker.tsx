"use client"

import { useState, useCallback } from "react"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { formatDate } from "@/lib/format-date"
import { cn } from "@/lib/utils"

// ── Helpers ──────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string[]> = {
  es: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
}
const DAY_NAMES: Record<string, string[]> = {
  es: ["Lu","Ma","Mi","Ju","Vi","Sá","Do"],
  en: ["Mo","Tu","We","Th","Fr","Sa","Su"],
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

// ── DateRangePicker (booking.com style) ──────────────────────────────────────

export function DateRangePicker({
  startDate,
  endDate,
  onChange,
  disabled,
  locale,
  label,
}: {
  startDate: string | null
  endDate: string | null
  onChange: (start: string, end: string) => void
  disabled?: boolean
  locale: "es" | "en"
  label: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selecting, setSelecting] = useState<"start" | "end">("start")
  const [tempStart, setTempStart] = useState<string | null>(startDate)
  const [tempEnd, setTempEnd] = useState<string | null>(endDate)
  const today = new Date()
  const initialMonth = startDate ? new Date(startDate + "T12:00:00") : today
  const [viewYear, setViewYear] = useState(initialMonth.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialMonth.getMonth())

  const months = MONTH_NAMES[locale] ?? MONTH_NAMES.en
  const days = DAY_NAMES[locale] ?? DAY_NAMES.en

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }, [viewMonth])
  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }, [viewMonth])

  function handleDayClick(iso: string) {
    if (selecting === "start") {
      setTempStart(iso)
      setTempEnd(null)
      setSelecting("end")
    } else {
      if (tempStart && iso < tempStart) {
        // Tapped before start — restart
        setTempStart(iso)
        setTempEnd(null)
        setSelecting("end")
      } else {
        setTempEnd(iso)
        onChange(tempStart!, iso)
        setSelecting("start")
        setIsOpen(false)
      }
    }
  }

  function handleOpen() {
    if (disabled) return
    setTempStart(startDate)
    setTempEnd(endDate)
    setSelecting("start")
    if (startDate) {
      const d = new Date(startDate + "T12:00:00")
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
    setIsOpen(true)
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  let startDow = firstDay.getDay() - 1 // Mon=0
  if (startDow < 0) startDow = 6
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const fmtDisplay = (iso: string | null) => {
    if (!iso) return "—"
    return formatDate(iso + "T12:00:00", locale as "es" | "en")
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[14px] font-medium">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-left flex items-center gap-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <CalendarDays className="size-4 text-muted-foreground shrink-0" />
        <span className={startDate ? "text-foreground" : "text-muted-foreground"}>
          {startDate && endDate
            ? `${fmtDisplay(startDate)} — ${fmtDisplay(endDate)}`
            : startDate
              ? fmtDisplay(startDate)
              : locale === "es" ? "Seleccionar fechas" : "Select dates"}
        </span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 flex items-end md:items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}>
            <div className="bg-background border border-border rounded-xl shadow-lg p-4 w-full max-w-[320px] animate-in fade-in-0 zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
              {/* Selection hint */}
              <p className="text-[12px] text-muted-foreground text-center mb-2">
                {selecting === "start"
                  ? (locale === "es" ? "Selecciona fecha de inicio" : "Select start date")
                  : (locale === "es" ? "Selecciona fecha de fin" : "Select end date")}
              </p>

              {/* Month nav */}
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-[14px] font-medium">
                  {months[viewMonth]} {viewYear}
                </span>
                <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronRight className="size-4" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-0 mb-0.5">
                {days.map((d) => (
                  <div key={d} className="text-[11px] font-medium text-muted-foreground text-center py-1">{d}</div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-0">
                {cells.map((day, i) => {
                  if (day === null) return <div key={i} />
                  const iso = toISO(new Date(viewYear, viewMonth, day))
                  const isStart = iso === tempStart
                  const isEnd = iso === tempEnd
                  const inRange = tempStart && tempEnd && iso > tempStart && iso < tempEnd
                  const isToday = iso === toISO(today)

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleDayClick(iso)}
                      className={cn(
                        "h-8 text-[13px] rounded-md transition-colors relative",
                        isStart || isEnd
                          ? "bg-primary text-white font-semibold"
                          : inRange
                            ? "bg-primary/10 text-primary font-medium"
                            : isToday
                              ? "font-semibold text-primary"
                              : "text-foreground hover:bg-muted",
                      )}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
