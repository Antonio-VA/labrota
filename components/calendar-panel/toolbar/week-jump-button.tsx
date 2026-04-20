"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { getMondayOf } from "@/lib/format-date"
import type { ViewMode } from "../types"
import { TODAY } from "../constants"
import { addDays, formatToolbarLabel } from "../utils"

export function WeekJumpButton({ currentDate, weekStart, view, locale, onSelect }: {
  currentDate: string; weekStart: string; view: ViewMode; locale: string
  onSelect: (date: string) => void
}) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Build periods: when view=month show 4-week blocks, otherwise individual weeks
  // 4 past + current + 8 future = 13 entries
  const weeks = useMemo(() => {
    const step = view === "month" ? 28 : 7
    const result: { monday: string; label: string; isCurrent: boolean }[] = []
    for (let i = -4; i <= 8; i++) {
      const monday = addDays(weekStart, i * step)
      const end = addDays(monday, step - 1)
      const mDate = new Date(monday + "T12:00:00")
      const eDate = new Date(end + "T12:00:00")
      const sMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(mDate)
      const eMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(eDate)
      const label = sMon === eMon
        ? `${mDate.getDate()}–${eDate.getDate()} ${sMon}`
        : `${mDate.getDate()} ${sMon} – ${eDate.getDate()} ${eMon}`
      result.push({ monday, label, isCurrent: i === 0 })
    }
    return result
  }, [weekStart, locale, view])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-[14px] font-medium capitalize hover:bg-accent/50 px-2 py-1 rounded-md transition-colors flex items-center gap-1.5"
      >
        {formatToolbarLabel(view, currentDate, weekStart, locale)}
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[200px] max-h-[320px] overflow-y-auto">
          {weeks.map((w) => {
            const todayMonday = getMondayOf(TODAY)
            const step = view === "month" ? 28 : 7
            const isThisWeek = view === "month"
              ? todayMonday >= w.monday && todayMonday < addDays(w.monday, step)
              : w.monday === todayMonday
            return (
              <button
                key={w.monday}
                onClick={() => { onSelect(w.monday); setOpen(false) }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-[13px] capitalize hover:bg-accent transition-colors flex items-center justify-between gap-3",
                  w.isCurrent && "bg-accent font-medium",
                )}
              >
                <span>{w.label}</span>
                {isThisWeek && <span className="text-[11px] text-muted-foreground">{t("todayLabel")}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
