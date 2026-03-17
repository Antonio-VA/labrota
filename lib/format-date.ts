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
