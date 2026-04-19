import { addDays } from "@/components/calendar-panel/utils"
import { computeBiopsyForecast } from "./biopsy-forecast"

export interface BiopsyContext {
  biopsyConversionRate: number
  biopsyDay5Pct: number
  biopsyDay6Pct: number
  punctionsDefault: Record<string, number>
  monthDays?: Array<{ date: string; punctions: number }>
}

export function computeBiopsyOverridePatch(
  date: string,
  biopsyNew: number,
  ctx: BiopsyContext,
  overrides: Record<string, number>,
): Record<string, number> | null {
  const { biopsyConversionRate: cr, biopsyDay5Pct: d5Pct, biopsyDay6Pct: d6Pct, punctionsDefault: pd, monthDays } = ctx
  if (cr === 0) return null

  const getPunc = (d: string): number =>
    overrides[d] ?? pd[d] ?? monthDays?.find((dd) => dd.date === d)?.punctions ?? 0

  const d5str = addDays(date, -5)
  const d6str = addDays(date, -6)
  const bForecast = computeBiopsyForecast(date, getPunc, cr, d5Pct, d6Pct)
  const delta = biopsyNew - bForecast
  if (Math.abs(delta) < 0.5) return null

  const pDelta = delta / cr
  return {
    [d5str]: Math.max(0, Math.round(getPunc(d5str) + pDelta)),
    [d6str]: Math.max(0, Math.round(getPunc(d6str) + pDelta)),
  }
}
