"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Lock, FileDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { getMondayOfWeek } from "@/lib/rota-engine"
import {
  getRotaWeek,
  getRotaMonthSummary,
  generateRota,
  publishRota,
  unlockRota,
  type RotaWeekData,
  type RotaDay,
  type RotaMonthSummary,
} from "@/app/(clinic)/rota/actions"

// ── Types ─────────────────────────────────────────────────────────────────────

type ViewMode = "week" | "month" | "day"

// ── Constants ─────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  lab:       "bg-blue-600 text-white",
  andrology: "bg-emerald-600 text-white",
  admin:     "bg-slate-500 text-white",
}

const TODAY = new Date().toISOString().split("T")[0]

// ── Skill key map (DB key → i18n key) ─────────────────────────────────────────

const SKILL_KEYS: Record<string, string> = {
  icsi: "icsi", iui: "iui", vitrification: "vitrification", thawing: "thawing",
  biopsy: "biopsy", semen_analysis: "semenAnalysis", sperm_prep: "spermPrep",
  witnessing: "witnessing", other: "other",
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

function addMonths(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split("T")[0]
}

function getMonthStart(isoDate: string): string {
  return isoDate.slice(0, 7) + "-01"
}

function formatToolbarLabel(view: ViewMode, currentDate: string, weekStart: string, locale: string): string {
  if (view === "day") {
    const d = new Date(currentDate + "T12:00:00")
    return new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d)
  }
  if (view === "month") {
    const d = new Date(currentDate + "T12:00:00")
    return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(d)
  }
  // week
  const start = new Date(weekStart + "T12:00:00")
  const end = new Date(weekStart + "T12:00:00")
  end.setDate(start.getDate() + 6)
  const s = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(start)
  const e = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(end)
  return `${s} – ${e}`
}

// ── Staff chip ────────────────────────────────────────────────────────────────

function StaffChip({ first, last, role, isOverride }: {
  first: string; last: string; role: string; isOverride: boolean
}) {
  return (
    <div className={cn(
      "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[12px]",
      isOverride ? "border-primary/30 bg-primary/5" : "border-border bg-background"
    )}>
      <div className={cn(
        "size-5 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0",
        ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"
      )}>
        {first[0]?.toUpperCase()}{last[0]?.toUpperCase()}
      </div>
      <span className="truncate font-medium">{first} {last[0]}.</span>
    </div>
  )
}

// ── Week view ─────────────────────────────────────────────────────────────────

