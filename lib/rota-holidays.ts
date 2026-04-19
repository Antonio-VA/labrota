import Holidays from "date-holidays"
import { REGION_TO_LIB_STATE } from "@/lib/regional-config"

// Resolves national + regional public holidays for the configured country via
// date-holidays (200+ countries, handles lunar calendars).
export function getPublicHolidays(year: number, country = "ES", region?: string | null): Record<string, string> {
  const libState = region ? REGION_TO_LIB_STATE[country]?.[region] : undefined
  const hd = libState ? new Holidays(country, libState) : new Holidays(country)
  ;(hd as unknown as { setLanguages(langs: string[]): void }).setLanguages(["en"])
  const holidays = hd.getHolidays(year)
  const result: Record<string, string> = {}
  for (const h of holidays) {
    if (h.type !== "public") continue
    const date = h.date.split(" ")[0]
    result[date] = h.name
  }
  return result
}

export function isWeekendDate(isoDate: string): boolean {
  const day = new Date(isoDate + "T12:00:00").getDay()
  return day === 0 || day === 6
}
