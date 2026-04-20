"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { computeBiopsyForecast } from "@/lib/biopsy-forecast"
import type { RotaDay } from "@/app/(clinic)/rota/actions"
import { DayStatsInput } from "./day-stats-input"
import { DayWarningPopover } from "../toolbar/warnings"
import { TODAY } from "../constants"
import { buildPuncResolver } from "../utils"

export function PersonGridHeader({
  days, locale, publicHolidays, simplified,
  punctionsDefault, punctionsOverride, onPunctionsChange,
  biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct,
  onDateClick,
}: {
  days: RotaDay[]
  locale: string
  publicHolidays: Record<string, string>
  simplified?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  biopsyConversionRate: number
  biopsyDay5Pct: number
  biopsyDay6Pct: number
  onDateClick?: (date: string) => void
}) {
  const getPunc = useMemo(
    () => buildPuncResolver(punctionsDefault, punctionsOverride),
    [punctionsDefault, punctionsOverride],
  )

  return (
    <>
      <div className="border-r border-b border-border bg-muted sticky left-0 z-10" style={{ minHeight: 52 }} />
      {days.map((day) => {
        const d = new Date(day.date + "T12:00:00")
        const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
        const dayN = String(d.getDate())
        const today = day.date === TODAY
        const holiday = publicHolidays[day.date]
        const isSat = d.getDay() === 6
        const isWknd = isSat || d.getDay() === 0

        let statsInput = null
        if (!simplified) {
          const pDefault = (punctionsDefault ?? {})[day.date] ?? 0
          const pEffective = (punctionsOverride ?? {})[day.date] ?? pDefault
          const hasOverride = (punctionsOverride ?? {})[day.date] !== undefined
          const forecast = computeBiopsyForecast(day.date, getPunc, biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct)
          const tooltip = forecast > 0 ? `${forecast} biopsias previstas` : `${pEffective} punciones`
          statsInput = (
            <DayStatsInput
              date={day.date}
              value={pEffective}
              defaultValue={pDefault}
              isOverride={hasOverride}
              onChange={onPunctionsChange ?? (() => {})}
              disabled={!onPunctionsChange}
              biopsyForecast={forecast}
              biopsyTooltip={tooltip}
              compact
            />
          )
        }

        return (
          <div
            key={day.date}
            className={cn(
              "relative flex flex-col items-center justify-center py-1 gap-0 border-b border-r last:border-r-0 border-border",
              holiday ? "bg-amber-100/80" : "bg-muted",
            )}
            style={isSat ? { borderLeft: "1px dashed var(--border)" } : undefined}
          >
            {day.warnings.length > 0 && <DayWarningPopover warnings={day.warnings} />}
            <button
              onClick={() => onDateClick?.(day.date)}
              className={cn("flex flex-col items-center gap-0 cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
            >
              <span className={cn("text-[10px] uppercase tracking-wider", isWknd && !holiday ? "text-muted-foreground/50" : "text-muted-foreground")}>{wday}</span>
              <span className={cn(
                "font-semibold leading-none text-[18px]",
                today ? "size-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[15px]"
                : holiday ? "text-amber-600" : isWknd ? "text-muted-foreground" : "text-primary",
              )}>
                {dayN}
              </span>
            </button>
            {holiday && (
              <Tooltip>
                <TooltipTrigger render={<span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>} />
                <TooltipContent side="bottom">{holiday}</TooltipContent>
              </Tooltip>
            )}
            {statsInput}
          </div>
        )
      })}
    </>
  )
}
