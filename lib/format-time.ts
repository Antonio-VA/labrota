/**
 * Format a time string (HH:MM or HH:MM:SS) based on the org's time format setting.
 * "24h" → "14:30"
 * "12h" → "2:30 PM"
 */
export function formatTime(time: string, format: string = "24h"): string {
  if (!time) return ""

  const [hStr, mStr] = time.split(":")
  const h = parseInt(hStr, 10)
  const m = mStr ?? "00"
  if (isNaN(h)) return time

  if (format === "12h") {
    const period = h >= 12 ? "PM" : "AM"
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
    return `${h12}:${m.slice(0, 2)} ${period}`
  }

  // 24h — strip leading zero from hour
  return `${h}:${m.slice(0, 2)}`
}
