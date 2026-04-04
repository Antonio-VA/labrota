"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { AlertTriangle, Check } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaDayWarning, RotaDay } from "@/app/(clinic)/rota/actions"
import { WARNING_CATEGORY_KEY, WARNING_CATEGORY_ORDER } from "./constants"

// ── Skill gap pill ────────────────────────────────────────────────────────────

/** Click-to-open popover for per-day warnings in column headers. */
export function DayWarningPopover({ warnings }: { warnings: RotaDayWarning[] }) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Group by category
  const groups: Record<string, string[]> = {}
  for (const w of warnings) {
    if (!groups[w.category]) groups[w.category] = []
    groups[w.category].push(w.message)
  }
  const sortedCategories = Object.keys(groups).sort(
    (a, b) => (WARNING_CATEGORY_ORDER[a] ?? 9) - (WARNING_CATEGORY_ORDER[b] ?? 9)
  )

  return (
    <div ref={ref} className="absolute top-[6px] right-[6px] z-10">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        className="cursor-pointer"
      >
        <AlertTriangle className="size-[14px] text-amber-500" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-border bg-background shadow-lg py-2 px-3">
          {sortedCategories.map((cat) => (
            <div key={cat} className="mb-2 last:mb-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                {WARNING_CATEGORY_KEY[cat] ? t(WARNING_CATEGORY_KEY[cat]) : cat}
              </p>
              {groups[cat].map((msg, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">· {msg}</p>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Toolbar pill summarising all warnings for the week. Click to expand. */
export function WarningsPill({ days, staffList }: { days: RotaDay[]; staffList?: StaffWithSkills[] }) {
  const t = useTranslations("schedule")
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const locale = useLocale()

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  // Collect all warnings grouped by category, then by day
  const byCategory: Record<string, { day: string; messages: string[] }[]> = {}
  for (const day of days) {
    if (day.warnings.length === 0) continue
    const dayLabel = new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric" }).format(
      new Date(day.date + "T12:00:00")
    )
    for (const w of day.warnings) {
      if (!byCategory[w.category]) byCategory[w.category] = []
      const existing = byCategory[w.category].find((e) => e.day === dayLabel)
      if (existing) existing.messages.push(w.message)
      else byCategory[w.category].push({ day: dayLabel, messages: [w.message] })
    }
  }

  // Compute shift budget warnings (over/under for the week)
  if (staffList && staffList.length > 0) {
    const shiftCounts: Record<string, number> = {}
    for (const day of days) {
      for (const a of day.assignments) {
        shiftCounts[a.staff_id] = (shiftCounts[a.staff_id] ?? 0) + 1
      }
    }
    const budgetWarnings: string[] = []
    for (const s of staffList) {
      const count = shiftCounts[s.id] ?? 0
      const expected = s.days_per_week ?? 5
      if (count > expected) budgetWarnings.push(`${s.first_name} ${s.last_name[0]}. ${count}/${expected} (+${count - expected})`)
      else if (count < expected && count > 0) budgetWarnings.push(`${s.first_name} ${s.last_name[0]}. ${count}/${expected} (${count - expected})`)
    }
    if (budgetWarnings.length > 0) {
      if (!byCategory["budget"]) byCategory["budget"] = []
      byCategory["budget"].push({ day: t("weekView"), messages: budgetWarnings })
    }
  }

  const sortedCategories = Object.keys(byCategory).sort(
    (a, b) => (WARNING_CATEGORY_ORDER[a] ?? 9) - (WARNING_CATEGORY_ORDER[b] ?? 9)
  )

  const totalIssues = Object.values(byCategory).reduce((sum, arr) => sum + arr.reduce((s, e) => s + e.messages.length, 0), 0)

  if (totalIssues === 0) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <span className="cursor-default">
            <Check className="size-4 text-emerald-500 dark:text-emerald-400 shrink-0" />
          </span>
        } />
        <TooltipContent side="bottom">{t("noWarnings")}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 h-7 px-1.5 rounded-md text-amber-500 dark:text-amber-400 text-[12px] font-semibold hover:bg-amber-500/10 transition-colors shrink-0"
      >
        <AlertTriangle className="size-4 shrink-0" />
        <span className="tabular-nums">{totalIssues}</span>
      </button>

      {open && (() => {
        const uniqueDays = new Set<string>()
        for (const arr of Object.values(byCategory)) for (const e of arr) uniqueDays.add(e.day)
        const singleDay = uniqueDays.size === 1
        return (
          <div className="absolute right-0 top-full mt-1 z-[200] w-[min(320px,90vw)] rounded-lg border border-border bg-background shadow-lg py-2.5 max-h-[50vh] overflow-y-auto">
            {singleDay && <p className="px-3 pb-1.5 text-[13px] font-medium capitalize">{[...uniqueDays][0]}</p>}
            {sortedCategories.map((cat) => (
              <div key={cat} className="px-3 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  {WARNING_CATEGORY_KEY[cat] ? t(WARNING_CATEGORY_KEY[cat]) : cat}
                </p>
                {byCategory[cat].map(({ day, messages }) => (
                  <div key={day} className="mb-2 last:mb-0">
                    {!singleDay && <p className="text-[13px] font-medium capitalize">{day}</p>}
                    {messages.map((msg, mi) => (
                      <p key={mi} className="text-[12px] text-muted-foreground pl-2 leading-relaxed">· {msg}</p>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )
      })()}
    </div>
  )
}
