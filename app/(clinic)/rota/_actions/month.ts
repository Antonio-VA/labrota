"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { typedQuery } from "@/lib/supabase/typed-query"
import { getCachedOrgId } from "@/lib/auth-cache"
import { RECENT_ASSIGNMENTS_LOOKBACK_DAYS } from "@/lib/constants"
import { runRotaEngineV2 } from "@/lib/rota-engine-v2"
import { getWeekDates } from "@/lib/engine-helpers"
import { getMondayOf, toISODate } from "@/lib/format-date"
import { logAuditEvent } from "@/lib/audit"
import { captureSnapshot } from "@/lib/rota-snapshots"
import { getPublicHolidays } from "@/lib/rota-holidays"
import { DOW_TO_KEY, type SkillRow } from "./_shared"
import type {
  RotaStatus,
  StaffWithSkills,
  Leave,
  RotaAssignment,
  RotaRule,
  SkillName,
  ShiftType,
  StaffRole,
  ShiftTypeDefinition,
  Tecnica,
  LabConfig,
  ShiftCoverageByDay,
  ShiftCoverageEntry,
} from "@/lib/types/database"
// ── getRotaMonthSummary ───────────────────────────────────────────────────────

export interface MonthDaySummary {
  date: string
  staffCount: number
  labCount: number
  andrologyCount: number
  adminCount: number
  hasSkillGaps: boolean
  isWeekend: boolean
  isCurrentMonth: boolean
  punctions: number
  leaveCount: number
  holidayName: string | null
  /** Up to 3 staff roles for colour dot preview */
  staffRoles: string[]
  /** Staff initials for person view (up to 6) */
  staffInitials: { id: string; initials: string; role: string }[]
  shiftCounts: Record<string, number>
  /** Engine warning messages for this day (from rota engine_warnings) */
  warningMessages: string[]
}

export interface MonthWeekStatus {
  weekStart: string
  status: "published" | "draft" | null
}

export interface RotaMonthSummary {
  monthStart: string
  days: MonthDaySummary[]
  weekStatuses: MonthWeekStatus[]
  /** staff_id → total assignments in this month's grid */
  staffTotals: Record<string, { first: string; last: string; role: string; count: number; daysPerWeek: number }>
  ratioOptimal: number
  ratioMinimum: number
  firstDayOfWeek: number
  timeFormat: string
  biopsyConversionRate: number
  biopsyDay5Pct: number
  biopsyDay6Pct: number
  rotaDisplayMode: string
  taskConflictThreshold: number
  enableTaskInShift: boolean
}

