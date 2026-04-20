import "server-only"
import { formatDateWithYear, toISODate } from "@/lib/format-date"

export function formatDateES(iso: string): string {
  return formatDateWithYear(iso + "T12:00:00", "es")
}

export function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const d = new Date(from + "T12:00:00")
  const end = new Date(to + "T12:00:00")
  while (d <= end) {
    dates.push(toISODate(d))
    d.setDate(d.getDate() + 1)
  }
  return dates
}
