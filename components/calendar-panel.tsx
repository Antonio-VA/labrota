"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { CalendarDays, ChevronLeft, ChevronRight, AlertTriangle, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { getMondayOfWeek, getWeekDates } from "@/lib/rota-engine"
import {
  getRotaWeek,
  generateRota,
  publishRota,
  unlockRota,
  type RotaWeekData,
  type RotaDay,
} from "@/app/(clinic)/rota/actions"

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  lab:       "bg-blue-100 text-blue-700",
  andrology: "bg-emerald-100 text-emerald-700",
  admin:     "bg-slate-100 text-slate-600",
}

function formatDayHeader(isoDate: string, locale: string): { weekday: string; day: string } {
  const d = new Date(isoDate + "T12:00:00")
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase(),
    day: String(d.getDate()),
  }
}

function formatMonthYear(weekStart: string, locale: string): string {
  const start = new Date(weekStart + "T12:00:00")
  const end = new Date(weekStart + "T12:00:00")
  end.setDate(start.getDate() + 6)
  const startStr = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(start)
  const endStr   = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(end)
  return `${startStr} – ${endStr}`
}

function isToday(isoDate: string): boolean {
  return isoDate === new Date().toISOString().split("T")[0]
}

function addWeeks(weekStart: string, n: number): string {
  const d = new Date(weekStart + "T12:00:00")
  d.setDate(d.getDate() + n * 7)
  return d.toISOString().split("T")[0]
}

// ── Staff chip ────────────────────────────────────────────────────────────────

function StaffChip({
  first,
  last,
  role,
  isOverride,
}: {
  first: string
  last: string
  role: string
  isOverride: boolean
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md border text-[12px]",
        isOverride ? "border-primary/30 bg-primary/5" : "border-border bg-background"
      )}
    >
      <div
        className={cn(
          "size-5 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0",
          ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"
        )}
      >
        {first[0]?.toUpperCase()}{last[0]?.toUpperCase()}
      </div>
      <span className="truncate font-medium">{first} {last[0]}.</span>
    </div>
  )
}

// ── Day column ────────────────────────────────────────────────────────────────