export async function getRotaMonthSummary(monthStart: string, weekStartOverride?: string): Promise<RotaMonthSummary> {
  const supabase = await createClient()

  let gridDates: string[]

  if (weekStartOverride) {
    // 4-week rolling view: exactly 28 days from the given Monday
    gridDates = []
    const base = new Date(weekStartOverride + "T12:00:00")
    for (let i = 0; i < 28; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      gridDates.push(toISODate(d))
    }
  } else {
    // Legacy month grid
    const first = new Date(monthStart + "T12:00:00")
    const last  = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)

    const gridStart = new Date(first)
    const startDow  = gridStart.getDay()
    gridStart.setDate(gridStart.getDate() - (startDow === 0 ? 6 : startDow - 1))

    const gridEnd = new Date(last)
    const endDow  = gridEnd.getDay()
    if (endDow !== 0) gridEnd.setDate(gridEnd.getDate() + (7 - endDow))

    gridDates = []
    for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
      gridDates.push(toISODate(d))
    }
  }

  const orgRes = await typedQuery<{ rota_display_mode?: string }>(
    supabase.from("organisations").select("rota_display_mode").limit(1).maybeSingle())
  const rotaDisplayMode = orgRes.data?.rota_display_mode ?? "by_shift"

  type MonthAssignmentRow = { date: string; staff_id: string; shift_type: string; staff: { first_name: string; last_name: string; role: string } | null }
  type MonthLabConfigRow = { punctions_by_day: Record<string, number> | null; country?: string | null; region?: string | null; public_holiday_mode?: string | null; min_lab_coverage?: number | null; min_weekend_lab_coverage?: number | null; min_andrology_coverage?: number | null; min_weekend_andrology?: number | null; ratio_optimal?: number | null; ratio_minimum?: number | null; first_day_of_week?: number | null; time_format?: string | null; biopsy_conversion_rate?: number | null; biopsy_day5_pct?: number | null; biopsy_day6_pct?: number | null }
  const [assignmentsRes, skillsRes, leavesRes, labConfigRes, rotasRes, staffRes, tecnicasRes] = await Promise.all([
    typedQuery<MonthAssignmentRow[]>(
      supabase
        .from("rota_assignments")
        .select("date, staff_id, shift_type, staff:staff_id(first_name, last_name, role)")
        .gte("date", gridDates[0])
        .lte("date", gridDates[gridDates.length - 1])),
    typedQuery<SkillRow[]>(
      supabase
        .from("staff_skills")
        .select("staff_id, skill, level")),
    typedQuery<{ staff_id: string; start_date: string; end_date: string }[]>(
      supabase
        .from("leaves")
        .select("staff_id, start_date, end_date")
        .lte("start_date", gridDates[gridDates.length - 1])
        .gte("end_date", gridDates[0])
        .eq("status", "approved")),
    typedQuery<MonthLabConfigRow>(
      supabase.from("lab_config").select("punctions_by_day, country, region, public_holiday_mode, min_lab_coverage, min_weekend_lab_coverage, min_andrology_coverage, min_weekend_andrology, ratio_optimal, ratio_minimum, first_day_of_week, time_format, biopsy_conversion_rate, biopsy_day5_pct, biopsy_day6_pct").maybeSingle()),
    typedQuery<{ week_start: string; status: string; engine_warnings: string[] | null }[]>(
      supabase
        .from("rotas")
        .select("week_start, status, engine_warnings")
        .gte("week_start", gridDates[0])
        .lte("week_start", gridDates[gridDates.length - 1])),
    typedQuery<{ id: string; first_name: string; last_name: string; role: string; days_per_week: number }[]>(
      supabase
        .from("staff")
        .select("id, first_name, last_name, role, days_per_week")
        .neq("onboarding_status", "inactive")),
    typedQuery<{ codigo: string; required_skill: string | null; typical_shifts: string[] | null }[]>(
      supabase
        .from("tecnicas")
        .select("codigo, required_skill, typical_shifts")
        .eq("activa", true)),
  ])

  // Assignment data
  const byDate: Record<string, { staff_id: string; role: string; first_name: string; last_name: string; shift_type: string }[]> = {}
  for (const a of assignmentsRes.data ?? []) {
    if (!byDate[a.date]) byDate[a.date] = []
    byDate[a.date].push({ staff_id: a.staff_id, role: a.staff?.role ?? "lab", first_name: a.staff?.first_name ?? "", last_name: a.staff?.last_name ?? "", shift_type: a.shift_type ?? "" })
  }

  // Staff totals for month taskbar
  const staffTotals: RotaMonthSummary["staffTotals"] = {}
  const staffLookup = Object.fromEntries((staffRes.data ?? []).map((s) => [s.id, s]))
  const currentMonthPrefix = monthStart.slice(0, 7)
  for (const a of assignmentsRes.data ?? []) {
    if (!a.date.startsWith(currentMonthPrefix)) continue
    if (!staffLookup[a.staff_id]) continue // skip inactive staff
    if (!staffTotals[a.staff_id]) {
      const s = staffLookup[a.staff_id]
      staffTotals[a.staff_id] = {
        first: s.first_name, last: s.last_name,
        role: s.role, count: 0,
        daysPerWeek: s.days_per_week ?? 5,
      }
    }
    staffTotals[a.staff_id].count++
  }

  // Skills — only certified count for coverage warnings
  const staffSkillMap: Record<string, string[]> = {}
  for (const ss of skillsRes.data ?? []) {
    if (ss.level !== "certified") continue
    if (!staffSkillMap[ss.staff_id]) staffSkillMap[ss.staff_id] = []
    staffSkillMap[ss.staff_id].push(ss.skill)
  }
  const allOrgSkills = [...new Set((skillsRes.data ?? []).filter((ss) => ss.level === "certified").map((ss) => ss.skill))]
  const tecnicasForGap = (tecnicasRes.data ?? []).filter((t) => t.required_skill && (t.typical_shifts?.length ?? 0) > 0)

  // Leave map: date → count
  const leaveByDate: Record<string, number> = {}
  for (const l of leavesRes.data ?? []) {
    const s = new Date(l.start_date + "T12:00:00")
    const e = new Date(l.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = toISODate(d)
      leaveByDate[iso] = (leaveByDate[iso] ?? 0) + 1
    }
  }

  // Punctions config
  const puncByDay = labConfigRes.data?.punctions_by_day ?? {}

  // Public holidays
  const years = [...new Set(gridDates.map((d) => parseInt(d.slice(0, 4))))]
  const monthCountry = (labConfigRes.data as { country?: string } | null)?.country || "ES"
  const monthRegion = (labConfigRes.data as { region?: string } | null)?.region || null
  const holidays: Record<string, string> = Object.assign({}, ...years.map((y) => getPublicHolidays(y, monthCountry, monthRegion)))

  // Week statuses
  const rotaMap = Object.fromEntries((rotasRes.data ?? []).map((r) => [r.week_start, r.status]))

  // Build map of date → warning messages from engine (for month view amber triangles + tooltips)
  const engineWarningsByDate: Record<string, string[]> = {}
  for (const r of rotasRes.data ?? []) {
    if (!r.engine_warnings) continue
    for (const w of r.engine_warnings) {
      if (w.startsWith("[ai-reasoning]")) continue
      const match = w.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)$/)
      if (match) {
        const [, date, message] = match
        if (!engineWarningsByDate[date]) engineWarningsByDate[date] = []
        engineWarningsByDate[date].push(message)
      }
    }
  }
  const weekStarts: string[] = []
  for (let i = 0; i < gridDates.length; i += 7) weekStarts.push(gridDates[i])
  const weekStatuses: MonthWeekStatus[] = weekStarts.map((ws) => ({
    weekStart: ws,
    status: (rotaMap[ws] as "published" | "draft") ?? null,
  }))

  const days: MonthDaySummary[] = gridDates.map((date) => {
    const entries   = byDate[date] ?? []
    const staffIds  = [...new Set(entries.map((e) => e.staff_id))]
    const covered   = new Set(staffIds.flatMap((id) => staffSkillMap[id] ?? []))
    const daySkillGap = staffIds.length > 0 && allOrgSkills.some((sk) => !covered.has(sk))
    // Shift-level gap: check if each tecnica's required skill is covered within its typical shifts
    const shiftToStaff: Record<string, string[]> = {}
    for (const e of entries) {
      if (!shiftToStaff[e.shift_type]) shiftToStaff[e.shift_type] = []
      shiftToStaff[e.shift_type].push(e.staff_id)
    }
    const hasTechniqueShiftGap = staffIds.length > 0 && tecnicasForGap.some((tec) =>
      (tec.typical_shifts ?? []).some((shift) => {
        const inShift = shiftToStaff[shift] ?? []
        return inShift.length > 0 && !inShift.some((sid) => (staffSkillMap[sid] ?? []).includes(tec.required_skill!))
      })
    )
    const hasSkillGaps = daySkillGap || hasTechniqueShiftGap
    const dow       = new Date(date + "T12:00:00").getDay()
    const dowKey    = DOW_TO_KEY[dow]
    const isWeekend = dow === 0 || dow === 6
    const monthHolidayMode = labConfigRes.data?.public_holiday_mode ?? "saturday"
    const isHolidayReducedCoverage = monthHolidayMode !== "weekday" && !!holidays[date] && !isWeekend
    const effectiveWeekend = isWeekend || isHolidayReducedCoverage
    const uniqueEntries = [...new Map(entries.map((e) => [e.staff_id, e])).values()]
    const labCount = uniqueEntries.filter((e) => e.role === "lab").length
    const andrologyCount = uniqueEntries.filter((e) => e.role === "andrology").length
    // Coverage warning: check if below minimums
    const lc = labConfigRes.data
    const hasCoverageWarning = staffIds.length > 0 && lc ? (
      labCount < (effectiveWeekend ? (lc.min_weekend_lab_coverage ?? lc.min_lab_coverage ?? 0) : (lc.min_lab_coverage ?? 0)) ||
      andrologyCount < (effectiveWeekend ? (lc.min_weekend_andrology ?? lc.min_andrology_coverage ?? 0) : (lc.min_andrology_coverage ?? 0))
    ) : false
    const shiftCounts: Record<string, number> = {}
    for (const e of entries) {
      shiftCounts[e.shift_type] = (shiftCounts[e.shift_type] ?? 0) + 1
    }
    return {
      date,
      staffCount: staffIds.length,
      labCount,
      andrologyCount,
      adminCount: uniqueEntries.filter((e) => e.role === "admin").length,
      hasSkillGaps: hasSkillGaps || hasCoverageWarning || (engineWarningsByDate[date]?.length ?? 0) > 0,
      warningMessages: engineWarningsByDate[date] ?? [],
      isWeekend,
      isCurrentMonth: weekStartOverride ? true : date.startsWith(currentMonthPrefix),
      punctions: puncByDay[dowKey] ?? 0,
      leaveCount: leaveByDate[date] ?? 0,
      holidayName: holidays[date] ?? null,
      staffRoles: entries.slice(0, 4).map((e) => e.role),
      shiftCounts,
      staffInitials: [...new Map(entries.map((e) => [e.staff_id, e])).values()]
        .sort((a, b) => {
          const ro: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
          const rd = (ro[a.role] ?? 9) - (ro[b.role] ?? 9)
          if (rd !== 0) return rd
          return (a.first_name + a.last_name).localeCompare(b.first_name + b.last_name)
        })
        .slice(0, 10)
        .map((e) => ({
          id: e.staff_id,
          initials: `${e.first_name?.[0] ?? ""}${e.last_name?.[0] ?? ""}`,
          role: e.role,
        })),
    }
  })

  const lcRow = labConfigRes.data
  const ratioOptimal = lcRow?.ratio_optimal ?? 1.0
  const ratioMinimum = lcRow?.ratio_minimum ?? 0.75
  const firstDayOfWeek = lcRow?.first_day_of_week ?? 0
  const timeFormat = lcRow?.time_format ?? "24h"
  const biopsyConversionRate = lcRow?.biopsy_conversion_rate ?? 0.5
  const biopsyDay5Pct = lcRow?.biopsy_day5_pct ?? 0.5
  const biopsyDay6Pct = lcRow?.biopsy_day6_pct ?? 0.5
  return { monthStart, days, weekStatuses, staffTotals, ratioOptimal, ratioMinimum, firstDayOfWeek, timeFormat, biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct, rotaDisplayMode, taskConflictThreshold: 3, enableTaskInShift: false }
}

