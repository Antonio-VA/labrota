export interface BiopsyContext {
  biopsyConversionRate: number
  biopsyDay5Pct: number
  biopsyDay6Pct: number
  punctionsDefault: Record<string, number>
  monthDays?: Array<{ date: string; punctions: number }>
}

function isoDateOffset(date: string, days: number): string {
  const d = new Date(date + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

export function computeBiopsyOverridePatch(
  date: string,
  biopsyNew: number,
  ctx: BiopsyContext,
  overrides: Record<string, number>,
): Record<string, number> | null {
  const { biopsyConversionRate: cr, biopsyDay5Pct: d5Pct, biopsyDay6Pct: d6Pct, punctionsDefault: pd, monthDays } = ctx

  const d5str = isoDateOffset(date, -5)
  const d6str = isoDateOffset(date, -6)

  const P5 = overrides[d5str] ?? pd[d5str] ?? monthDays?.find((dd) => dd.date === d5str)?.punctions ?? 0
  const P6 = overrides[d6str] ?? pd[d6str] ?? monthDays?.find((dd) => dd.date === d6str)?.punctions ?? 0

  const bForecast = Math.round(P5 * cr * d5Pct + P6 * cr * d6Pct)
  const delta = biopsyNew - bForecast
  if (Math.abs(delta) < 0.5 || cr === 0) return null

  const pDelta = delta / cr
  return {
    [d5str]: Math.max(0, Math.round(P5 + pDelta)),
    [d6str]: Math.max(0, Math.round(P6 + pDelta)),
  }
}
