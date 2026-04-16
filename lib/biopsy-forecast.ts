/**
 * Compute expected biopsies from punctions 5 and 6 days before a given date.
 *
 * The caller provides a lookup function that resolves the punction count for
 * any ISO date string — this keeps the utility independent of where punction
 * data is stored (override maps, month summary, etc.).
 */
export function computeBiopsyForecast(
  date: string,
  getPuncForDate: (d: string) => number,
  conversionRate: number,
  day5Pct: number,
  day6Pct: number,
): number {
  const d5 = new Date(date + "T12:00:00")
  d5.setDate(d5.getDate() - 5)
  const d6 = new Date(date + "T12:00:00")
  d6.setDate(d6.getDate() - 6)
  const p5 = getPuncForDate(d5.toISOString().split("T")[0])
  const p6 = getPuncForDate(d6.toISOString().split("T")[0])
  return Math.round(p5 * conversionRate * day5Pct + p6 * conversionRate * day6Pct)
}
