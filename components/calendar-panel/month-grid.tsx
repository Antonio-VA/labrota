"use client"

import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase, Check, Lock } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { computeBiopsyForecast } from "@/lib/biopsy-forecast"
import { rotateArray } from "./utils"
import { DayStatsInput } from "./day-stats-input"
import { useStaffHover } from "@/components/staff-hover-context"
import { TODAY, DOW_HEADERS_ES, DOW_HEADERS_EN } from "./constants"
import type { RotaMonthSummary } from "@/app/(clinic)/rota/actions"

export function MonthGrid({ summary, loading, locale, currentDate: _currentDate, onSelectDay, onSelectWeek, firstDayOfWeek = 0, punctionsOverride = {}, onPunctionsChange, onBiopsyChange, monthViewMode = "shift", colorChips }: {
  summary: RotaMonthSummary | null
  loading: boolean
  locale: string
  currentDate: string
  onSelectDay: (date: string) => void
  onSelectWeek: (weekStart: string) => void
  firstDayOfWeek?: number
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  monthViewMode?: "shift" | "person"
  colorChips?: boolean
}) {
  const t = useTranslations("schedule")
  const { hoveredStaffId, setHovered } = useStaffHover()
  const baseHeaders = locale === "es" ? DOW_HEADERS_ES : DOW_HEADERS_EN
  const headers = rotateArray(baseHeaders, firstDayOfWeek)

  if (loading || !summary) {
    return (
      <div className="flex flex-col gap-1">
        <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5 mb-1">
          <div />
          {headers.map((h) => (
            <div key={h} className="text-center text-[11px] font-medium text-muted-foreground py-1">{h}</div>
          ))}
        </div>
        {Array.from({ length: 4 }).map((_, w) => (
          <div key={w} className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5">
            <Skeleton className="h-[120px] rounded-lg" />
            {Array.from({ length: 7 }).map((_, d) => (
              <Skeleton key={d} className="h-[120px] rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    )
  }

  const weeks: (typeof summary.days)[] = []
  for (let i = 0; i < summary.days.length; i += 7) {
    weeks.push(rotateArray(summary.days.slice(i, i + 7), firstDayOfWeek))
  }

  const weekStatusMap = Object.fromEntries(summary.weekStatuses.map((ws) => [ws.weekStart, ws.status]))

  // Compute which column indices are weekends (Sat=5, Sun=6 in base, rotated)
  const weekendIndices = new Set(
    [5, 6].map((i) => ((i - firstDayOfWeek) % 7 + 7) % 7)
  )

  return (
    <div className="flex flex-col gap-1.5 flex-1 min-h-0">
      {/* Day headers — with week number column */}
      <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5 mb-1">
        <div className="text-center text-[11px] font-medium text-muted-foreground/40 py-2">S</div>
        {headers.map((h, i) => (
          <div key={h} className={cn(
            "text-center text-[13px] font-semibold py-2",
            weekendIndices.has(i) ? "text-muted-foreground/60 bg-muted/40 rounded-t-lg" : "text-muted-foreground"
          )}>{h}</div>
        ))}
      </div>

      {weeks.map((week, wi) => {
        const weekStart = week[0].date
        const weekStatus = weekStatusMap[weekStart] ?? null
        const isWeekPublished = weekStatus === "published"
        // ISO week number
        const d = new Date(weekStart + "T12:00:00")
        const jan1 = new Date(d.getFullYear(), 0, 1)
        const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7)
        return (
          <div key={wi} className="grid grid-cols-[36px_repeat(7,1fr)] gap-1.5 flex-1">
            {/* Week number + publish lock */}
            <div className="flex flex-col items-center justify-center gap-0.5">
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => onSelectWeek(weekStart)}
                    className="text-[11px] font-medium text-muted-foreground/50 hover:text-primary transition-colors"
                  >
                    S{weekNum}
                  </button>
                } />
                <TooltipContent side="left">{t("goToWeek", { week: weekNum })}</TooltipContent>
              </Tooltip>
              {isWeekPublished && (
                <Tooltip>
                  <TooltipTrigger render={
                    <Lock className="size-3 text-emerald-500 cursor-default" />
                  } />
                  <TooltipContent side="left">{t("published")}</TooltipContent>
                </Tooltip>
              )}
            </div>
              {week.map((day) => {
                const isToday    = day.date === TODAY
                const isPast     = day.date < TODAY
                const dayNum     = String(new Date(day.date + "T12:00:00").getDate())
                const dayDow     = new Date(day.date + "T12:00:00").getDay()
                const isSat      = dayDow === 6
                const isSun      = dayDow === 0

                const deptParts: string[] = []
                if (day.labCount > 0) deptParts.push(`Lab ${day.labCount}`)
                if (day.andrologyCount > 0) deptParts.push(`Andr ${day.andrologyCount}`)
                if (day.adminCount > 0) deptParts.push(`Admin ${day.adminCount}`)
                // PB Index — b/pu ratio vs expected conversion rate, shown as colored indicator
                const tooltipPb = (() => {
                  const s = summary as RotaMonthSummary
                  const pu = punctionsOverride[day.date] ?? day.punctions
                  const cr = s.biopsyConversionRate ?? 0.5
                  const getPunc = (d: string) => punctionsOverride[d] ?? s.days.find((dd) => dd.date === d)?.punctions ?? 0
                  const b = computeBiopsyForecast(day.date, getPunc, cr, s.biopsyDay5Pct ?? 0.5, s.biopsyDay6Pct ?? 0.5)
                  if (pu === 0 && b === 0) return null
                  const indexPct = pu > 0 ? Math.round((b / pu) * 100) : null
                  const expectedPct = Math.round(cr * 100)
                  const color = indexPct === null ? "text-muted-foreground"
                    : indexPct >= expectedPct * 0.8 ? "text-emerald-400"
                    : indexPct >= expectedPct * 0.5 ? "text-amber-400"
                    : "text-red-400"
                  return { indexPct, color }
                })()
                const tooltipParts: string[] = []
                if (day.staffCount > 0) tooltipParts.push(`${day.staffCount} ${t("people")}${deptParts.length ? " · " + deptParts.join(" · ") : ""}`)
                if (day.leaveCount > 0) tooltipParts.push(`${day.leaveCount} ${t("absences")}`)
                if (day.hasSkillGaps) {
                  if ((day.warningMessages?.length ?? 0) > 0) {
                    tooltipParts.push(...day.warningMessages)
                  } else {
                    tooltipParts.push(t("uncoveredTasks"))
                  }
                }
                if (day.holidayName) tooltipParts.push(day.holidayName)
                const tooltipText = tooltipParts.length > 0 ? tooltipParts.join(" · ") : null

                return (
                  <Tooltip key={day.date}>
                    <TooltipTrigger render={
                  <button
                    onClick={(e) => { e.stopPropagation(); onSelectDay(day.date) }}
                    style={{
                      ...(isSat ? { borderLeft: "1px dashed var(--border)" } : {}),
                      ...(isSun ? { borderRight: "1px dashed var(--border)" } : {}),
                    }}
                    className={cn(
                      "relative flex flex-col items-start p-2.5 rounded-lg border text-left transition-colors min-h-[100px] flex-1",
                      isPast && !isToday && "opacity-55",
                      !day.isCurrentMonth
                        ? "bg-muted/40 border-border/30"
                        : day.holidayName
                        ? day.isWeekend ? "bg-muted/40 border-border hover:bg-accent/20" : "bg-muted/20 border-border hover:bg-accent/10"
                        : day.staffCount > 0
                        ? day.isWeekend
                          ? "bg-muted/40 border-border hover:bg-accent/20"
                          : "bg-muted/20 border-border hover:bg-accent/10"
                        : day.isWeekend
                        ? "bg-background border-dashed border-border/50 hover:bg-accent/10"
                        : "bg-background border-dashed border-border/50 hover:bg-accent/10"
                    )}
                  >
                    {/* Top row: date + status icon */}
                    <div className="flex items-start justify-between w-full">
                      <div className={cn(
                        "flex items-center justify-center rounded-full leading-none",
                        isToday
                          ? "size-8 bg-primary text-primary-foreground text-[20px] font-bold"
                          : !day.isCurrentMonth
                          ? "text-muted-foreground/25 text-[16px] font-normal"
                          : "text-[20px] font-bold text-foreground"
                      )}>
                        {dayNum}
                      </div>
                      {day.staffCount > 0 && (
                        day.hasSkillGaps
                          ? <AlertTriangle className="size-3.5 text-amber-500" />
                          : <Check className="size-3.5 text-emerald-500" />
                      )}
                    </div>

                    {/* Holiday name */}
                    {day.holidayName && day.isCurrentMonth && (
                      <span className="text-[10px] text-amber-500/80 leading-tight truncate w-full mt-1">{day.holidayName}</span>
                    )}

                    {/* Staff display — shift mode (dept badges) or person mode (initials) */}
                    {day.staffCount > 0 && day.isCurrentMonth && monthViewMode === "person" ? (
                      <div className="flex flex-wrap gap-0.5 mt-auto">
                        {(day.staffInitials ?? []).map((si, i) => {
                          const roleColor = si.role === "lab" ? "#3B82F6" : si.role === "andrology" ? "#10B981" : "#64748B"
                          const isHov = hoveredStaffId === si.id
                          return (
                            <span
                              key={i}
                              className="text-[9px] font-semibold rounded px-1 py-px border border-border transition-colors cursor-default"
                              style={{
                                ...(colorChips ? { borderLeft: `2px solid ${roleColor}` } : {}),
                                ...(isHov ? { backgroundColor: roleColor + "25", color: roleColor, borderColor: roleColor + "40" } : {}),
                              }}
                              onMouseEnter={() => setHovered(si.id)}
                              onMouseLeave={() => setHovered(null)}
                            >
                              {si.initials}
                            </span>
                          )
                        })}
                        {day.staffCount > 10 && (
                          <span className="text-[9px] text-muted-foreground/50">+{day.staffCount - 10}</span>
                        )}
                      </div>
                    ) : day.staffCount > 0 && day.isCurrentMonth ? (
                      <div className="flex-1 flex items-center py-1">
                        <div className="flex flex-wrap items-center gap-1">
                          {Object.entries(day.shiftCounts ?? {})
                            .sort(([a], [b]) => a.localeCompare(b))
                            .map(([shift, count]) => (
                              <span key={shift} className="inline-flex items-center gap-0.5 px-2 py-1 rounded text-[11px] font-normal bg-primary/10 text-primary border border-primary/20 tabular-nums">
                                {shift} <span className="font-semibold text-foreground">{count}</span>
                              </span>
                            ))}
                        </div>
                      </div>
                    ) : <div className="flex-1" />}

                    {/* Empty cells are visually distinct via dashed border + no bg tint */}

                    {/* Punctions + ratio + leave */}
                    {day.isCurrentMonth && (() => {
                      const isOverride = punctionsOverride[day.date] !== undefined
                      const effectiveP = punctionsOverride[day.date] ?? day.punctions
                      // Biopsy forecast — use summary days or weekday fallback
                      const s = summary as RotaMonthSummary
                      function getPuncFromSummary(dateStr: string): number {
                        if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
                        const found = s.days.find((dd) => dd.date === dateStr)
                        if (found) return found.punctions
                        const dow = new Date(dateStr + "T12:00:00").getDay()
                        const sameDow = s.days.find((dd) => new Date(dd.date + "T12:00:00").getDay() === dow)
                        return sameDow?.punctions ?? 0
                      }
                      const bForecast = computeBiopsyForecast(day.date, getPuncFromSummary, s.biopsyConversionRate ?? 0.5, s.biopsyDay5Pct ?? 0.5, s.biopsyDay6Pct ?? 0.5)
                      return (
                        <div className="flex items-end gap-2">
                          <DayStatsInput
                            date={day.date}
                            value={effectiveP}
                            defaultValue={day.punctions}
                            isOverride={isOverride}
                            onChange={onPunctionsChange ?? (() => {})}
                            onBiopsyChange={onBiopsyChange}
                            disabled={!onPunctionsChange}
                            biopsyForecast={bForecast}
                            biopsyTooltip={t("biopsyForecastTooltip", { count: bForecast })}
                          />
                          {day.leaveCount > 0 && (
                            <span className="flex items-center gap-0.5 text-amber-500 ml-auto self-end pb-0.5">
                              <Briefcase className="size-3" />{day.leaveCount}
                            </span>
                          )}
                        </div>
                      )
                    })()}
                  </button>
                    } />
                    {(tooltipText || tooltipPb) && (
                      <TooltipContent side="top">
                        <span className="flex items-center gap-1.5 flex-wrap">
                          {tooltipText && <span>{tooltipText}</span>}
                          {tooltipText && tooltipPb && <span className="opacity-40">·</span>}
                          {tooltipPb && (
                            <span className={cn("font-semibold", tooltipPb.color)}>
                              {tooltipPb.indexPct !== null ? `PB ${tooltipPb.indexPct}%` : "PB —"}
                            </span>
                          )}
                        </span>
                      </TooltipContent>
                    )}
                  </Tooltip>
                )
              })}
          </div>
        )
      })}
    </div>
  )
}
