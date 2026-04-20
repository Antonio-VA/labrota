import type { LabConfig, StaffWithSkills, WorkingDay } from "@/lib/types/database"
import { getDayCode, isWeekend } from "@/lib/engine-helpers"

const HOLIDAY_DAY_CODE: Record<string, WorkingDay> = {
  weekday: "wed",
  saturday: "sat",
  sunday: "sun",
}

export interface HolidayContext {
  holidayMode: string
  holidayCount: number
  reduceBudget: boolean
  publicHolidays: Record<string, string>
  getEffectiveDayCode: (date: string) => WorkingDay
  isEffectiveWeekend: (date: string) => boolean
  getEffectiveBudget: (s: StaffWithSkills) => number
}

export function buildHolidayContext(
  labConfig: LabConfig,
  allDates: string[],
  publicHolidays: Record<string, string>,
): HolidayContext {
  const holidayMode = labConfig.public_holiday_mode ?? "saturday"
  const holidayCount = allDates.filter((d) => publicHolidays[d]).length
  const reduceBudget = labConfig.public_holiday_reduce_budget ?? true

  const getEffectiveDayCode = (date: string): WorkingDay => {
    if (publicHolidays[date] && !isWeekend(date) && holidayMode !== "weekday") {
      return HOLIDAY_DAY_CODE[holidayMode] ?? getDayCode(date)
    }
    return getDayCode(date)
  }

  const isEffectiveWeekend = (date: string): boolean => {
    if (publicHolidays[date] && holidayMode !== "weekday") return true
    return isWeekend(date)
  }

  const getEffectiveBudget = (s: StaffWithSkills): number => {
    const base = s.days_per_week ?? 5
    if (!reduceBudget || holidayCount === 0) return base
    return Math.max(1, base - holidayCount)
  }

  return {
    holidayMode,
    holidayCount,
    reduceBudget,
    publicHolidays,
    getEffectiveDayCode,
    isEffectiveWeekend,
    getEffectiveBudget,
  }
}
