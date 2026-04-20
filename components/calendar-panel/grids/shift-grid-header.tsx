"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { computeBiopsyForecast } from "@/lib/biopsy-forecast"
import type { RotaDay } from "@/app/(clinic)/rota/actions"
import { DayStatsInput } from "./day-stats-input"
import { DayWarningPopover } from "../toolbar/warnings"
import { TODAY } from "../constants"
import { buildPuncResolver } from "../utils"
import { toISODate } from "@/lib/format-date"

export function ShiftGridHeader({
  headerDates, localDays, locale, publicHolidays,
  simplified, hasRota,
  punctionsDefault, punctionsOverride, onPunctionsChange, onBiopsyChange,
  biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct,
  isPublished, onDateClick,
}: {
  headerDates: string[]
  localDays: RotaDay[]
  locale: string
  publicHolidays: Record<string, string>
  simplified?: boolean
  hasRota: boolean
  punctionsDefault: Record<string, number>
  punctionsOverride: Record<string, number>
  onPunctionsChange: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  biopsyConversionRate: number
  biopsyDay5Pct: number
  biopsyDay6Pct: number
  isPublished: boolean
  onDateClick?: (date: string) => void
}) {
  const t = useTranslations("schedule")

  const getPuncForDate = useMemo(
    () => buildPuncResolver(punctionsDefault, punctionsOverride),
    [punctionsDefault, punctionsOverride],
  )

  const dayByDate = useMemo(() =>
    new Map(localDays.map((d) => [d.date, d] as const))
  , [localDays])

  return (
    <div className="grid grid-cols-[80px_repeat(7,1fr)] sticky top-0 z-10 border-b border-border" style={{ minHeight: 52 }}>
      <div className="bg-muted" />
      {headerDates.map((dateStr) => {
        const day = dayByDate.get(dateStr)
        const d = new Date(dateStr + "T12:00:00")
        const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
        const dayN = String(d.getDate())
        const today = dateStr === TODAY
        const isWknd = d.getDay() === 0 || d.getDay() === 6
        const holidayName = publicHolidays[dateStr]

        const defaultP = punctionsDefault[dateStr] ?? 0
        const effectiveP = punctionsOverride[dateStr] ?? defaultP
        const hasOverride = punctionsOverride[dateStr] !== undefined

        let statsInput = null
        if (!simplified) {
          const forecast = computeBiopsyForecast(dateStr, getPuncForDate, biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct)
          const d5ago = new Date(dateStr + "T12:00:00"); d5ago.setDate(d5ago.getDate() - 5)
          const d6ago = new Date(dateStr + "T12:00:00"); d6ago.setDate(d6ago.getDate() - 6)
          const p5 = getPuncForDate(toISODate(d5ago))
          const p6 = getPuncForDate(toISODate(d6ago))
          const sources: string[] = []
          if (p5 > 0) sources.push(t("punctionsD5", { count: p5 }))
          if (p6 > 0) sources.push(t("punctionsD6", { count: p6 }))
          const tooltip = forecast > 0
            ? t("biopsyForecast", { count: forecast, sources: sources.join(", ") })
            : t("punctionsLabel", { count: effectiveP })
          statsInput = (
            <DayStatsInput
              date={dateStr}
              value={effectiveP}
              defaultValue={defaultP}
              isOverride={hasOverride}
              onChange={onPunctionsChange}
              onBiopsyChange={onBiopsyChange}
              disabled={isPublished || !hasRota}
              biopsyForecast={forecast}
              biopsyTooltip={tooltip}
              compact
            />
          )
        }

        return (
          <div
            key={dateStr}
            className={cn(
              "relative flex flex-col items-center justify-center py-1 gap-0 border-l border-border",
              holidayName ? "bg-amber-500/10" : "bg-muted"
            )}
          >
            {day && day.warnings.length > 0 && <DayWarningPopover warnings={day.warnings} />}

            <button
              onClick={() => onDateClick?.(dateStr)}
              className={cn("flex flex-col items-center gap-0 cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
            >
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wday}</span>
              <span className={cn(
                "font-semibold leading-none text-[18px]",
                today ? "size-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[15px]"
                : holidayName ? "text-amber-600 dark:text-amber-400" : isWknd ? "text-primary/60" : "text-primary"
              )}>
                {dayN}
              </span>
            </button>
            {holidayName && (
              <Tooltip>
                <TooltipTrigger render={
                  <span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>
                } />
                <TooltipContent side="bottom">{holidayName}</TooltipContent>
              </Tooltip>
            )}

            {statsInput}
          </div>
        )
      })}
    </div>
  )
}