function DayColumn({ day, locale, published }: { day: RotaDay; locale: string; published: boolean }) {
  const { weekday, day: dayNum } = formatDayHeader(day.date, locale)
  const today = isToday(day.date)

  return (
    <div className={cn("flex flex-col border-r last:border-r-0", day.isWeekend && "bg-muted/20")}>
      {/* Header */}
      <div
        className={cn(
          "flex flex-col items-center py-2 border-b gap-0.5",
          day.isWeekend && "bg-muted/30"
        )}
      >
        <span className="text-[10px] font-medium text-muted-foreground tracking-wide">{weekday}</span>
        <div
          className={cn(
            "size-7 flex items-center justify-center rounded-full text-[14px] font-medium",
            today && "bg-primary text-primary-foreground"
          )}
        >
          {dayNum}
        </div>
        {day.skillGaps.length > 0 && (
          <AlertTriangle className="size-3 text-amber-500" />
        )}
      </div>

      {/* Assignments */}
      <div className="flex flex-col gap-1 p-2 flex-1 min-h-[120px]">
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
}

// ── Skeleton week ─────────────────────────────────────────────────────────────

function WeekSkeleton() {
  return (
    <div className="grid grid-cols-7 border rounded-lg overflow-hidden">
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
  )
}

// ── Override dialog ───────────────────────────────────────────────────────────

function OverrideDialog({
  onKeep,
  onRegenerate,
  onCancel,
  isPending,
}: {
  onKeep: () => void
  onRegenerate: () => void
  onCancel: () => void
  isPending: boolean
}) {
  const t = useTranslations("schedule")
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div>
        <p className="text-[14px] font-medium text-amber-800">{t("preserveOverrides")}</p>
        <p className="text-[13px] text-amber-700">{t("preserveOverridesDescription")}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={onKeep} disabled={isPending}>
          {t("keepOverrides")}
        </Button>
        <Button size="sm" variant="outline" onClick={onRegenerate} disabled={isPending}>
          {t("regenerateAll")}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isPending}>
          {useTranslations("common")("cancel")}
        </Button>
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function CalendarPanel() {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale()

  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek())
  const [data, setData]           = useState<RotaWeekData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [showOverrideDialog, setShowOverrideDialog] = useState(false)
  const [isPending, startTransition] = useTransition()

  const fetchWeek = useCallback((ws: string) => {
    setLoading(true)
    setError(null)
    getRotaWeek(ws).then((d) => {
      setData(d)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    fetchWeek(weekStart)
  }, [weekStart, fetchWeek])

  function goToToday() {
    setWeekStart(getMondayOfWeek())
    setShowOverrideDialog(false)
  }

  function goToPrev() {
    setWeekStart((ws) => addWeeks(ws, -1))
    setShowOverrideDialog(false)
  }

  function goToNext() {
    setWeekStart((ws) => addWeeks(ws, 1))
    setShowOverrideDialog(false)
  }

  function handleGenerateClick() {
    const hasAssignments = data?.days.some((d) => d.assignments.length > 0)
    if (hasAssignments) {
      setShowOverrideDialog(true)
    } else {
      runGenerate(false)
    }
  }

  function runGenerate(preserve: boolean) {
    setShowOverrideDialog(false)
    startTransition(async () => {
      const result = await generateRota(weekStart, preserve)
      if (result.error) {
        setError(result.error)
      } else {
        fetchWeek(weekStart)
      }
    })
  }

  function handlePublish() {
    if (!data?.rota) return
    startTransition(async () => {
      const result = await publishRota(data.rota!.id)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handleUnlock() {
    if (!data?.rota) return
    startTransition(async () => {
      const result = await unlockRota(data.rota!.id)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  const rota            = data?.rota ?? null
  const isPublished     = rota?.status === "published"
  const isDraft         = rota?.status === "draft"
  const hasAssignments  = data?.days.some((d) => d.assignments.length > 0) ?? false
  const hasSkillGaps    = data?.days.some((d) => d.skillGaps.length > 0) ?? false
  const todayWeekStart  = getMondayOfWeek()

  return (
    <main className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2 gap-3 flex-wrap shrink-0">
        {/* Left: navigation */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToToday}
            disabled={weekStart === todayWeekStart}
          >
            {tc("today")}
          </Button>
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon-sm" onClick={goToPrev} aria-label={t("previousPeriod")}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={goToNext} aria-label={t("nextPeriod")}>
              <ChevronRight />
            </Button>
          </div>
          <span className="text-[14px] font-medium">
            {formatMonthYear(weekStart, locale)}
          </span>
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-2">
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
            <Button size="sm" onClick={handleGenerateClick} disabled={isPending || loading}>
              {isPending
                ? tc("generating")
                : hasAssignments
                ? t("regenerateRota")
                : t("generateRota")}
            </Button>
          )}
        </div>
      </div>

      {/* Banners */}
      <div className="flex flex-col gap-2 px-4 pt-3 shrink-0">
        {/* Published banner */}
        {isPublished && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 flex items-center gap-2">
            <Lock className="size-3.5 text-emerald-600 shrink-0" />
            <span className="text-[13px] text-emerald-700">
              {rota?.published_at
                ? t("rotaPublishedBy", {
                    date: new Intl.DateTimeFormat(locale, {
                      day: "numeric", month: "short", year: "numeric",
                    }).format(new Date(rota.published_at)),
                    author: "—",
                  })
                : t("rotaPublished")}
            </span>
          </div>
        )}

        {/* Skill gap banner */}
        {hasSkillGaps && !isPublished && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 flex items-center gap-2">
            <AlertTriangle className="size-3.5 text-amber-500 shrink-0" />
            <span className="text-[13px] text-amber-700">{t("insufficientCoverage")}</span>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2">
            <span className="text-[13px] text-destructive">{error}</span>
          </div>
        )}

        {/* Override dialog */}
        {showOverrideDialog && (
          <OverrideDialog
            onKeep={() => runGenerate(true)}
            onRegenerate={() => runGenerate(false)}
            onCancel={() => setShowOverrideDialog(false)}
            isPending={isPending}
          />
        )}
      </div>

      {/* Calendar grid */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {loading ? (
          <WeekSkeleton />
        ) : !rota && !isPending ? (
          <div className="flex flex-1 flex-col">
            <EmptyState
              icon={CalendarDays}
              title={t("noRota")}
              description={t("noRotaDescription")}
              action={{ label: t("generateRota"), onClick: handleGenerateClick }}
            />
          </div>
        ) : data ? (
          <div className="rounded-lg border border-border overflow-hidden min-w-[560px]">
            <div className="grid grid-cols-7">
              {data.days.map((day) => (
                <DayColumn
                  key={day.date}
                  day={day}
                  locale={locale}
                  published={isPublished}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  )
}
