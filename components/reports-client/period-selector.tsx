"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"


// ── Period presets ────────────────────────────────────────────────────────────

type PeriodKey = "this_week" | "last_4_weeks" | "this_month" | "last_month" | "custom"

export function getPresetDates(key: PeriodKey): { from: string; to: string } | null {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().split("T")[0]

  if (key === "this_week") {
    const dow = today.getDay()
    const mon = new Date(today)
    mon.setDate(today.getDate() - ((dow + 6) % 7))
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    return { from: iso(mon), to: iso(sun) }
  }
  if (key === "last_4_weeks") {
    const sun = new Date(today)
    const dow = today.getDay()
    sun.setDate(today.getDate() - ((dow + 6) % 7) + 6)
    const mon = new Date(sun)
    mon.setDate(sun.getDate() - 27)
    return { from: iso(mon), to: iso(sun) }
  }
  if (key === "this_month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { from: iso(first), to: iso(last) }
  }
  if (key === "last_month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const last = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: iso(first), to: iso(last) }
  }
  return null
}

// ── Period selector ──────────────────────────────────────────────────────────

export function PeriodSelector({ onGenerate, onCancel }: {
  onGenerate: (from: string, to: string) => void
  onCancel: () => void
}) {
  const t = useTranslations("reports")
  const tc = useTranslations("common")
  const [period, setPeriod] = useState<PeriodKey>("last_4_weeks")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  function handleGenerate() {
    if (period === "custom") {
      if (!customFrom || !customTo) { toast.error(t("selectBothDates")); return }
      const diffMs = new Date(customTo).getTime() - new Date(customFrom).getTime()
      if (diffMs < 0) { toast.error(t("startBeforeEnd")); return }
      if (diffMs > 365 * 24 * 60 * 60 * 1000) { toast.error(t("max12Months")); return }
      onGenerate(customFrom, customTo)
    } else {
      const dates = getPresetDates(period)!
      onGenerate(dates.from, dates.to)
    }
  }

  const options: { key: PeriodKey; label: string }[] = [
    { key: "this_week", label: t("thisWeek") },
    { key: "last_4_weeks", label: t("last4Weeks") },
    { key: "this_month", label: t("thisMonth") },
    { key: "last_month", label: t("lastMonth") },
    { key: "custom", label: t("custom") },
  ]

  return (
    <div className="rounded-lg border border-border bg-background p-5 max-w-md">
      <p className="text-[14px] font-medium mb-4">{t("selectPeriod")}</p>
      <div className="flex flex-col gap-2 mb-4">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="period"
              checked={period === o.key}
              onChange={() => setPeriod(o.key)}
              className="size-4 accent-primary"
            />
            <span className="text-[14px]">{o.label}</span>
          </label>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex gap-3 mb-4">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="flex-1" />
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="flex-1" />
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={handleGenerate}>{tc("generate")}</Button>
        <Button variant="ghost" onClick={onCancel}>{tc("cancel")}</Button>
      </div>
    </div>
  )
}

// ── Month Selector (for Extra Days report — past months only) ───────────────

// ── Month Selector (for Extra Days report — past months only) ───────────────

export function MonthSelector({ onGenerate, onCancel }: {
  onGenerate: (month: string) => void
  onCancel: () => void
}) {
  const t = useTranslations("reports")
  const tc = useTranslations("common")
  const today = new Date()
  // Default to last month
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const defaultMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`
  const [month, setMonth] = useState(defaultMonth)

  // Max allowed: month before current
  const maxMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`

  return (
    <div className="rounded-lg border border-border bg-background p-5 max-w-md">
      <p className="text-[14px] font-medium mb-4">{t("selectMonth")}</p>
      <div className="flex flex-col gap-3 mb-4">
        <Input type="month" value={month} max={maxMonth} onChange={(e) => setMonth(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">{t("onlyPastMonths")}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => month && onGenerate(month)}>{tc("generate")}</Button>
        <Button variant="ghost" onClick={onCancel}>{tc("cancel")}</Button>
      </div>
    </div>
  )
}

