/**
 * Shared helpers for the scheduling engines (rota-engine, rota-engine-v2, task-engine).
 * All date helpers use noon-local anchoring to avoid DST / UTC-offset edge cases.
 */

import type { ShiftCoverageEntry, WorkingDay } from "@/lib/types/database"

export const WEEKDAY_CODES: WorkingDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]

export function getDayCode(isoDate: string): WorkingDay {
  return WEEKDAY_CODES[new Date(isoDate + "T12:00:00").getDay()]
}

export function isWeekend(isoDate: string): boolean {
  const code = getDayCode(isoDate)
  return code === "sat" || code === "sun"
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

/** Return ISO date strings for all 7 days of the week starting on weekStart. */
export function getWeekDates(weekStart: string): string[] {
  const dates: string[] = []
  const base = new Date(weekStart + "T12:00:00")
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    dates.push(d.toISOString().split("T")[0])
  }
  return dates
}

/** Plain number → lab-only; object → as-is; missing → zeros. */
export function normalizeShiftCov(val: ShiftCoverageEntry | number | undefined): ShiftCoverageEntry {
  if (val === undefined || val === null) return { lab: 0, andrology: 0, admin: 0 }
  if (typeof val === "number") return { lab: val, andrology: 0, admin: 0 }
  return val
}