function WeekGrid({ data, loading, locale, onSelectDay }: {
  data: RotaWeekData | null
  loading: boolean
  locale: string
  onSelectDay: (date: string) => void
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-border overflow-hidden min-w-[560px] min-h-[400px]">
        <div className="grid grid-cols-7 h-full">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col border-r last:border-r-0">
              <div className="flex flex-col items-center py-2 border-b gap-1">
                <Skeleton className="h-3 w-6" />
                <Skeleton className="size-7 rounded-full" />
              </div>
              <div className="flex flex-col gap-1 p-2">
                <Skeleton className="h-7 w-full rounded-md" />
                <Skeleton className="h-7 w-full rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="rounded-lg border border-border overflow-hidden min-w-[560px] h-full flex flex-col">
      <div className="grid grid-cols-7 flex-1">
        {data.days.map((day) => {
          const d     = new Date(day.date + "T12:00:00")
          const wday  = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayN  = String(d.getDate())
          const today = day.date === TODAY

          return (
            <div
              key={day.date}
              className={cn("flex flex-col border-r last:border-r-0", day.isWeekend && "bg-slate-50")}
            >
              {/* Header */}
              <button
                onClick={() => onSelectDay(day.date)}
                className={cn(
                  "flex flex-col items-center py-2 border-b gap-0.5 w-full hover:bg-muted/40 transition-colors",
                  day.isWeekend && "bg-slate-100/60"
                )}
              >
                <span className="text-[10px] font-medium text-muted-foreground tracking-wide">{wday}</span>
                <div className={cn(
                  "size-7 flex items-center justify-center rounded-full text-[14px] font-medium",
                  today && "bg-primary text-primary-foreground"
                )}>
                  {dayN}
                </div>
                {day.skillGaps.length > 0 && <AlertTriangle className="size-3 text-amber-500" />}
              </button>

              {/* Assignments */}
              <div className="flex flex-col gap-1 p-2 flex-1">
                {day.assignments.map((a) => (
                  <StaffChip
                    key={a.id}
                    first={a.staff.first_name}
                    last={a.staff.last_name}
                    role={a.staff.role}
                    isOverride={a.is_manual_override}
                  />
                ))}
                {day.assignments.length === 0 && (
                  <span className="text-[11px] text-muted-foreground text-center mt-4">—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Month view ────────────────────────────────────────────────────────────────

const DOW_HEADERS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const DOW_HEADERS_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]

function MonthGrid({ summary, loading, locale, currentDate, onSelectDay }: {
  summary: RotaMonthSummary | null
  loading: boolean
  locale: string
  currentDate: string
  onSelectDay: (date: string) => void
}) {
  const headers = locale === "es" ? DOW_HEADERS_ES : DOW_HEADERS_EN

  if (loading || !summary) {
    return (
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {headers.map((h) => (
            <div key={h} className="text-center text-[11px] font-medium text-muted-foreground py-1">{h}</div>
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, w) => (
          <div key={w} className="grid grid-cols-7 gap-1">
            {Array.from({ length: 7 }).map((_, d) => (
              <Skeleton key={d} className="h-14 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  // Group into weeks
  const weeks: (typeof summary.days)[] = []
  for (let i = 0; i < summary.days.length; i += 7) {
    weeks.push(summary.days.slice(i, i + 7))
  }

  return (
    <div className="flex flex-col gap-1">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {headers.map((h) => (
          <div key={h} className="text-center text-[11px] font-medium text-muted-foreground py-1">{h}</div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 gap-1">
          {week.map((day) => {
            const isToday    = day.date === TODAY
            const isSelected = day.date === currentDate
            const dayNum     = String(new Date(day.date + "T12:00:00").getDate())

            return (
              <button
                key={day.date}
                onClick={() => onSelectDay(day.date)}
                className={cn(
                  "relative flex flex-col items-start p-2 rounded-lg border text-left transition-colors min-h-[56px]",
                  !day.isCurrentMonth && "opacity-40",
                  day.isWeekend && "bg-slate-50",
                  isSelected && "border-primary",
                  !isSelected && "border-border hover:bg-muted/40"
                )}
              >
                <div className={cn(
                  "size-6 flex items-center justify-center rounded-full text-[13px] font-medium mb-1",
                  isToday && "bg-primary text-primary-foreground"
                )}>
                  {dayNum}
                </div>
                {day.staffCount > 0 && (
                  <div className="flex items-center gap-1">
                    <span className="text-[11px] text-muted-foreground">{day.staffCount}</span>
                    {day.hasSkillGaps && <AlertTriangle className="size-3 text-amber-500" />}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ── Day view ──────────────────────────────────────────────────────────────────

function DayView({ day, loading, locale }: {
  day: RotaDay | null
  loading: boolean
  locale: string
}) {
  const t  = useTranslations("schedule")
  const ts = useTranslations("skills")

  if (loading) {
    return (
      <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">
        <Skeleton className="h-5 w-48" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!day || day.assignments.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={t("noRota")}
        description={t("noRotaDescription")}
      />
    )
  }

  // Group by role
  const byRole: Record<string, typeof day.assignments> = { lab: [], andrology: [], admin: [] }
  for (const a of day.assignments) {
    byRole[a.staff.role]?.push(a)
  }

  return (
    <div className="flex flex-col gap-5 max-w-lg mx-auto w-full">
      {/* Skill coverage */}
      {(day.skillGaps.length > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[13px] font-medium text-amber-800">{t("insufficientCoverage")}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {day.skillGaps.map((sk) => (
                <Badge key={sk} variant="skill-gap">
                  {ts(SKILL_KEYS[sk] as Parameters<typeof ts>[0])}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Staff by role */}
      {(["lab", "andrology", "admin"] as const).map((role) => {
        const staff = byRole[role]
        if (!staff || staff.length === 0) return null
        return (
          <div key={role} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Badge variant={role}>{role}</Badge>
              <span className="text-[13px] text-muted-foreground">{staff.length}</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {staff.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg border",
                    a.is_manual_override ? "border-primary/30 bg-primary/5" : "border-border bg-background"
                  )}
                >
                  <div className={cn(
                    "size-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0",
                    ROLE_COLORS[role]
                  )}>
                    {a.staff.first_name[0]?.toUpperCase()}{a.staff.last_name[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                    {a.is_manual_override && (
                      <p className="text-[12px] text-primary">Manual override</p>
                    )}
                  </div>
                  <Badge variant="outline" className="text-[11px] shrink-0">{a.shift_type}</Badge>
                </div>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Override dialog ───────────────────────────────────────────────────────────

function OverrideDialog({ onKeep, onRegenerate, onCancel, isPending }: {
  onKeep: () => void; onRegenerate: () => void; onCancel: () => void; isPending: boolean
}) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between shrink-0">
      <div>
        <p className="text-[14px] font-medium text-amber-800">{t("preserveOverrides")}</p>
        <p className="text-[13px] text-amber-700">{t("preserveOverridesDescription")}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={onKeep} disabled={isPending}>{t("keepOverrides")}</Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isPending}>{t("regenerateAll")}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>{tc("cancel")}</Button>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CalendarPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const t      = useTranslations("schedule")
  const tc     = useTranslations("common")
  const ts     = useTranslations("skills")
  const locale = useLocale()

  const [view, setView]               = useState<ViewMode>("week")
  const [currentDate, setCurrentDate] = useState(TODAY)
  const [weekData, setWeekData]       = useState<RotaWeekData | null>(null)
  const [monthSummary, setMonthSummary] = useState<RotaMonthSummary | null>(null)
  const [loadingWeek, setLoadingWeek]   = useState(true)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [showOverrideDialog, setShowOverrideDialog] = useState(false)
  const [isPending, startTransition]    = useTransition()

  // Derived
  const weekStart  = getMondayOfWeek(new Date(currentDate + "T12:00:00"))
  const monthStart = getMonthStart(currentDate)

  // Fetch week data whenever the week changes
  const fetchWeek = useCallback((ws: string) => {
    setLoadingWeek(true)
    setError(null)
    getRotaWeek(ws).then((d) => {
      setWeekData(d)
      setLoadingWeek(false)
    })
  }, [])

  // Fetch month summary whenever month or view changes
  const fetchMonth = useCallback((ms: string) => {
    setLoadingMonth(true)
    getRotaMonthSummary(ms).then((d) => {
      setMonthSummary(d)
      setLoadingMonth(false)
    })
  }, [])

  useEffect(() => { fetchWeek(weekStart) }, [weekStart, fetchWeek])
  useEffect(() => {
    if (view === "month") fetchMonth(monthStart)
  }, [monthStart, view, fetchMonth])

  // External refresh trigger (e.g. after agent generates a rota)
  useEffect(() => {
    if (refreshKey === 0) return
    fetchWeek(weekStart)
    if (view === "month") fetchMonth(monthStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // Navigation
  function navigate(dir: -1 | 1) {
    setShowOverrideDialog(false)
    if (view === "day")   setCurrentDate((d) => addDays(d, dir))
    else if (view === "week")  setCurrentDate((d) => addDays(d, dir * 7))
    else setCurrentDate((d) => addMonths(d, dir))
  }

  function goToToday() {
    setCurrentDate(TODAY)
    setShowOverrideDialog(false)
  }

  // Generate / publish / unlock
  function handleGenerateClick() {
    const hasAssignments = weekData?.days.some((d) => d.assignments.length > 0)
    if (hasAssignments) setShowOverrideDialog(true)
    else runGenerate(false)
  }

  function runGenerate(preserve: boolean) {
    setShowOverrideDialog(false)
    startTransition(async () => {
      const result = await generateRota(weekStart, preserve)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handlePublish() {
    if (!weekData?.rota) return
    startTransition(async () => {
      const result = await publishRota(weekData.rota!.id)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handleUnlock() {
    if (!weekData?.rota) return
    startTransition(async () => {
      const result = await unlockRota(weekData.rota!.id)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handleSelectDay(date: string) {
    setCurrentDate(date)
    setView("day")
  }

  const rota           = weekData?.rota ?? null
  const isPublished    = rota?.status === "published"
  const isDraft        = rota?.status === "draft"
  const hasAssignments = weekData?.days.some((d) => d.assignments.length > 0) ?? false
  const hasSkillGaps   = weekData?.days.some((d) => d.skillGaps.length > 0) ?? false
  const currentDayData = weekData?.days.find((d) => d.date === currentDate) ?? null

  const showActions = view !== "month"

  // Build detailed skill gap descriptions for the banner
  const skillGapDetails = weekData?.days
    .filter((d) => d.skillGaps.length > 0)
    .flatMap((d) => {
      const dayLabel = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric" }).format(
        new Date(d.date + "T12:00:00")
      )
      return d.skillGaps.map((sk) => ({
        skill: ts(SKILL_KEYS[sk] as Parameters<typeof ts>[0]),
        day: dayLabel,
      }))
    }) ?? []

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Secondary toolbar — calendar controls only (no page title, that lives in the global top bar) */}
      <div className="hidden md:flex items-center justify-between border-b px-4 h-12 gap-3 shrink-0 bg-background">
        {/* Left: nav controls + date label */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday} disabled={currentDate === TODAY}>
            {tc("today")}
          </Button>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label={t("previousPeriod")}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label={t("nextPeriod")}>
              <ChevronRight />
            </Button>
          </div>
          <span className="text-[14px] font-medium capitalize">
            {formatToolbarLabel(view, currentDate, weekStart, locale)}
          </span>
        </div>

        {/* Right: view toggle + action buttons */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5">
            {(["week", "month", "day"] as ViewMode[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={cn(
                  "rounded-md px-3 py-1 text-[13px] transition-colors",
                  view === v
                    ? "bg-background shadow-sm font-medium"
                    : "text-muted-foreground hover:bg-muted"
                )}
              >
                {t(`${v}View`)}
              </button>
            ))}
          </div>

          {showActions && (
            <>
              {hasAssignments && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(`/rota/${weekStart}/print`, "_blank")}
                >
                  <FileDown className="size-3.5" />
                  {t("exportPdf")}
                </Button>
              )}
              {isPublished && (
                <Button variant="outline" size="sm" onClick={handleUnlock} disabled={isPending}>
                  <Lock className="size-3.5" />
                  {t("unlockRota")}
                </Button>
              )}
              {isDraft && hasAssignments && (
                <Button variant="outline" size="sm" onClick={handlePublish} disabled={isPending}>
                  {t("publishRota")}
                </Button>
              )}
              {!isPublished && (
                <Button size="sm" onClick={handleGenerateClick} disabled={isPending || loadingWeek}>
                  {isPending ? tc("generating") : hasAssignments ? t("regenerateRota") : t("generateRota")}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Mobile toolbar — nav controls only */}
      <div className="flex md:hidden items-center justify-between border-b px-4 py-2 gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToToday} disabled={currentDate === TODAY}>
            {tc("today")}
          </Button>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(-1)} aria-label={t("previousPeriod")}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={() => navigate(1)} aria-label={t("nextPeriod")}>
              <ChevronRight />
            </Button>
          </div>
          <span className="text-[13px] font-medium capitalize">
            {formatToolbarLabel(view, currentDate, weekStart, locale)}
          </span>
        </div>
        {showActions && !isPublished && (
          <Button size="sm" onClick={handleGenerateClick} disabled={isPending || loadingWeek}>
            {isPending ? tc("generating") : hasAssignments ? t("regenerateRota") : t("generateRota")}
          </Button>
        )}
      </div>

      {/* Banners */}
      <div className="flex flex-col gap-2 px-4 pt-3 empty:hidden shrink-0">
        {isPublished && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 flex items-center gap-2">
            <Lock className="size-3.5 text-emerald-600 shrink-0" />
            <span className="text-[13px] text-emerald-700">
              {rota?.published_at
                ? t("rotaPublishedBy", {
                    date: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(rota.published_at)),
                    author: "—",
                  })
                : t("rotaPublished")}
            </span>
          </div>
        )}
        {hasSkillGaps && !isPublished && view !== "month" && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2">
            <AlertTriangle className="size-3.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-amber-800">{t("insufficientCoverage")}</span>
              {skillGapDetails.map((g, i) => (
                <span key={i} className="text-[12px] text-amber-700">
                  {g.skill} · {g.day}
                </span>
              ))}
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
            <span className="text-[13px] text-destructive">{error}</span>
          </div>
        )}
        {showOverrideDialog && (
          <OverrideDialog
            onKeep={() => runGenerate(true)}
            onRegenerate={() => runGenerate(false)}
            onCancel={() => setShowOverrideDialog(false)}
            isPending={isPending}
          />
        )}
      </div>

      {/* Content — flex-1 with overflow-hidden so children can fill height */}
      <div className="flex-1 overflow-hidden flex flex-col">

        {/* Week view — fills available height */}
        {view === "week" && (
          <div className="hidden md:flex flex-col flex-1 min-h-0 px-4 py-3">
            {!weekData?.rota && !loadingWeek && !isPending ? (
              <EmptyState
                icon={CalendarDays}
                title={t("noRota")}
                description={t("noRotaDescription")}
                action={{ label: t("generateRota"), onClick: handleGenerateClick }}
              />
            ) : (
              <WeekGrid
                data={weekData}
                loading={loadingWeek}
                locale={locale}
                onSelectDay={handleSelectDay}
              />
            )}
          </div>
        )}

        {/* Month view */}
        {view === "month" && (
          <div className="hidden md:block overflow-auto flex-1 px-4 py-3">
            <div className="max-w-2xl">
              <MonthGrid
                summary={monthSummary}
                loading={loadingMonth}
                locale={locale}
                currentDate={currentDate}
                onSelectDay={handleSelectDay}
              />
            </div>
          </div>
        )}

        {/* Day view — always on mobile, conditional on desktop */}
        <div className={cn(
          "flex flex-col gap-4 overflow-auto px-4 py-3",
          view === "day" ? "md:flex" : "md:hidden"
        )}>
          <DayView
            day={currentDayData}
            loading={loadingWeek}
            locale={locale}
          />
        </div>
      </div>
    </main>
  )
}
