/**
 * LabRota date formatting.
 *
 * Standard format: Mon 17 Mar  (weekday short + day + month short)
 * With year:       Mon 17 Mar 2026  (for leave lists, rota history)
 *
 * Uses Intl.DateTimeFormat with explicit options — never numeric-only formats.
 * Pass the current locale ("es" | "en") from useLocale() / getLocale().
 */

type Locale = "es" | "en"

/**
 * Mon 17 Mar  /  lun 17 mar
 */
export function formatDate(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(d)
}

/**
 * Mon 17 Mar 2026  /  lun 17 mar 2026
 * Use for leave lists, rota history, and any date that may span years.
 */
export function formatDateWithYear(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d)
}

/**
 * 14:30  /  2:30 PM — localized clock time from a Date.
 * Distinct from formatTime() in lib/format-time.ts, which converts an
 * already-stored "HH:MM" string per the org's 24h/12h setting.
 */
export function formatTimeOfDay(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

/**
 * lun 17 mar · 14:30  /  Mon 17 Mar · 2:30 PM
 */
export function formatDateTime(date: Date | string, locale: Locale): string {
  return `${formatDate(date, locale)} · ${formatTimeOfDay(date, locale)}`
}

/**
 * 17 mar 2026 14:30:05  /  17 Mar 2026 2:30:05 PM
 * Detailed variant with seconds — for audit logs.
 */
export function formatDateTimeDetailed(date: Date | string, locale: Locale): string {
  const d = typeof date === "string" ? new Date(date) : date
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d)
}

/**
 * Date range: Mon 17 Mar – Wed 19 Mar 2026
 * Appends year only on the end date.
 */
export function formatDateRange(
  start: Date | string,
  end: Date | string,
  locale: Locale
): string {
  return `${formatDate(start, locale)} – ${formatDateWithYear(end, locale)}`
}

/**
 * ISO date string of the Monday of the week containing `input`.
 * Uses noon-local anchoring so DST transitions and negative UTC offsets
 * can't slip the result onto an adjacent calendar day.
 */
export function getMondayOf(input: string | Date = new Date()): string {
  const d = typeof input === "string" ? new Date(input + "T12:00:00") : new Date(input)
  d.setHours(12, 0, 0, 0)
  const dow = d.getDay() // 0 = Sun
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow))
  return d.toISOString().split("T")[0]
}