// ── getStaffProfile ───────────────────────────────────────────────────────────

export interface StaffProfileData {
  /** Last 20 assignments, newest first */
  recentAssignments: { date: string; shift_type: string; function_label: string | null }[]
  /** Future approved leaves */
  upcomingLeaves: { start_date: string; end_date: string; type: string }[]
  /** Last 3 past leaves */
  pastLeaves: { start_date: string; end_date: string; type: string }[]
  /** Previous week assignments (7 days) */
  prevWeekAssignments: { date: string; shift_type: string }[]
  /** Next week assignments (7 days) */
  nextWeekAssignments: { date: string; shift_type: string }[]
  /** Enabled rules that include this staff member in staff_ids */
  rules: { type: string; is_hard: boolean; staff_ids: string[]; params: Record<string, unknown>; notes: string | null; expires_at: string | null }[]
}

export async function getStaffProfile(staffId: string, weekStart?: string): Promise<StaffProfileData> {
  const supabase = await createClient()
  const today    = toISODate()

  // Go back 8 weeks to capture enough history for "last 10 shifts"
  const eightWeeksAgo = new Date()
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
  const since = toISODate(eightWeeksAgo)

  // Compute previous and next week date ranges relative to the viewed week
  const viewedMonday = new Date((weekStart ?? getMondayOf()) + "T12:00:00")
  const prevMonday = new Date(viewedMonday)
  prevMonday.setDate(prevMonday.getDate() - 7)
  const prevSunday = new Date(prevMonday)
  prevSunday.setDate(prevSunday.getDate() + 6)
  const nextMonday = new Date(viewedMonday)
  nextMonday.setDate(nextMonday.getDate() + 7)
  const nextSunday = new Date(nextMonday)
  nextSunday.setDate(nextSunday.getDate() + 6)
  const fmt = (d: Date) => toISODate(d)

  const [assignmentsRes, leavesRes, pastLeavesRes, prevWeekRes, nextWeekRes, rulesRes] = await Promise.all([
    typedQuery<{ date: string; shift_type: string; function_label: string | null }[]>(
      supabase
        .from("rota_assignments")
        .select("date, shift_type, function_label")
        .eq("staff_id", staffId)
        .gte("date", since)
        .lte("date", today)
        .order("date", { ascending: false })
        .limit(20)),
    typedQuery<{ start_date: string; end_date: string; type: string }[]>(
      supabase
        .from("leaves")
        .select("start_date, end_date, type")
        .eq("staff_id", staffId)
        .eq("status", "approved")
        .gte("end_date", today)
        .order("start_date", { ascending: true })
        .limit(5)),
    typedQuery<{ start_date: string; end_date: string; type: string }[]>(
      supabase
        .from("leaves")
        .select("start_date, end_date, type")
        .eq("staff_id", staffId)
        .eq("status", "approved")
        .lt("end_date", today)
        .order("end_date", { ascending: false })
        .limit(3)),
    typedQuery<{ date: string; shift_type: string }[]>(
      supabase
        .from("rota_assignments")
        .select("date, shift_type")
        .eq("staff_id", staffId)
        .gte("date", fmt(prevMonday))
        .lte("date", fmt(prevSunday))
        .order("date")),
    typedQuery<{ date: string; shift_type: string }[]>(
      supabase
        .from("rota_assignments")
        .select("date, shift_type")
        .eq("staff_id", staffId)
        .gte("date", fmt(nextMonday))
        .lte("date", fmt(nextSunday))
        .order("date")),
    typedQuery<{ type: string; is_hard: boolean; staff_ids: string[]; params: Record<string, unknown>; notes: string | null; expires_at: string | null }[]>(
      supabase
        .from("rota_rules")
        .select("type, is_hard, staff_ids, params, notes, expires_at")
        .eq("enabled", true)),
  ])

  return {
    recentAssignments: assignmentsRes.data ?? [],
    upcomingLeaves: leavesRes.data ?? [],
    pastLeaves: pastLeavesRes.data ?? [],
    prevWeekAssignments: prevWeekRes.data ?? [],
    nextWeekAssignments: nextWeekRes.data ?? [],
    rules: (rulesRes.data ?? []).filter((r) =>
      (r.staff_ids.includes(staffId) || r.params.supervisor_id === staffId) &&
      (!r.expires_at || r.expires_at > (weekStart ?? toISODate()))
    ),
  }
}
