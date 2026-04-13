"use client"

import { useTranslations } from "next-intl"
import { daysBetween, TODAY } from "./constants"
import type { LeaveWithStaff } from "@/lib/types/database"

// ── KPI summary cards ────────────────────────────────────────────────────────

export function KpiCards({ leaves }: { leaves: LeaveWithStaff[] }) {
  const t = useTranslations("leaves")
  // Ausentes hoy — distinct staff off today
  const absentToday = new Set(
    leaves.filter((l) => l.start_date <= TODAY && l.end_date >= TODAY).map((l) => l.staff_id)
  ).size

  // Esta semana — total absence-days overlapping this Mon–Sun
  const todayDate = new Date(TODAY + "T12:00:00")
  const dayOfWeek = todayDate.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(todayDate)
  weekStart.setDate(todayDate.getDate() + mondayOffset)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const wsISO = weekStart.toISOString().split("T")[0]
  const weISO = weekEnd.toISOString().split("T")[0]

  let thisWeekDays = 0
  for (const l of leaves) {
    if (l.end_date < wsISO || l.start_date > weISO) continue
    const clampStart = l.start_date < wsISO ? wsISO : l.start_date
    const clampEnd = l.end_date > weISO ? weISO : l.end_date
    thisWeekDays += daysBetween(clampStart, clampEnd)
  }

  // Next 4 weeks — total absence days in next 28 days
  const fourWeeksOut = new Date(todayDate)
  fourWeeksOut.setDate(todayDate.getDate() + 28)
  const fourWeeksISO = fourWeeksOut.toISOString().split("T")[0]
  let next4WeeksDays = 0
  for (const l of leaves) {
    if (l.end_date < TODAY || l.start_date > fourWeeksISO) continue
    const clampStart = l.start_date < TODAY ? TODAY : l.start_date
    const clampEnd = l.end_date > fourWeeksISO ? fourWeeksISO : l.end_date
    next4WeeksDays += daysBetween(clampStart, clampEnd)
  }

  // Next 12 weeks — total absence days in next 84 days
  const twelveWeeksOut = new Date(todayDate)
  twelveWeeksOut.setDate(todayDate.getDate() + 84)
  const twelveWeeksISO = twelveWeeksOut.toISOString().split("T")[0]
  let next12WeeksDays = 0
  for (const l of leaves) {
    if (l.end_date < TODAY || l.start_date > twelveWeeksISO) continue
    const clampStart = l.start_date < TODAY ? TODAY : l.start_date
    const clampEnd = l.end_date > twelveWeeksISO ? twelveWeeksISO : l.end_date
    next12WeeksDays += daysBetween(clampStart, clampEnd)
  }

  // Pendientes de revisión
  const pendingCount = leaves.filter((l) => l.status === "pending").length

  const cards: { label: string; value: number | string; detail?: string }[] = [
    { label: t("absentToday"), value: absentToday },
    { label: t("thisWeek"), value: `${thisWeekDays}d` },
    { label: t("next4Weeks"), value: `${next4WeeksDays}d` },
    { label: t("next12Weeks"), value: `${next12WeeksDays}d` },
    { label: t("pendingReview"), value: pendingCount },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
      {cards.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-border/60 bg-background px-3 md:px-4 py-2.5 md:py-3">
          <p className="text-[11px] md:text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</p>
          <p className="text-[20px] md:text-[22px] font-semibold text-foreground mt-0.5 leading-tight">{kpi.value}</p>
          {kpi.detail && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{kpi.detail}</p>}
        </div>
      ))}
    </div>
  )
}
