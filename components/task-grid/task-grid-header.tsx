"use client"

import { useMemo } from "react"
import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { computeBiopsyForecast } from "@/lib/biopsy-forecast"
import { buildPuncResolver } from "@/components/calendar-panel/utils"
import { TODAY } from "@/components/calendar-panel/constants"
import type { RotaDay } from "@/app/(clinic)/rota/actions"
import { PuncBiopsyEdit } from "./punc-biopsy-edit"

export function TaskGridHeader({
  days, locale, publicHolidays, compact, showPuncBiopsy,
  punctionsDefault, punctionsOverride, onPunctionsChange, onBiopsyChange,
  biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct,
  puncDisabled, onDateClick,
}: {
  days: RotaDay[]
  locale: string
  publicHolidays: Record<string, string>
  compact: boolean
  showPuncBiopsy: boolean
  punctionsDefault: Record<string, number>
  punctionsOverride: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  biopsyConversionRate: number
  biopsyDay5Pct: number
  biopsyDay6Pct: number
  puncDisabled: boolean
  onDateClick?: (date: string) => void
}) {
  const getPunc = useMemo(
    () => buildPuncResolver(punctionsDefault, punctionsOverride),
    [punctionsDefault, punctionsOverride],
  )

  return (
    <>
      <div className={cn("border-b border-r border-border bg-muted", compact ? "px-2 py-1" : "px-3 py-2")} />
      {days.map((day) => {
        const d = new Date(day.date + "T12:00:00")
        const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
        const dayNum = d.getDate()
        const isToday = day.date === TODAY
        const holidayName = publicHolidays?.[day.date]
        const defaultP = punctionsDefault[day.date] ?? 0
        const effectiveP = punctionsOverride[day.date] ?? defaultP
        const hasOverride = punctionsOverride[day.date] !== undefined
        const biopsyForecast = computeBiopsyForecast(day.date, getPunc, biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct)

        return (
          <div
            key={day.date}
            className={cn(
              "border-b border-r last:border-r-0 border-border flex flex-col items-center justify-center gap-[2px] relative",
              compact ? "py-1" : "py-1.5",
              holidayName ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-muted",
            )}
            style={d.getDay() === 6 ? { borderLeftWidth: 1, borderLeftStyle: "dashed", borderLeftColor: "var(--border)" } : undefined}
          >
            {day.warnings.length > 0 && (
              <span className="absolute top-1 right-1">
                <AlertTriangle className="size-3 text-amber-500" />
              </span>
            )}
            <button
              onClick={() => onDateClick?.(day.date)}
              className={cn("flex flex-col items-center gap-[2px] cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
            >
              <span className={cn("uppercase tracking-wider text-muted-foreground", compact ? "text-[9px]" : "text-[10px]")}>{wday}</span>
              <span className={cn(
                "font-semibold leading-none",
                compact ? "text-[13px]" : "text-[18px]",
                isToday ? (compact ? "size-5 text-[11px]" : "size-7") + " bg-primary text-primary-foreground rounded-full flex items-center justify-center"
                : holidayName ? "text-amber-600 dark:text-amber-400" : "text-primary",
              )}>
                {dayNum}
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
            {showPuncBiopsy && (
              <PuncBiopsyEdit
                date={day.date}
                value={effectiveP}
                defaultValue={defaultP}
                isOverride={hasOverride}
                biopsyForecast={biopsyForecast}
                onChange={onPunctionsChange}
                onBiopsyChange={onBiopsyChange}
                disabled={puncDisabled}
              />
            )}
          </div>
        )
      })}
    </>
  )
}
