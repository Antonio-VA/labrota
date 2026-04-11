"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getCachedOrgId } from "@/lib/auth-cache"
import { ONE_DAY_MS, RECENT_ASSIGNMENTS_LOOKBACK_DAYS } from "@/lib/constants"
import { runRotaEngine, getWeekDates, getMondayOfWeek } from "@/lib/rota-engine"
import { runRotaEngineV2 } from "@/lib/rota-engine-v2"
import { runTaskEngine } from "@/lib/task-engine"
import { logAuditEvent } from "@/lib/audit"
import { captureSnapshot, captureWeekSnapshot } from "@/lib/rota-snapshots"
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

// ── Admin query result types (createAdminClient is untyped) ─────────────────

type RotaRecord = {
  id: string; status: string; published_at: string | null; published_by: string | null
  punctions_override?: Record<string, number> | null; engine_warnings?: string[] | null
}
type LeaveRow = { staff_id: string; start_date: string; end_date: string; type: string }
type RuleRow = { type: string; enabled: boolean; staff_ids: string[]; params: Record<string, unknown>; expires_at: string | null }
type OrgConfig = {
  rota_display_mode?: string; ai_optimal_version?: string; engine_hybrid_enabled?: boolean
  engine_reasoning_enabled?: boolean; task_optimal_version?: string; task_hybrid_enabled?: boolean
  task_reasoning_enabled?: boolean
}
type StaffRow = { id: string; first_name: string; last_name: string; role: string; onboarding_status: string; contract_type: string | null; onboarding_end_date: string | null }
type SkillRow = { staff_id: string; skill: string; level: string }

// ── Shared types exported to client ──────────────────────────────────────────

export interface RotaDayWarning {
  category: "coverage" | "skill_gap" | "rule" | "technique_shift_gap"
  message: string
}

export interface RotaDay {
  date: string
  isWeekend: boolean
  assignments: {
    id: string
    staff_id: string
    shift_type: ShiftType
    is_manual_override: boolean
    trainee_staff_id: string | null
    notes: string | null
    function_label: string | null
    tecnica_id: string | null
    whole_team: boolean
    staff: { id: string; first_name: string; last_name: string; role: StaffRole }
  }[]
  skillGaps: SkillName[]
  warnings: RotaDayWarning[]
}

export type ShiftTimes = Record<string, { start: string; end: string }>

export interface RotaWeekData {
  weekStart: string
  rota: { id: string; status: RotaStatus; published_at: string | null; published_by: string | null; punctions_override: Record<string, number> } | null
  /** Claude's step-by-step reasoning (only present when generation_type is ai_reasoning) */
  aiReasoning: string | null
  days: RotaDay[]
  punctionsDefault: Record<string, number>
  shiftTypes: ShiftTypeDefinition[]
  shiftTimes: ShiftTimes | null
  engineConfig: import("@/lib/types/database").EngineConfig
  /** supervisor_requerido rules: date → staff_id → training tecnica code */
  trainingByStaff: Record<string, Record<string, string>>
  /** date → list of staff_ids on approved leave that day */
  onLeaveByDate: Record<string, string[]>
  /** date → staff_id → leave type */
  onLeaveTypeByDate: Record<string, Record<string, string>>
  /** staff_id → display name for PDF off row */
  staffNames: Record<string, string>
  /** date → holiday name for Spanish national holidays */
  publicHolidays: Record<string, string>
  tecnicas: Tecnica[]
  departments: import("@/lib/types/database").Department[]
  ratioOptimal: number
  ratioMinimum: number
  firstDayOfWeek: number
  timeFormat: string
  biopsyConversionRate: number
  biopsyDay5Pct: number
  biopsyDay6Pct: number
  rotaDisplayMode: string
  daysOffPreference: string
  taskConflictThreshold: number
  enableTaskInShift: boolean
  enableSwapRequests: boolean
  /** Active staff with skills — avoids separate getActiveStaff() call */
  activeStaff?: StaffWithSkills[]
}


// ── Public holidays (via date-holidays library) ─────────────────────────────
// Supports national + regional holidays for all configured countries.
// Source: https://github.com/commenthol/date-holidays (200+ countries, lunar calendars)

import Holidays from "date-holidays"
import { REGION_TO_LIB_STATE } from "@/lib/regional-config"

function getPublicHolidays(year: number, country = "ES", region?: string | null): Record<string, string> {
  const libState = region ? REGION_TO_LIB_STATE[country]?.[region] : undefined
  const hd = libState ? new Holidays(country, libState) : new Holidays(country)
  ;(hd as unknown as { setLanguages(langs: string[]): void }).setLanguages(["en"])
  const holidays = hd.getHolidays(year)
  const result: Record<string, string> = {}
  for (const h of holidays) {
    if (h.type !== "public") continue
    const date = h.date.split(" ")[0] // "2026-01-01 00:00:00" → "2026-01-01"
    result[date] = h.name
  }
  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// getOrgId removed — use getCachedOrgId() (deduped via React.cache within a request)

function isWeekendDate(isoDate: string): boolean {
  const day = new Date(isoDate + "T12:00:00").getDay()
  return day === 0 || day === 6
}

// ── getRotaWeek ───────────────────────────────────────────────────────────────

const DOW_TO_KEY: Record<number, keyof import("@/lib/types/database").PunctionsByDay> = {
  1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 0: "sun",
}

export async function getRotaWeek(weekStart: string): Promise<RotaWeekData> {
  const cookieStore = await cookies()
  const locale = (cookieStore.get("locale")?.value ?? "es") === "en" ? "en" : "es"
  const supabase = await createClient()
  const dates = getWeekDates(weekStart)

  // Fetch everything in parallel — including assignments via rota join to avoid sequential waterfall
  const [rotaResultFull, labConfigResult, leavesResult, shiftTypesRes, tecnicasRes, departmentsRes, rulesRes, orgResult, staffRes, skillsRes, assignmentsEarlyRes] = await Promise.all([
    supabase
      .from("rotas")
      .select("id, status, published_at, published_by, punctions_override, engine_warnings")
      .eq("week_start", weekStart)
      .maybeSingle() as unknown as Promise<{ data: RotaRecord | null; error: { message: string } | null }>,
    supabase.from("lab_config").select("*").maybeSingle(),
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date, type")
      .lte("start_date", dates[6])
      .gte("end_date", dates[0])
      .eq("status", "approved") as unknown as Promise<{ data: LeaveRow[] | null; error: { message: string } | null }>,
    supabase.from("shift_types").select("code, name_es, name_en, start_time, end_time, sort_order, active, active_days").order("sort_order") as unknown as Promise<{ data: ShiftTypeDefinition[] | null; error: { message: string } | null }>,
    supabase.from("tecnicas").select("*").order("orden").order("created_at") as unknown as Promise<{ data: Tecnica[] | null; error: { message: string } | null }>,
    supabase.from("departments").select("*").order("sort_order") as unknown as Promise<{ data: import("@/lib/types/database").Department[] | null; error: { message: string } | null }>,
    supabase.from("rota_rules").select("type, enabled, staff_ids, params, expires_at").eq("enabled", true).in("type", ["restriccion_dia_tecnica", "supervisor_requerido"]) as unknown as Promise<{ data: RuleRow[] | null; error: { message: string } | null }>,
    supabase
      .from("organisations")
      .select("rota_display_mode, ai_optimal_version, engine_hybrid_enabled, engine_reasoning_enabled, task_optimal_version, task_hybrid_enabled, task_reasoning_enabled")
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: OrgConfig | null; error: { message: string } | null }>,
    supabase
      .from("staff")
      .select("id, first_name, last_name, role, onboarding_status, contract_type, onboarding_end_date, days_per_week, working_pattern, preferred_days, avoid_days, preferred_shift, avoid_shifts, prefers_guardia, color, email, start_date, end_date, notes, contracted_hours") as unknown as Promise<{ data: StaffRow[] | null; error: { message: string } | null }>,
    supabase
      .from("staff_skills")
      .select("staff_id, skill, level") as unknown as Promise<{ data: SkillRow[] | null; error: { message: string } | null }>,
    // Fetch assignments in parallel via rota join — avoids sequential waterfall waiting for rota.id
    supabase
      .from("rota_assignments")
      .select("id, staff_id, date, shift_type, is_manual_override, trainee_staff_id, notes, function_label, tecnica_id, whole_team, rota_id, rotas!inner(week_start)")
      .eq("rotas.week_start", weekStart) as unknown as Promise<{ data: Array<{ id: string; staff_id: string; date: string; shift_type: string; is_manual_override: boolean; trainee_staff_id: string | null; notes: string | null; function_label: string | null; tecnica_id: string | null; whole_team: boolean; rota_id: string }> | null; error: { message: string } | null }>,
  ])

  // Check for critical query errors — throw so callers can catch
  const criticalErrors = [
    labConfigResult.error && `lab_config: ${labConfigResult.error.message}`,
    leavesResult.error && `leaves: ${leavesResult.error.message}`,
    shiftTypesRes.error && `shift_types: ${shiftTypesRes.error.message}`,
    staffRes.error && `staff: ${staffRes.error.message}`,
  ].filter(Boolean)
  if (criticalErrors.length > 0) {
    console.error("[getRotaWeek] Query errors:", criticalErrors.join("; "))
    throw new Error(`Failed to load schedule data: ${criticalErrors.join("; ")}`)
  }

  // Fallback: if engine_warnings column doesn't exist yet, retry without it
  let rotaResult = rotaResultFull
  if (rotaResultFull.error && !rotaResultFull.data) {
    const fallback = await supabase
      .from("rotas")
      .select("id, status, published_at, published_by, punctions_override")
      .eq("week_start", weekStart)
      .maybeSingle() as unknown as typeof rotaResultFull
    rotaResult = fallback
  }

  const rotaData  = rotaResult.data
  const labConfig = labConfigResult.data as import("@/lib/types/database").LabConfig | null
  const allFetchedRules = ((rulesRes.data ?? []) as { type: string; enabled: boolean; staff_ids: string[]; params: Record<string, unknown>; expires_at: string | null }[])
    .filter((r) => !r.expires_at || r.expires_at > weekStart)
  const tecDayRules = allFetchedRules.filter((r) => r.type === "restriccion_dia_tecnica")
  const supervisorRules = allFetchedRules.filter((r) => r.type === "supervisor_requerido")
  const tecnicas  = (tecnicasRes.data ?? []) as Tecnica[]

  // Build training map: date → staff_id → tecnica code
  // Only for supervisor rules with a training technique, respecting active days
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
  const trainingByStaff: Record<string, Record<string, string>> = {}
  for (const rule of supervisorRules) {
    const trainingTec = rule.params.training_tecnica_code as string | undefined
    if (!trainingTec) continue
    const supervisorId = rule.params.supervisor_id as string | undefined
    const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
    const traineeIds = rule.staff_ids.filter((id) => id !== supervisorId)
    for (const d of dates) {
      const dow = dayNames[new Date(d + "T12:00:00").getDay()]
      if (supDays.length > 0 && !supDays.includes(dow)) continue
      if (!trainingByStaff[d]) trainingByStaff[d] = {}
      for (const sid of traineeIds) {
        trainingByStaff[d][sid] = trainingTec
      }
    }
  }

  // Org display mode + engine config (fetched in parallel above)
  const orgRow = orgResult.data
  const orgDisplayMode = orgRow?.rota_display_mode ?? "by_shift"
  const engineConfig: import("@/lib/types/database").EngineConfig = {
    aiOptimalVersion:     orgRow?.ai_optimal_version     ?? "v2",
    hybridEnabled:        orgRow?.engine_hybrid_enabled  ?? true,
    reasoningEnabled:     orgRow?.engine_reasoning_enabled ?? false,
    taskOptimalVersion:   orgRow?.task_optimal_version   ?? "v1",
    taskHybridEnabled:    orgRow?.task_hybrid_enabled    ?? false,
    taskReasoningEnabled: orgRow?.task_reasoning_enabled ?? false,
  }

  const rota = rotaData
    ? {
        id: rotaData.id,
        status: rotaData.status as RotaStatus,
        published_at: rotaData.published_at,
        published_by: (rotaData as Record<string, unknown>).published_by as string | null ?? null,
        punctions_override: rotaData.punctions_override ?? {},
      }
    : null

  // Compute default punctions per date from lab config
  const punctionsDefault: Record<string, number> = {}
  for (const date of dates) {
    const dow = new Date(date + "T12:00:00").getDay()
    const key = DOW_TO_KEY[dow]
    punctionsDefault[date] = labConfig?.punctions_by_day?.[key] ?? 0
  }

  // Base day structure with no assignments
  const dayMap: Record<string, RotaDay> = {}
  for (const date of dates) {
    dayMap[date] = { date, isWeekend: isWeekendDate(date), assignments: [], skillGaps: [], warnings: [] }
  }

  // Build shift times from shift_types table
  const shiftTypesData = shiftTypesRes.data ?? []
  const shiftTimes: ShiftTimes | null = shiftTypesData.length > 0
    ? Object.fromEntries(shiftTypesData.map((st) => [st.code, { start: st.start_time, end: st.end_time }]))
    : null

  // Build onLeaveByDate map
  const onLeaveByDate: Record<string, string[]> = {}
  const onLeaveTypeByDate: Record<string, Record<string, string>> = {}
  for (const leave of leavesResult.data ?? []) {
    const s = new Date(leave.start_date + "T12:00:00")
    const e = new Date(leave.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split("T")[0]
      if (!onLeaveByDate[iso]) onLeaveByDate[iso] = []
      onLeaveByDate[iso].push(leave.staff_id)
      if (!onLeaveTypeByDate[iso]) onLeaveTypeByDate[iso] = {}
      onLeaveTypeByDate[iso][leave.staff_id] = leave.type
    }
  }

  // Compute public holidays for every year spanned by this week
  const years = [...new Set(dates.map((d) => parseInt(d.slice(0, 4))))]
  const orgCountry = (labConfig as { country?: string } | null)?.country || "ES"
  const orgRegion = (labConfig as { region?: string } | null)?.region || null
  const publicHolidays: Record<string, string> = Object.assign({}, ...years.map((y) => getPublicHolidays(y, orgCountry, orgRegion)))

  // Build activeStaff from the parallel staff+skills queries — avoids duplicate getActiveStaff() call
  const skillsByStaff: Record<string, SkillRow[]> = {}
  for (const sk of skillsRes.data ?? []) {
    if (!skillsByStaff[sk.staff_id]) skillsByStaff[sk.staff_id] = []
    skillsByStaff[sk.staff_id].push(sk)
  }
  const activeStaff = ((staffRes.data ?? []) as StaffRow[]).filter((s) => s.onboarding_status !== "inactive").map((s) => ({
    ...s,
    staff_skills: (skillsByStaff[s.id] ?? []) as unknown as StaffWithSkills["staff_skills"],
  })) as StaffWithSkills[]

  if (!rota) {
    return { weekStart, rota: null, days: dates.map((d) => dayMap[d]), punctionsDefault, shiftTypes: shiftTypesData, shiftTimes, onLeaveByDate, onLeaveTypeByDate, staffNames: {}, publicHolidays, tecnicas, departments: departmentsRes.data ?? [], ratioOptimal: labConfig?.ratio_optimal ?? 1.0, ratioMinimum: labConfig?.ratio_minimum ?? 0.75, firstDayOfWeek: labConfig?.first_day_of_week ?? 0, timeFormat: labConfig?.time_format ?? "24h", biopsyConversionRate: labConfig?.biopsy_conversion_rate ?? 0.5, biopsyDay5Pct: labConfig?.biopsy_day5_pct ?? 0.5, biopsyDay6Pct: labConfig?.biopsy_day6_pct ?? 0.5, rotaDisplayMode: orgDisplayMode, daysOffPreference: labConfig?.days_off_preference ?? "prefer_weekend", taskConflictThreshold: labConfig?.task_conflict_threshold ?? 3, enableTaskInShift: labConfig?.enable_task_in_shift ?? false, enableSwapRequests: !!(labConfig?.enable_swap_requests) && orgDisplayMode === "by_shift", trainingByStaff, aiReasoning: null, engineConfig, activeStaff }
  }

  // Fetch assignments + all org staff in parallel so we can enrich assignments without
  // relying on a PostgREST join (which can silently return null after schema migrations).
  type RawAssignment = {
    id: string; staff_id: string; date: string; shift_type: string;
    is_manual_override: boolean; trainee_staff_id: string | null; notes: string | null;
    function_label: string | null; tecnica_id: string | null; whole_team: boolean
  }
  type AssignmentRow = RawAssignment & {
    staff: { id: string; first_name: string; last_name: string; role: string } | null
  }

  // Assignments were fetched in parallel via rota join — use the early result
  const assignmentsRes = assignmentsEarlyRes as { data: RawAssignment[] | null; error: { message: string } | null }

  // Build a staff lookup map so we don't depend on a join
  const staffLookup: Record<string, { id: string; first_name: string; last_name: string; role: string; onboarding_status: string; contract_type: string | null; onboarding_end_date: string | null }> = {}
  for (const s of staffRes.data ?? []) staffLookup[s.id] = s

  // Coverage weight helper for live warnings
  const lcPartTimeW = (labConfig as { part_time_weight?: number } | null)?.part_time_weight ?? 0.5
  const lcInternW   = (labConfig as { intern_weight?: number } | null)?.intern_weight   ?? 0.5
  function liveCoverageWeight(staffId: string, date: string): number {
    const s = staffLookup[staffId]
    if (!s) return 1
    if (s.onboarding_end_date && date <= s.onboarding_end_date) return 0
    if (s.contract_type === "part_time") return lcPartTimeW
    if (s.contract_type === "intern")    return lcInternW
    return 1
  }

  // If newer columns missing, retry with minimal select
  let rawAssignments: RawAssignment[] = []
  if (assignmentsRes.error) {
    const { data: baseData } = (await supabase
      .from("rota_assignments")
      .select("id, staff_id, date, shift_type, is_manual_override")
      .eq("rota_id", rota.id)) as unknown as { data: Omit<RawAssignment, "trainee_staff_id" | "notes" | "function_label" | "tecnica_id">[] | null }
    rawAssignments = (baseData ?? []).map((a) => ({ ...a, trainee_staff_id: null, notes: null, function_label: null, tecnica_id: null, whole_team: false }))
  } else {
    rawAssignments = assignmentsRes.data ?? []
  }

  const assignmentsData: AssignmentRow[] = rawAssignments.map((a) => ({
    ...a,
    staff: staffLookup[a.staff_id] ?? null,
  }))

  const skillsData = skillsRes.data

  const staffSkillMap: Record<string, SkillName[]> = {}
  for (const ss of skillsData ?? []) {
    if (ss.level !== "certified") continue
    if (!staffSkillMap[ss.staff_id]) staffSkillMap[ss.staff_id] = []
    staffSkillMap[ss.staff_id].push(ss.skill as SkillName)
  }

  const allOrgSkills = [...new Set((skillsData ?? []).filter((ss) => ss.level === "certified").map((ss) => ss.skill as SkillName))]

  // Only include assignments whose shift_type exists in this org's shift_types table.
  // Assignments with stale codes (e.g. 'am'/'pm'/'full' from before the shift_types migration)
  // would otherwise make staff invisible: they'd be in assignedIds but match no shift row.
  // Skip this filter for by_task orgs — shift_type is irrelevant there.
  const validShiftCodes = (orgDisplayMode === "by_task" || shiftTypesData.length === 0)
    ? null  // null = no filtering
    : new Set(shiftTypesData.map((st) => st.code))

  // Populate day assignments
  // In by_shift mode, each staff member should appear once per day in the shift
  // grid. The engine may create extra task-detail rows (Phase 4); we deduplicate
  // by staff_id+date, preferring the shift-level row (function_label="").
  // In by_task mode, every row is a distinct task assignment — no dedup.
  const seenStaffDay = new Map<string, number>() // "staffId:date" → index in day.assignments

  for (const a of assignmentsData ?? []) {
    const day = dayMap[a.date]
    if (!day) continue
    if (validShiftCodes && !validShiftCodes.has(a.shift_type)) continue
    const staff = a.staff as { id: string; first_name: string; last_name: string; role: string } | null
    if (!staff) continue

    // Deduplicate: in by_shift mode, one entry per staff per day
    if (orgDisplayMode === "by_shift") {
      const key = `${a.staff_id}:${a.date}`
      const existingIdx = seenStaffDay.get(key)
      if (existingIdx !== undefined) {
        // Prefer the shift-level row (function_label="" or null) over task-detail rows
        const isShiftRow = !a.function_label || a.function_label === ""
        if (isShiftRow) {
          // Replace the existing entry with the shift-level row
          day.assignments[existingIdx] = {
            id: a.id,
            staff_id: a.staff_id,
            shift_type: a.shift_type as ShiftType,
            is_manual_override: a.is_manual_override,
            trainee_staff_id: a.trainee_staff_id,
            notes: a.notes,
            function_label: null,
            tecnica_id: null,
            whole_team: false,
            staff: { id: staff.id, first_name: staff.first_name, last_name: staff.last_name, role: staff.role as StaffRole },
          }
        }
        continue
      }
      seenStaffDay.set(key, day.assignments.length)
    }

    day.assignments.push({
      id: a.id,
      staff_id: a.staff_id,
      shift_type: a.shift_type as ShiftType,
      is_manual_override: a.is_manual_override,
      trainee_staff_id: a.trainee_staff_id,
      notes: a.notes,
      function_label: a.function_label ?? null,
      tecnica_id: a.tecnica_id ?? null,
      whole_team: (a as unknown as { whole_team?: boolean }).whole_team ?? false,
      staff: { id: staff.id, first_name: staff.first_name, last_name: staff.last_name, role: staff.role as StaffRole },
    })
  }

  // Compute skill gaps and coverage warnings per day
  for (const day of Object.values(dayMap)) {
    // Skill gaps — exclude techniques blocked by restriccion_dia_tecnica rules
    const dayCodeForGap = ["sun","mon","tue","wed","thu","fri","sat"][new Date(day.date + "T12:00:00").getDay()] as string
    const covered = new Set(day.assignments.flatMap((a) => staffSkillMap[a.staff_id] ?? []))
    day.skillGaps = allOrgSkills.filter((sk) => {
      if (covered.has(sk)) return false
      // Check if this skill's technique is blocked today by a rule
      const blocked = tecDayRules.some((rule) => {
        const tecCode = rule.params.tecnica_code as string | undefined
        if (tecCode !== sk) return false
        const dayMode = rule.params.dayMode as string | undefined
        const restrictedDays = (rule.params.restrictedDays as string[] | undefined) ?? []
        if (restrictedDays.length === 0) return false
        return dayMode === "only" ? !restrictedDays.includes(dayCodeForGap) : restrictedDays.includes(dayCodeForGap)
      })
      return !blocked
    })

    if (day.skillGaps.length > 0) {
      // Map skill codes to technique names for user-friendly display
      const gapNames = day.skillGaps.map((sk) => {
        const tec = tecnicas.find((t) => t.codigo === sk)
        return (locale === "en" ? tec?.nombre_en : tec?.nombre_es) ?? tec?.nombre_es ?? sk
      })
      day.warnings.push({ category: "skill_gap", message: gapNames.join(", ") })
    }

    // Technique-shift gap warnings (by_shift only)
    // Skip if ALL of a technique's typical_shifts are inactive on this day
    // Skip if the shift has no minimum for the technique's department
    const holidayModeForWarning = labConfig?.public_holiday_mode ?? "saturday"
    const rawDayCodeForWarning = ["sun","mon","tue","wed","thu","fri","sat"][new Date(day.date + "T12:00:00").getDay()] as string
    const holidayDayMap: Record<string, string> = { weekday: rawDayCodeForWarning, saturday: "sat", sunday: "sun" }
    const dayCodeForWarning = (publicHolidays[day.date] && rawDayCodeForWarning !== "sat" && rawDayCodeForWarning !== "sun") ? (holidayDayMap[holidayModeForWarning] ?? rawDayCodeForWarning) : rawDayCodeForWarning
    const activeDayShifts = new Set(
      shiftTypesData.filter((st) => st.active !== false && (!st.active_days || st.active_days.length === 0 || (st.active_days as string[]).includes(dayCodeForWarning)))
        .map((st) => st.code)
    )
    const shiftCovEnabledForWarning = labConfig?.shift_coverage_enabled ?? false
    const shiftCovByDayForWarning = labConfig?.shift_coverage_by_day as ShiftCoverageByDay | null
    if (orgDisplayMode === "by_shift" && tecnicas.length > 0 && day.assignments.length > 0) {
      for (const tec of tecnicas) {
        if (!tec.typical_shifts || tec.typical_shifts.length === 0) continue
        // Skip if none of this technique's shifts are active today
        if (!tec.typical_shifts.some((s: string) => activeDayShifts.has(s))) continue
        // Skip if restriccion_dia_tecnica rule blocks this technique on this day
        const blockedByRule = tecDayRules.some((rule) => {
          const tecCode = rule.params.tecnica_code as string | undefined
          if (tecCode !== tec.codigo) return false
          const dayMode = rule.params.dayMode as string | undefined
          const restrictedDays = (rule.params.restrictedDays as string[] | undefined) ?? []
          if (restrictedDays.length === 0) return false
          return dayMode === "only" ? !restrictedDays.includes(dayCodeForWarning) : restrictedDays.includes(dayCodeForWarning)
        })
        if (blockedByRule) continue
        const tecDept = (tec.department?.split(",")[0] ?? "lab") as "lab" | "andrology" | "admin"
        for (const shiftCode of tec.typical_shifts) {
          if (!activeDayShifts.has(shiftCode)) continue
          // Skip if shift coverage is enabled and this shift has 0 minimum for the technique's department
          if (shiftCovEnabledForWarning && shiftCovByDayForWarning) {
            const raw = shiftCovByDayForWarning[shiftCode]?.[dayCodeForWarning]
            const cov: ShiftCoverageEntry = raw == null
              ? { lab: 0, andrology: 0, admin: 0 }
              : typeof raw === "number" ? { lab: raw, andrology: 0, admin: 0 } : raw as ShiftCoverageEntry
            if (cov[tecDept] === 0) continue
          }
          const staffInShift = day.assignments.filter((a) => a.shift_type === shiftCode)
          const hasCoverage = staffInShift.some((a) => {
            const skills = staffSkillMap[a.staff_id] ?? []
            return skills.includes(tec.codigo as SkillName)
          })
          if (!hasCoverage) {
            day.warnings.push({
              category: "technique_shift_gap",
              message: locale === "en"
                ? `${shiftCode}: no qualified staff for ${tec.nombre_en ?? tec.nombre_es ?? tec.codigo}`
                : `${shiftCode}: sin personal cualificado para ${tec.nombre_es ?? tec.codigo}`,
            })
          }
        }
      }
    }

  }

  // Check supervisor co-location rules — warn if pair is split
  const DOW_CODES = ["sun","mon","tue","wed","thu","fri","sat"] as const
  for (const rule of supervisorRules) {
    const supervisorId = rule.params.supervisor_id as string | undefined
    if (!supervisorId) continue
    const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
    const supervisedIds = (rule.staff_ids ?? []).filter((id) => id !== supervisorId)
    for (const day of Object.values(dayMap)) {
      const dayDow = DOW_CODES[new Date(day.date + "T12:00:00").getDay()]
      if (supDays.length > 0 && !supDays.includes(dayDow)) continue
      const supAsg = day.assignments.find((a) => a.staff_id === supervisorId)
      const traineeAsg = day.assignments.find((a) => supervisedIds.includes(a.staff_id))
      if (!supAsg || !traineeAsg) continue
      if (supAsg.shift_type !== traineeAsg.shift_type) {
        const supName = staffLookup[supervisorId]?.first_name ?? "?"
        const traineeName = staffLookup[supervisedIds[0]]?.first_name ?? "?"
        day.warnings.push({ category: "rule", message: locale === "en"
          ? `Supervisor ${supName} (${supAsg.shift_type}) and ${traineeName} (${traineeAsg.shift_type}) should be on the same shift`
          : `Supervisor ${supName} (${supAsg.shift_type}) y ${traineeName} (${traineeAsg.shift_type}) deberían estar en el mismo turno` })
      }
    }
  }

  // Live coverage warnings — computed from current assignments, not stale engine_warnings
  const shiftCovEnabled = labConfig?.shift_coverage_enabled ?? false
  const shiftCovByDay = labConfig?.shift_coverage_by_day as ShiftCoverageByDay | null
  if (shiftCovEnabled && shiftCovByDay) {
    const DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
    for (const day of Object.values(dayMap)) {
      if (day.assignments.length === 0) continue
      const rawDc = DAY_NAMES[new Date(day.date + "T12:00:00").getDay()]
      const holidayMode = labConfig?.public_holiday_mode ?? "saturday"
      const isHoliday = !!publicHolidays[day.date] && rawDc !== "sat" && rawDc !== "sun"
      const holidayDcMap: Record<string, string> = { weekday: rawDc, saturday: "sat", sunday: "sun" }
      const dc = isHoliday ? (holidayDcMap[holidayMode] ?? rawDc) : rawDc
      const dayShiftCodes = shiftTypesData
        .filter((st) => st.active !== false && (!st.active_days || (st.active_days as string[]).length === 0 || (st.active_days as string[]).includes(dc)))
        .map((st) => st.code)
      for (const sc of dayShiftCodes) {
        const rawCov = shiftCovByDay[sc]?.[dc]
        if (rawCov == null) continue
        const req: { lab: number; andrology: number; admin: number } =
          typeof rawCov === "number" ? { lab: rawCov, andrology: 0, admin: 0 } : rawCov as { lab: number; andrology: number; admin: number }
        if (req.lab === 0 && req.andrology === 0 && req.admin === 0) continue
        let lab = 0, andro = 0, adm = 0
        for (const a of day.assignments) {
          if (a.shift_type !== sc) continue
          const role = a.staff.role
          const w = liveCoverageWeight(a.staff_id, day.date)
          if (role === "lab") lab += w
          else if (role === "andrology") andro += w
          else adm += w
        }
        const fmt = (n: number) => Number.isInteger(n) ? String(n) : n.toFixed(1)
        const msgs: string[] = []
        if (lab < req.lab) msgs.push(`lab ${locale === "es" ? "insuficiente" : "insufficient"}: ${fmt(lab)}/${req.lab}`)
        if (andro < req.andrology) msgs.push(`${locale === "es" ? "andrología insuficiente" : "andrology insufficient"}: ${fmt(andro)}/${req.andrology}`)
        if (adm < req.admin) msgs.push(`admin ${locale === "es" ? "insuficiente" : "insufficient"}: ${fmt(adm)}/${req.admin}`)
        for (const msg of msgs) {
          day.warnings.push({ category: "coverage", message: `${sc} — ${msg}` })
        }
      }
    }
  }

  // Parse engine warnings — only keep user-created rule violations (supervisor rules)
  // Coverage and skill gap warnings are computed live above; engine scheduling
  // decisions (avoid_shifts, budget overrides, etc.) are internal, not user-facing.
  const engineWarningsRaw = (rotaData as { engine_warnings?: string[] | null }).engine_warnings ?? null
  if (engineWarningsRaw && Array.isArray(engineWarningsRaw)) {
    for (const w of engineWarningsRaw) {
      const match = w.match(/^(\d{4}-\d{2}-\d{2}):\s*(.+)$/)
      if (match) {
        const [, date, message] = match
        const day = dayMap[date]
        if (day) {
          // Only show supervisor/training rule warnings — these are user-created rules
          const isUserRule = message.includes("mismo turno") || message.includes("same shift") || message.includes("supervisor")
          if (!isUserRule) continue
          const isDuplicate = day.warnings.some((dw) => dw.category === "rule" && dw.message === message)
          if (!isDuplicate) {
            day.warnings.push({ category: "rule", message })
          }
        }
      }
    }
  }

  // Build staffNames map for PDF off row — active staff only
  const staffNames: Record<string, string> = {}
  for (const [id, s] of Object.entries(staffLookup)) {
    if (s.onboarding_status === "inactive") continue
    staffNames[id] = `${s.first_name} ${s.last_name[0]}.`
  }

  // Extract AI reasoning from engine warnings (only for ai_reasoning generation)
  let aiReasoning: string | null = null
  if (engineWarningsRaw && Array.isArray(engineWarningsRaw)) {
    const reasoningEntry = engineWarningsRaw.find((w) => w.startsWith("[ai-reasoning] "))
    if (reasoningEntry) aiReasoning = reasoningEntry.replace("[ai-reasoning] ", "")
  }

  return { weekStart, rota, days: dates.map((d) => dayMap[d]), punctionsDefault, shiftTypes: shiftTypesData, shiftTimes, onLeaveByDate, onLeaveTypeByDate, staffNames, publicHolidays, tecnicas, departments: departmentsRes.data ?? [], ratioOptimal: labConfig?.ratio_optimal ?? 1.0, ratioMinimum: labConfig?.ratio_minimum ?? 0.75, firstDayOfWeek: labConfig?.first_day_of_week ?? 0, timeFormat: labConfig?.time_format ?? "24h", biopsyConversionRate: labConfig?.biopsy_conversion_rate ?? 0.5, biopsyDay5Pct: labConfig?.biopsy_day5_pct ?? 0.5, biopsyDay6Pct: labConfig?.biopsy_day6_pct ?? 0.5, rotaDisplayMode: orgDisplayMode, daysOffPreference: labConfig?.days_off_preference ?? "prefer_weekend", taskConflictThreshold: labConfig?.task_conflict_threshold ?? 3, enableTaskInShift: labConfig?.enable_task_in_shift ?? false, enableSwapRequests: !!(labConfig?.enable_swap_requests) && orgDisplayMode === "by_shift", trainingByStaff, aiReasoning, engineConfig, activeStaff }
}

// ── generateRota ──────────────────────────────────────────────────────────────

export async function generateRota(
  weekStart: string,
  preserveOverrides: boolean,
  generationType: import("@/lib/types/database").GenerationType = "ai_optimal"
): Promise<{ error?: string; assignmentCount?: number; _coverageModel?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - RECENT_ASSIGNMENTS_LOOKBACK_DAYS)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0]

  // Fetch all required data in parallel
  const [staffRes, leavesRes, recentAssignmentsRes, labConfigRes, rulesRes, shiftTypesForEngine, tecnicasForEngine] = await Promise.all([
    supabase
      .from("staff")
      .select("*, staff_skills(*)")
      .neq("onboarding_status", "inactive"),
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date, type")
      .lte("start_date", weekDates[6])
      .gte("end_date", weekDates[0])
      .eq("status", "approved"),
    supabase
      .from("rota_assignments")
      .select("staff_id, date, shift_type")
      .gte("date", fourWeeksAgoStr)
      .lt("date", weekStart),
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("id, type, is_hard, enabled, staff_ids, params, notes, expires_at").eq("enabled", true),
    supabase.from("shift_types").select("code, name_es, name_en, start_time, end_time, sort_order, active, active_days").order("sort_order"),
    supabase.from("tecnicas").select("id, codigo, department, typical_shifts, avoid_shifts").eq("activa", true) as unknown as Promise<{ data: { id: string; codigo: string; department: string; typical_shifts: string[]; avoid_shifts: string[] }[] | null }>,
  ])

  const labConfig = labConfigRes.data as import("@/lib/types/database").LabConfig | null
  if (!labConfig) return { error: "Lab configuration not found. Set it up in the Lab settings page." }

  // Compute public holidays for this week
  const genYears = [...new Set(weekDates.map((d) => parseInt(d.slice(0, 4))))]
  const genCountry = labConfig.country || "ES"
  const genRegion = labConfig.region || null
  const genPublicHolidays: Record<string, string> = Object.assign({}, ...genYears.map((y) => getPublicHolidays(y, genCountry, genRegion)))

  if (staffRes.error) return { error: `Failed to load staff: ${staffRes.error.message}` }

  // Determine rota display mode (by_shift vs by_task)
  const { data: orgRow } = await supabase
    .from("organisations")
    .select("rota_display_mode")
    .limit(1)
    .maybeSingle() as { data: { rota_display_mode?: string } | null }
  const rotaDisplayMode = orgRow?.rota_display_mode ?? "by_shift"

  // Upsert rota record
  const { data: rotaRow, error: rotaError } = await supabase
    .from("rotas")
    .upsert(
      { organisation_id: orgId, week_start: weekStart, status: "draft" } as never,
      { onConflict: "organisation_id,week_start" }
    )
    .select("id")
    .single()

  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }

  const rotaId = (rotaRow as { id: string }).id

  // Best-effort: set generation_type (column may not exist yet)
  await supabase.from("rotas").update({ generation_type: generationType } as never).eq("id", rotaId)

  // Determine which staff+date combos have manual overrides (to preserve individually)
  const overrideKeys = new Set<string>() // "staffId:date"
  if (preserveOverrides) {
    const { data: overrides } = await supabase
      .from("rota_assignments")
      .select("staff_id, date")
      .eq("rota_id", rotaId)
      .eq("is_manual_override", true) as { data: { staff_id: string; date: string }[] | null }
    for (const o of overrides ?? []) overrideKeys.add(`${o.staff_id}:${o.date}`)
  }

  // Capture week snapshot before generation
  captureWeekSnapshot(rotaId, weekStart)

  // Delete existing non-override assignments (or all if !preserveOverrides)
  if (preserveOverrides) {
    await supabase
      .from("rota_assignments")
      .delete()
      .eq("rota_id", rotaId)
      .eq("is_manual_override", false)
  } else {
    await supabase.from("rota_assignments").delete().eq("rota_id", rotaId)
  }

  // Fetch punctions overrides for this rota (so engine uses same values as UI)
  const { data: rotaOverrides } = await supabase
    .from("rotas")
    .select("punctions_override")
    .eq("id", rotaId)
    .single() as { data: { punctions_override: Record<string, number> | null } | null }
  const punctionsOverride: Record<string, number> = rotaOverrides?.punctions_override ?? {}

  // Normalise preferred_shift against the org's actual shift_type codes.
  const shiftTypesData = (shiftTypesForEngine.data ?? []) as import("@/lib/types/database").ShiftTypeDefinition[]
  const validEngineCodes = new Set(shiftTypesData.map((st) => st.code))
  const normalizedStaff = ((staffRes.data ?? []) as StaffWithSkills[]).map((s) => {
    return validEngineCodes.size > 0 && s.preferred_shift && !validEngineCodes.has(s.preferred_shift)
      ? { ...s, preferred_shift: null }
      : s
  })

  const tecnicasData = (tecnicasForEngine.data ?? []) as { id: string; codigo: string; department: string; typical_shifts: string[]; avoid_shifts: string[] }[]
  const tecnicaIdMap: Record<string, string> = {}
  for (const t of tecnicasData) tecnicaIdMap[t.codigo] = t.id

  const engineTecnicas = tecnicasData.map((t) => ({
    codigo: t.codigo,
    department: t.department ?? "lab",
    typical_shifts: t.typical_shifts ?? [],
    avoid_shifts: t.avoid_shifts ?? [],
  }))
  const activeRules = ((rulesRes.data ?? []) as RotaRule[]).filter((r) => !r.expires_at || r.expires_at > weekStart)
  const engineLeaves = (leavesRes.data ?? []) as Leave[]
  const engineRecentAssignments = (recentAssignmentsRes.data ?? []) as RotaAssignment[]

  let toInsert: {
    organisation_id: string; rota_id: string; staff_id: string; date: string;
    shift_type: string; is_manual_override: boolean; function_label: string;
    tecnica_id?: string | null;
    whole_team?: boolean;
  }[] = []
  let engineWarnings: string[] = []

  if (rotaDisplayMode === "by_task") {
    // ── BY_TASK MODE: use task engine ────────────────────────────────────
    // Fetch recent task assignments for rotation inference
    const { data: recentTaskRows } = await supabase
      .from("rota_assignments")
      .select("staff_id, function_label, date")
      .gte("date", fourWeeksAgoStr)
      .lt("date", weekStart)
      .neq("function_label", "")
      .not("function_label", "is", null) as { data: { staff_id: string; function_label: string; date: string }[] | null }

    const recentTaskAssignments = (recentTaskRows ?? []).map((r) => ({
      staff_id: r.staff_id,
      tecnica_code: r.function_label,
      date: r.date,
    }))

    const taskResult = runTaskEngine({
      weekStart,
      staff: normalizedStaff,
      leaves: engineLeaves,
      recentAssignments: engineRecentAssignments,
      labConfig,
      shiftTypes: shiftTypesData,
      rules: activeRules,
      tecnicas: engineTecnicas,
      taskRotation: (labConfig.shift_rotation as "stable" | "weekly" | "daily") ?? "stable",
      taskCoverageEnabled: labConfig.task_coverage_enabled ?? false,
      taskCoverageByDay: labConfig.task_coverage_by_day as Record<string, Record<string, number>> | null,
      recentTaskAssignments,
    })

    engineWarnings = taskResult.warnings

    // Convert task engine output to DB rows
    // In by_task mode, every assignment row has a function_label (task code)
    // Build equipo_completo lookup: date → set of tecnica codes that are whole-team
    const wholeTeamByDate: Record<string, Set<string>> = {}
    for (const rule of activeRules.filter((r) => r.type === "equipo_completo")) {
      const codes = (rule.params.tecnica_codes as string[] | undefined) ?? []
      const ruleDays = (rule.params.days as string[] | undefined) ?? []
      for (const d of weekDates) {
        const dayCode = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(d + "T12:00:00").getDay()]
        if (ruleDays.length > 0 && !ruleDays.includes(dayCode)) continue
        if (!wholeTeamByDate[d]) wholeTeamByDate[d] = new Set()
        for (const c of codes) wholeTeamByDate[d].add(c)
      }
    }

    toInsert = taskResult.days.flatMap((day) =>
      day.assignments
        .filter((a) => !overrideKeys.has(`${a.staff_id}:${day.date}`))
        .map((a) => ({
          organisation_id: orgId,
          rota_id: rotaId,
          staff_id: a.staff_id,
          date: day.date,
          shift_type: a.shift_type,
          is_manual_override: false,
          function_label: a.function_label,
          tecnica_id: tecnicaIdMap[a.function_label] ?? null,
          whole_team: wholeTeamByDate[day.date]?.has(a.function_label) ?? false,
        }))
    )
  } else {
    // ── BY_SHIFT MODE: use shift engine ──────────────────────────────────
    const engineFn = generationType === "ai_optimal_v2" ? runRotaEngineV2 : runRotaEngine
    const { days, taskAssignments: shiftEngineTaskAssignments, warnings } = engineFn({
      weekStart,
      staff: normalizedStaff,
      leaves: engineLeaves,
      recentAssignments: engineRecentAssignments,
      labConfig,
      shiftTypes: shiftTypesData,
      punctionsOverride,
      rules: activeRules,
      tecnicas: engineTecnicas,
      shiftRotation: (labConfig.shift_rotation as "stable" | "weekly" | "daily") ?? "stable",
      taskCoverageEnabled: labConfig.task_coverage_enabled ?? false,
      taskCoverageByDay: labConfig.task_coverage_by_day as Record<string, Record<string, number>> | null,
      shiftCoverageEnabled: labConfig.shift_coverage_enabled ?? false,
      shiftCoverageByDay: labConfig.shift_coverage_by_day as import("@/lib/types/database").ShiftCoverageByDay | null,
      publicHolidays: genPublicHolidays,
    })

    engineWarnings = warnings

    // Shift assignment rows (function_label = "")
    toInsert = days.flatMap((day) =>
      day.assignments
        .filter((a) => !overrideKeys.has(`${a.staff_id}:${day.date}`))
        .map((a) => ({
          organisation_id: orgId,
          rota_id: rotaId,
          staff_id: a.staff_id,
          date: day.date,
          shift_type: a.shift_type,
          is_manual_override: false,
          function_label: "",
        }))
    )

    // Append task-level rows from shift engine's Phase 4
    // Only when enable_task_in_shift is on — otherwise Phase 4 task rows
    // would create duplicate DB rows that show as duplicates in the shift grid.
    const enableTaskInShift = labConfig.enable_task_in_shift ?? false
    if (enableTaskInShift && shiftEngineTaskAssignments.length > 0) {
      const taskRows = shiftEngineTaskAssignments
        .filter((ta) => !overrideKeys.has(`${ta.staff_id}:${ta.date}`))
        .map((ta) => {
          const dayPlan = days.find((d) => d.date === ta.date)
          const shiftAssignment = dayPlan?.assignments.find((a) => a.staff_id === ta.staff_id)
          return {
            organisation_id: orgId,
            rota_id: rotaId,
            staff_id: ta.staff_id,
            date: ta.date,
            shift_type: shiftAssignment?.shift_type ?? "T1",
            is_manual_override: false,
            function_label: ta.tecnica_code,
            tecnica_id: tecnicaIdMap[ta.tecnica_code] ?? null,
          }
        })
      toInsert.push(...taskRows)
    }
  }

  // Insert assignments
  if (toInsert.length === 0) {
    const staffCount = (staffRes.data ?? []).length
    if (staffCount === 0) {
      return { error: "No active staff found. Make sure staff members are added and are not inactive." }
    }
    if (!labConfig.min_lab_coverage && !labConfig.min_andrology_coverage) {
      return { error: "Lab config has zero minimum coverage — set min_lab_coverage or min_andrology_coverage in Lab settings." }
    }
    return { error: `Engine assigned 0 staff for this week (${staffCount} staff loaded). Check that working patterns include weekdays in this week and no one is on leave all week.` }
  }

  const { error: insertError } = await supabase
    .from("rota_assignments")
    .upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })

  if (insertError) return { error: insertError.message }

  // Best-effort: save engine warnings to rota record (column may not exist yet)
  // Filter out internal [engine] logs — only keep user-facing warnings
  const userWarnings = engineWarnings.filter((w) => !w.startsWith("[engine]") && !w.includes("[debug]"))
  // Always update (even to clear) so stale warnings from previous generation are removed
  await supabase.from("rotas").update({ engine_warnings: userWarnings.length > 0 ? userWarnings : null } as never).eq("id", rotaId)

  // Audit log
  const { data: { user: auditUser } } = await supabase.auth.getUser()
  logAuditEvent({
    orgId,
    userId: auditUser?.id,
    userEmail: auditUser?.email,
    action: "rota_generated",
    entityType: "rota",
    entityId: rotaId,
    metadata: { weekStart, method: generationType, assignmentCount: toInsert.length, preserveOverrides, rotaDisplayMode },
  })

  revalidatePath("/")
  const coverageInfo = engineWarnings.find((w) => w.startsWith("[engine]"))
  return { assignmentCount: toInsert.length, _coverageModel: coverageInfo }
}

// ── generateRotaWithAI ────────────────────────────────────────────────────────
// Pure AI rota generation using Claude. Serialises all org context into a prompt
// and lets the model reason about optimal staff placement.

export async function generateRotaWithAI(
  weekStart: string,
  preserveOverrides: boolean,
): Promise<{ error?: string; assignmentCount?: number; reasoning?: string }> {
  const { anthropic } = await import("@ai-sdk/anthropic")
  const { generateObject } = await import("ai")
  const { z } = await import("zod")

  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - RECENT_ASSIGNMENTS_LOOKBACK_DAYS)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0]

  // Fetch all data (same as generateRota)
  const [staffRes, leavesRes, recentRes, labConfigRes, rulesRes, shiftTypesRes, tecnicasRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").neq("onboarding_status", "inactive"),
    supabase.from("leaves").select("staff_id, start_date, end_date, type").lte("start_date", weekDates[6]).gte("end_date", weekDates[0]).eq("status", "approved"),
    supabase.from("rota_assignments").select("staff_id, date, shift_type").gte("date", fourWeeksAgoStr).lt("date", weekStart),
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("id, type, is_hard, enabled, staff_ids, params, notes, expires_at").eq("enabled", true),
    supabase.from("shift_types").select("code, name_es, name_en, start_time, end_time, sort_order, active, active_days").order("sort_order"),
    supabase.from("tecnicas").select("id, codigo, nombre_es, department, typical_shifts, avoid_shifts").eq("activa", true) as unknown as Promise<{ data: { id: string; codigo: string; nombre_es: string; department: string; typical_shifts: string[]; avoid_shifts: string[] }[] | null }>,
  ])

  const labConfig = labConfigRes.data as LabConfig | null
  if (!labConfig) return { error: "Lab configuration not found." }
  if (staffRes.error) return { error: `Failed to load staff: ${staffRes.error.message}` }

  const staff = (staffRes.data ?? []) as StaffWithSkills[]
  const leaves = (leavesRes.data ?? []) as Leave[]
  const recentAssignments = (recentRes.data ?? []) as RotaAssignment[]
  const activeRules = ((rulesRes.data ?? []) as RotaRule[]).filter((r) => !r.expires_at || r.expires_at > weekStart)
  const shiftTypes = ((shiftTypesRes.data ?? []) as ShiftTypeDefinition[]).filter((st) => st.active !== false)
  const tecnicas = (tecnicasRes.data ?? []) as { id: string; codigo: string; nombre_es: string; department: string; typical_shifts: string[]; avoid_shifts: string[] }[]

  // Determine active shift codes per day of week
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
  const shiftCodes = shiftTypes.map((st) => st.code)

  // Build shift coverage info
  const shiftCoverage = labConfig.shift_coverage_enabled && labConfig.shift_coverage_by_day
    ? labConfig.shift_coverage_by_day as Record<string, Record<string, { lab: number; andrology: number; admin: number }>>
    : null

  // Build leave map
  const leaveByDate: Record<string, string[]> = {}
  for (const l of leaves) {
    for (const d of weekDates) {
      if (d >= l.start_date && d <= l.end_date) {
        if (!leaveByDate[d]) leaveByDate[d] = []
        leaveByDate[d].push(l.staff_id)
      }
    }
  }

  // Build recent workload
  const recentWorkload: Record<string, number> = {}
  for (const a of recentAssignments) {
    recentWorkload[a.staff_id] = (recentWorkload[a.staff_id] ?? 0) + 1
  }

  // Upsert rota record
  const { data: rotaRow, error: rotaError } = await supabase
    .from("rotas")
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" } as never, { onConflict: "organisation_id,week_start" })
    .select("id").single()
  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }
  const rotaId = (rotaRow as { id: string }).id

  await supabase.from("rotas").update({ generation_type: "ai_reasoning" } as never).eq("id", rotaId)

  // Handle overrides
  const overrideKeys = new Set<string>()
  if (preserveOverrides) {
    const { data: overrides } = await supabase
      .from("rota_assignments").select("staff_id, date")
      .eq("rota_id", rotaId).eq("is_manual_override", true) as { data: { staff_id: string; date: string }[] | null }
    for (const o of overrides ?? []) overrideKeys.add(`${o.staff_id}:${o.date}`)
  }

  captureWeekSnapshot(rotaId, weekStart)

  if (preserveOverrides) {
    await supabase.from("rota_assignments").delete().eq("rota_id", rotaId).eq("is_manual_override", false)
  } else {
    await supabase.from("rota_assignments").delete().eq("rota_id", rotaId)
  }

  // ── Serialise context for Claude ──────────────────────────────────────────
  const staffContext = staff.map((s) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`,
    role: s.role,
    days_per_week: s.days_per_week,
    preferred_shift: s.preferred_shift,
    avoid_shifts: s.avoid_shifts,
    working_pattern: s.working_pattern,
    avoid_days: s.avoid_days,
    certified_skills: s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill),
    training_skills: s.staff_skills.filter((sk) => sk.level === "training").map((sk) => sk.skill),
    recent_days_worked: recentWorkload[s.id] ?? 0,
  }))

  const rulesContext = activeRules.map((r) => {
    const staffNames = r.staff_ids.map((id) => {
      const s = staff.find((st) => st.id === id)
      return s ? `${s.first_name} ${s.last_name} (${id})` : id
    })
    return {
      type: r.type,
      is_hard: r.is_hard,
      staff: staffNames,
      params: r.params,
      notes: r.notes,
    }
  })

  const shiftsContext = shiftTypes.map((st) => ({
    code: st.code,
    name: st.name_es,
    time: `${st.start_time ?? "?"}-${st.end_time ?? "?"}`,
    active_days: st.active_days?.length ? st.active_days : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  }))

  const tecnicasContext = tecnicas.map((t) => ({
    code: t.codigo,
    name: t.nombre_es,
    department: t.department,
    typical_shifts: t.typical_shifts ?? [],
    avoid_shifts: t.avoid_shifts ?? [],
  }))

  const datesWithInfo = weekDates.map((d) => {
    const dow = dayNames[new Date(d + "T12:00:00").getDay()]
    const onLeave = (leaveByDate[d] ?? []).map((id) => {
      const s = staff.find((st) => st.id === id)
      return s ? `${s.first_name} ${s.last_name}` : id
    })
    const activeShifts = shiftTypes
      .filter((st) => !st.active_days?.length || st.active_days.includes(dow))
      .map((st) => st.code)
    return { date: d, dayOfWeek: dow, onLeave, activeShifts }
  })

  // Build explicit coverage context with zeros for days without requirements
  const allDayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  const zeroCoverage = { lab: 0, andrology: 0, admin: 0 }
  const coverageContext = shiftCoverage
    ? Object.entries(shiftCoverage).map(([shift, days]) => {
        const fullDays: Record<string, { lab: number; andrology: number; admin: number }> = {}
        for (const d of allDayNames) {
          fullDays[d] = (days as Record<string, { lab: number; andrology: number; admin: number }>)[d] ?? zeroCoverage
        }
        return { shift, coverage_per_day: fullDays }
      })
    : `Global minimums: lab=${labConfig.min_lab_coverage ?? 0}, andrology=${labConfig.min_andrology_coverage ?? 0}`

  const daysOffPref = labConfig.days_off_preference ?? "prefer_weekend"

  const systemPrompt = `You are an expert IVF lab scheduler. Generate a weekly staff rota for an embryology clinic.
You must follow a strict 3-level constraint hierarchy. Higher levels ALWAYS take priority.

═══ LEVEL 1 — ABSOLUTE (break = invalid schedule) ═══
These constraints are physically impossible to violate. If a Level 2 or 3 constraint conflicts with Level 1, Level 1 wins.

L1.1 LEAVE: Staff on approved leave MUST NOT be assigned that day. Non-negotiable.
L1.2 BUDGET: Each staff member MUST work EXACTLY their days_per_week number of days. Not more, not less. A person with days_per_week=5 must appear in exactly 5 days.
L1.3 ACTIVE SHIFTS: Each date lists its activeShifts. Do NOT assign anyone to shifts not in activeShifts. If coverage_per_day shows all zeros for a shift on a day, that shift needs ZERO staff.
L1.4 DAYS OFF MODE: "${daysOffPref}". ${daysOffPref === "always_weekend" ? "Days off MUST be on Saturday and/or Sunday. Staff cannot have weekday days off unless their budget is < 5 and coverage doesn't need them." : daysOffPref === "prefer_weekend" ? "Days off should PREFERABLY be on weekends. Weekday offs are acceptable if coverage requires it, but minimise them." : "Days off can be on any day."}
L1.5 CALENDAR RULES: restriccion_dia_tecnica — techniques restricted to or excluded from certain days. These are absolute.
L1.6 COVERAGE MINIMUMS: Meet the minimum staff count per role per shift per day. Where coverage shows {lab:0, andrology:0, admin:0}, assign NOBODY.
L1.7 ONE SHIFT PER DAY: Each staff member gets exactly one shift per working day.

═══ LEVEL 2 — MANDATORY (override only if Level 1 requires it) ═══

L2.1 TECHNIQUE COVERAGE: Place staff with the right certified skills in shifts that need those techniques. A shift requiring OPU must have an OPU-certified person.
L2.2 HARD USER RULES (is_hard=true): Apply all rules marked as hard. If a hard rule conflicts with L1 (e.g., removing someone would break coverage), L1 wins and the rule is noted as violated.
L2.3 PREFERRED DAYS OFF: avoid_days is a STRONG signal — these are days the employee wants OFF. Heavily penalise scheduling on avoided days. preferred_days is a weaker positive signal.
L2.4 PREFERRED SHIFTS: avoid_shifts is a STRONG signal — never place in avoided shifts unless no alternative. preferred_shift is a weaker positive preference.

═══ LEVEL 3 — OPTIMISATION (only if no Level 1/2 loss) ═══

L3.1 FAIR SHARE: If total staff exceeds shift minimums (excess budget), distribute evenly across shifts rather than piling into one.
L3.2 SHIFT ROTATION: Vary shift assignments across the week/over time for variety.
L3.3 SOFT RULES (is_hard=false): Respect when possible without breaking anything above.
L3.4 WORKLOAD BALANCE: Staff who worked more recently (higher recent_days_worked) should get slightly less-preferred slots.

RULE TYPE REFERENCE:
- no_coincidir (scope=same_day): listed staff cannot work the same day. (scope=same_shift): cannot be in same shift but can work same day.
- no_librar_mismo_dia: listed staff cannot both be off the same day.
- supervisor_requerido: supervisor must be on the same shift as supervised staff.
- max_dias_consecutivos: max consecutive working days.
- distribucion_fines_semana: max weekend days per month.
- descanso_fin_de_semana: alternating weekend rest.
- asignacion_fija: staff always assigned to a fixed shift/days.
- restriccion_dia_tecnica: technique restricted to/excluded from certain days.

APPROACH:
1. First, calculate each person's total available days (7 minus leave days this week).
2. Then determine how many days they must work (days_per_week) and which days they must be OFF.
3. For "${daysOffPref}" mode: ${daysOffPref === "always_weekend" ? "off days must be weekends" : daysOffPref === "prefer_weekend" ? "prefer weekends for off days" : "any day works for off days"}.
4. Check coverage minimums per shift per day. Where coverage is all zeros, that shift is CLOSED.
5. Assign day by day: fill shift minimums first (L1.6), then place remaining staff for budget (L1.2), then distribute across shifts fairly (L3.1).
6. Apply L2 rules — remove/swap only if it doesn't break L1.`

  const userPrompt = `Generate the rota for week starting ${weekStart}.

## Staff (${staffContext.length} members)
${JSON.stringify(staffContext, null, 2)}

## Shifts
${JSON.stringify(shiftsContext, null, 2)}

## Dates
${JSON.stringify(datesWithInfo, null, 2)}

## Coverage Requirements (per shift, per day)
Coverage shows the EXACT number of staff needed per role per shift per day. Where all values are 0, that shift needs NO staff that day — do NOT assign anyone.
${JSON.stringify(coverageContext, null, 2)}

## Scheduling Rules (${rulesContext.length} rules)
${JSON.stringify(rulesContext, null, 2)}

## Techniques
${JSON.stringify(tecnicasContext, null, 2)}

IMPORTANT: Only assign staff to shifts listed in activeShifts for each date. If a date has activeShifts=["T1","T2"], only use T1 and T2.
Each staff member must be assigned to EXACTLY their days_per_week number of days.
Use staff IDs (not names) and shift codes exactly as provided.`

  // Define output schema
  const assignmentSchema = z.object({
    reasoning: z.string().describe("Step-by-step reasoning explaining key decisions, trade-offs, and why certain placements were made. 3-8 sentences."),
    assignments: z.array(z.object({
      staff_id: z.string(),
      date: z.string().describe("ISO date YYYY-MM-DD"),
      shift_type: z.string().describe("Shift code"),
    })),
    warnings: z.array(z.string()).describe("Any constraints that could not be fully satisfied, or trade-offs made"),
  })

  try {
    const result = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: assignmentSchema,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 16000,
    })

    const { reasoning, assignments: aiAssignments, warnings: aiWarnings } = result.object

    // Validate: filter out invalid staff/shift/date combos
    const validStaffIds = new Set(staff.map((s) => s.id))
    const validShiftCodes = new Set(shiftCodes)
    const validDates = new Set(weekDates)

    const validAssignments = aiAssignments.filter((a) => {
      if (!validStaffIds.has(a.staff_id)) return false
      if (!validShiftCodes.has(a.shift_type)) return false
      if (!validDates.has(a.date)) return false
      // Skip if staff is on leave
      if (leaveByDate[a.date]?.includes(a.staff_id)) return false
      return true
    })

    // Deduplicate: one assignment per staff per date
    const seen = new Set<string>()
    const deduped = validAssignments.filter((a) => {
      const key = `${a.staff_id}:${a.date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // Filter out overrides
    const toInsert = deduped
      .filter((a) => !overrideKeys.has(`${a.staff_id}:${a.date}`))
      .map((a) => ({
        organisation_id: orgId,
        rota_id: rotaId,
        staff_id: a.staff_id,
        date: a.date,
        shift_type: a.shift_type,
        is_manual_override: false,
        function_label: "",
      }))

    if (toInsert.length === 0) {
      return { error: `AI generated 0 valid assignments. ${aiWarnings.join("; ")}` }
    }

    const { error: insertError } = await supabase
      .from("rota_assignments")
      .upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })

    if (insertError) return { error: insertError.message }

    // Save warnings + reasoning to rota
    const allWarnings = [...aiWarnings, `[ai-reasoning] ${reasoning}`]
    const { error: warnError } = await supabase.from("rotas").update({ engine_warnings: allWarnings } as never).eq("id", rotaId)
    if (warnError) {
      // engine_warnings column might not exist — try creating it won't work via RLS,
      // but log so reasoning is at least returned in the response
      console.error("Failed to save engine_warnings:", warnError.message)
    }

    // Audit
    const { data: { user: auditUser } } = await supabase.auth.getUser()
    logAuditEvent({
      orgId,
      userId: auditUser?.id,
      userEmail: auditUser?.email,
      action: "rota_generated",
      entityType: "rota",
      entityId: rotaId,
      metadata: { weekStart, method: "ai_reasoning", assignmentCount: toInsert.length, preserveOverrides, aiWarnings },
    })

    revalidatePath("/")
    return { assignmentCount: toInsert.length, reasoning }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI generation failed"
    return { error: `AI generation error: ${msg}` }
  }
}

// ── generateRotaHybrid ────────────────────────────────────────────────────────
// ── Hybrid quota helpers ──────────────────────────────────────────────────────

export async function getHybridUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { used: 0, limit: 10, remaining: 10 }

  const today = new Date().toISOString().split("T")[0]
  const tomorrow = new Date(new Date(today + "T00:00:00Z").getTime() + ONE_DAY_MS).toISOString().split("T")[0]

  const [orgRes, usageRes] = await Promise.all([
    supabase.from("organisations").select("daily_hybrid_limit").eq("id", orgId).single(),
    supabase.from("hybrid_generation_log")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .gte("created_at", `${today}T00:00:00Z`)
      .lt("created_at", `${tomorrow}T00:00:00Z`),
  ])

  const limit = (orgRes.data as { daily_hybrid_limit?: number } | null)?.daily_hybrid_limit ?? 10
  const used = usageRes.count ?? 0
  return { used, limit, remaining: Math.max(0, limit - used) }
}

// ── Hybrid rota generation ────────────────────────────────────────────────────
// Hybrid approach: engine v2 builds a valid base rota (L1 guaranteed), then
// Claude reviews and optimises L2/L3 (avoid_days, fairness, rule compliance).

export async function generateRotaHybrid(
  weekStart: string,
  preserveOverrides: boolean,
): Promise<{ error?: string; assignmentCount?: number; reasoning?: string }> {
  const { anthropic } = await import("@ai-sdk/anthropic")
  const { generateObject } = await import("ai")
  const { z } = await import("zod")

  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // ── 0. Check daily quota ───────────────────────────────────────────────────
  const quota = await getHybridUsage()
  if (quota.remaining <= 0) {
    return { error: `Daily hybrid generation limit reached (${quota.limit}/day). Try again tomorrow.` }
  }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - RECENT_ASSIGNMENTS_LOOKBACK_DAYS)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0]

  // ── 1. Fetch all data ──────────────────────────────────────────────────────
  const [staffRes, leavesRes, recentRes, labConfigRes, rulesRes, shiftTypesRes, tecnicasRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").neq("onboarding_status", "inactive"),
    supabase.from("leaves").select("staff_id, start_date, end_date, type").lte("start_date", weekDates[6]).gte("end_date", weekDates[0]).eq("status", "approved"),
    supabase.from("rota_assignments").select("staff_id, date, shift_type").gte("date", fourWeeksAgoStr).lt("date", weekStart),
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("id, type, is_hard, enabled, staff_ids, params, notes, expires_at").eq("enabled", true),
    supabase.from("shift_types").select("code, name_es, name_en, start_time, end_time, sort_order, active, active_days").order("sort_order"),
    supabase.from("tecnicas").select("id, codigo, nombre_es, department, typical_shifts, avoid_shifts, required_skill").eq("activa", true) as unknown as Promise<{ data: { id: string; codigo: string; nombre_es: string; department: string; typical_shifts: string[]; avoid_shifts: string[]; required_skill: string | null }[] | null }>,
  ])

  const labConfig = labConfigRes.data as LabConfig | null
  if (!labConfig) return { error: "Lab configuration not found." }
  if (staffRes.error) return { error: `Failed to load staff: ${staffRes.error.message}` }

  // Public holidays for this week
  const hybridYears = [...new Set(weekDates.map((d) => parseInt(d.slice(0, 4))))]
  const hybridHolidays: Record<string, string> = Object.assign({}, ...hybridYears.map((y) => getPublicHolidays(y, labConfig.country || "ES", labConfig.region || null)))

  const allStaff = (staffRes.data ?? []) as StaffWithSkills[]
  const leaves = (leavesRes.data ?? []) as Leave[]
  const recentAssignments = (recentRes.data ?? []) as RotaAssignment[]
  const activeRules = ((rulesRes.data ?? []) as RotaRule[]).filter((r) => !r.expires_at || r.expires_at > weekStart)
  const shiftTypes = ((shiftTypesRes.data ?? []) as ShiftTypeDefinition[]).filter((st) => st.active !== false)
  const tecnicas = (tecnicasRes.data ?? []) as { id: string; codigo: string; nombre_es: string; department: string; typical_shifts: string[]; avoid_shifts: string[]; required_skill: string | null }[]

  const shiftCodes = shiftTypes.map((st) => st.code)
  const validShiftCodes = new Set(shiftCodes)

  // Normalise preferred_shift
  const validEngineCodes = new Set(shiftTypes.map((st) => st.code))
  const normalizedStaff = allStaff.map((s) =>
    validEngineCodes.size > 0 && s.preferred_shift && !validEngineCodes.has(s.preferred_shift)
      ? { ...s, preferred_shift: null }
      : s
  )

  const engineTecnicas = tecnicas.map((t) => ({
    codigo: t.codigo,
    department: t.department ?? "lab",
    typical_shifts: t.typical_shifts ?? [],
    avoid_shifts: t.avoid_shifts ?? [],
  }))

  // ── 2. Upsert rota record & clear old assignments ─────────────────────────
  const { data: rotaRow, error: rotaError } = await supabase
    .from("rotas")
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" } as never, { onConflict: "organisation_id,week_start" })
    .select("id").single()
  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }
  const rotaId = (rotaRow as { id: string }).id

  await supabase.from("rotas").update({ generation_type: "ai_hybrid" } as never).eq("id", rotaId)

  const overrideKeys = new Set<string>()
  let overrideAssignments: { staff_id: string; date: string; shift_type: string }[] = []
  if (preserveOverrides) {
    const { data: overrides } = await supabase
      .from("rota_assignments").select("staff_id, date, shift_type")
      .eq("rota_id", rotaId).eq("is_manual_override", true) as { data: { staff_id: string; date: string; shift_type: string }[] | null }
    overrideAssignments = overrides ?? []
    for (const o of overrideAssignments) overrideKeys.add(`${o.staff_id}:${o.date}`)
  }

  captureWeekSnapshot(rotaId, weekStart)

  if (preserveOverrides) {
    await supabase.from("rota_assignments").delete().eq("rota_id", rotaId).eq("is_manual_override", false)
  } else {
    await supabase.from("rota_assignments").delete().eq("rota_id", rotaId)
  }

  // Fetch punctions overrides
  const { data: rotaOverrides } = await supabase
    .from("rotas").select("punctions_override").eq("id", rotaId)
    .single() as { data: { punctions_override: Record<string, number> | null } | null }
  const punctionsOverride: Record<string, number> = rotaOverrides?.punctions_override ?? {}

  // ── 3. Run engine v2 for base rota ─────────────────────────────────────────
  const engineResult = runRotaEngineV2({
    weekStart,
    staff: normalizedStaff,
    leaves,
    recentAssignments,
    labConfig,
    shiftTypes,
    punctionsOverride,
    rules: activeRules,
    tecnicas: engineTecnicas,
    shiftRotation: (labConfig.shift_rotation as "stable" | "weekly" | "daily") ?? "stable",
    taskCoverageEnabled: labConfig.task_coverage_enabled ?? false,
    taskCoverageByDay: labConfig.task_coverage_by_day as Record<string, Record<string, number>> | null,
    shiftCoverageEnabled: labConfig.shift_coverage_enabled ?? false,
    shiftCoverageByDay: labConfig.shift_coverage_by_day as ShiftCoverageByDay | null,
    publicHolidays: hybridHolidays,
  })

  // ── 4. Serialise base rota + context for Claude review ─────────────────────
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

  // Build leave map
  const leaveByDate: Record<string, string[]> = {}
  for (const l of leaves) {
    for (const d of weekDates) {
      if (d >= l.start_date && d <= l.end_date) {
        if (!leaveByDate[d]) leaveByDate[d] = []
        leaveByDate[d].push(l.staff_id)
      }
    }
  }

  // Build recent workload
  const recentWorkload: Record<string, number> = {}
  for (const a of recentAssignments) {
    recentWorkload[a.staff_id] = (recentWorkload[a.staff_id] ?? 0) + 1
  }

  // Shift coverage info
  const shiftCoverage = labConfig.shift_coverage_enabled && labConfig.shift_coverage_by_day
    ? labConfig.shift_coverage_by_day as Record<string, Record<string, { lab: number; andrology: number; admin: number }>>
    : null

  const allDayNames = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
  const zeroCoverage = { lab: 0, andrology: 0, admin: 0 }
  const coverageContext = shiftCoverage
    ? Object.entries(shiftCoverage).map(([shift, days]) => {
        const fullDays: Record<string, { lab: number; andrology: number; admin: number }> = {}
        for (const d of allDayNames) {
          fullDays[d] = (days as Record<string, { lab: number; andrology: number; admin: number }>)[d] ?? zeroCoverage
        }
        return { shift, coverage_per_day: fullDays }
      })
    : `Global minimums: lab=${labConfig.min_lab_coverage ?? 0}, andrology=${labConfig.min_andrology_coverage ?? 0}`

  const daysOffPref = labConfig.days_off_preference ?? "prefer_weekend"

  // Staff context
  const staffContext = allStaff.map((s) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`,
    role: s.role,
    days_per_week: s.days_per_week,
    preferred_shift: s.preferred_shift,
    avoid_shifts: s.avoid_shifts,
    working_pattern: s.working_pattern,
    avoid_days: s.avoid_days,
    certified_skills: s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill),
    recent_days_worked: recentWorkload[s.id] ?? 0,
  }))

  // Rules context
  const rulesContext = activeRules.map((r) => {
    const staffNames = r.staff_ids.map((id) => {
      const s = allStaff.find((st) => st.id === id)
      return s ? `${s.first_name} ${s.last_name} (${id})` : id
    })
    return { type: r.type, is_hard: r.is_hard, staff: staffNames, params: r.params, notes: r.notes }
  })

  // Shifts context
  const shiftsContext = shiftTypes.map((st) => ({
    code: st.code,
    name: st.name_es,
    time: `${st.start_time ?? "?"}-${st.end_time ?? "?"}`,
    active_days: st.active_days?.length ? st.active_days : ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
  }))

  // Dates with leave info and active shifts
  const datesWithInfo = weekDates.map((d) => {
    const dow = dayNames[new Date(d + "T12:00:00").getDay()]
    const onLeave = (leaveByDate[d] ?? []).map((id) => {
      const s = allStaff.find((st) => st.id === id)
      return s ? `${s.first_name} ${s.last_name}` : id
    })
    const activeShifts = shiftTypes
      .filter((st) => !st.active_days?.length || st.active_days.includes(dow))
      .map((st) => st.code)
    return { date: d, dayOfWeek: dow, onLeave, activeShifts }
  })

  // Serialize base rota from engine v2
  const baseRota = engineResult.days.map((day) => ({
    date: day.date,
    dayOfWeek: dayNames[new Date(day.date + "T12:00:00").getDay()],
    assignments: day.assignments.map((a) => {
      const s = allStaff.find((st) => st.id === a.staff_id)
      return {
        staff_id: a.staff_id,
        name: s ? `${s.first_name} ${s.last_name}` : a.staff_id,
        role: s?.role ?? "unknown",
        shift_type: a.shift_type,
      }
    }),
    offStaff: staffContext
      .filter((s) => !day.assignments.some((a) => a.staff_id === s.id) && !(leaveByDate[day.date] ?? []).includes(s.id))
      .map((s) => ({ id: s.id, name: s.name, role: s.role })),
  }))

  // Engine warnings (for context)
  const engineWarningsSummary = engineResult.warnings
    .filter((w) => !w.startsWith("[engine]") && !w.includes("[debug]"))
    .slice(0, 20)

  const systemPrompt = `You are an expert IVF lab scheduler reviewing a computer-generated staff rota.

An algorithm (engine v2) has already produced a VALID base rota that satisfies all Level 1 constraints:
- L1.1 Leave respected — no one on leave is assigned
- L1.2 Budget exact (UNBREAKABLE) — each person works EXACTLY their days_per_week minus leave days. This is the hardest constraint. Verify by counting assignments per staff member.
- L1.3 Active shifts only — only valid shifts per day are used
- L1.4 Days off mode: "${daysOffPref}"
- L1.6 Coverage minimums met per shift per day per role
- L1.7 One shift per day per person

YOUR JOB: Review the base rota and IMPROVE it by optimising Level 2 and Level 3 constraints. You may SWAP assignments between staff (same day, same or different shifts) but you MUST NOT violate any Level 1 constraint.

═══ LEVEL 2 — MANDATORY (your primary focus) ═══
L2.1 TECHNIQUE COVERAGE: Staff with certified skills should be in shifts that need those techniques.
L2.2 HARD RULES (is_hard=true): no_coincidir, supervisor_requerido, max_dias_consecutivos, etc.
L2.3 PREFERRED DAYS OFF: avoid_days is a STRONG signal — swap to give these days off if possible.
L2.4 PREFERRED SHIFTS: avoid_shifts is a STRONG signal — swap away from avoided shifts.

═══ LEVEL 3 — OPTIMISATION (secondary) ═══
L3.1 FAIR SHARE: Distribute staff evenly across shifts (don't pile everyone into one shift).
L3.2 SHIFT ROTATION: Vary assignments across the week.
L3.3 SOFT RULES (is_hard=false): Respect when possible.
L3.4 WORKLOAD BALANCE: Staff with higher recent_days_worked get slightly less-preferred slots.

RULE TYPE REFERENCE:
- no_coincidir (scope=same_day): listed staff cannot work same day. (scope=same_shift): cannot be in same shift.
- no_librar_mismo_dia: listed staff cannot both be off the same day.
- supervisor_requerido: supervisor must be on same shift as supervised staff.
- max_dias_consecutivos: max consecutive working days.
- asignacion_fija: staff always assigned to a fixed shift/day.

CRITICAL RULES:
1. UNBREAKABLE — EXACT SHIFT BUDGET: Every staff member MUST work EXACTLY their days_per_week minus leave days. This is the hardest constraint in the system. If a staff member has days_per_week=6 and 1 leave day, they MUST have exactly 5 shifts — not 4, not 6. If you find the base rota has anyone under-assigned, you MUST fix it by adding them to a day they are missing. Check every staff member's assignment count against their effective budget and flag any mismatch as a critical error.
2. Do NOT assign anyone on leave.
3. Do NOT assign to shifts not in activeShifts for that date.
4. Coverage minimums per role per shift per day must remain met.
5. If the base rota is already good and you see no improvements, return it unchanged.
6. Return the COMPLETE rota (all 7 days, all assignments), not just changes.
7. When reviewing the base rota, COUNT each staff member's total assignments and compare against their effective budget (days_per_week minus leave days). If any staff member is under their budget, this is the HIGHEST PRIORITY issue to fix — above all L2 and L3 optimisations.`

  const userPrompt = `## Staff (${staffContext.length} members)
${JSON.stringify(staffContext, null, 2)}

## Shifts
${JSON.stringify(shiftsContext, null, 2)}

## Dates
${JSON.stringify(datesWithInfo, null, 2)}

## Coverage Requirements
${JSON.stringify(coverageContext, null, 2)}

## Rules (${rulesContext.length})
${JSON.stringify(rulesContext, null, 2)}

## Engine v2 Base Rota
${JSON.stringify(baseRota, null, 2)}

## Engine Warnings
${engineWarningsSummary.length > 0 ? engineWarningsSummary.join("\n") : "None — engine reports no issues."}

Review the base rota above. Identify any L2/L3 improvements (avoid_days violations, hard rule violations, unfair shift distribution, etc.) and return the optimised version. Explain what you changed and why.`

  // ── 5. Call Claude to optimise ─────────────────────────────────────────────
  const assignmentSchema = z.object({
    assessment: z.string().describe("One or two short sentences summarising the overall rota quality — does it meet coverage and preferences, and is there anything unresolved? Be concise. No bullet points, no details."),
    assignments: z.array(z.object({
      staff_id: z.string(),
      date: z.string().describe("ISO date YYYY-MM-DD"),
      shift_type: z.string().describe("Shift code"),
    })),
    warnings: z.array(z.string()).describe("Unresolved hard/soft constraints only — one short phrase each (e.g. 'Rida A. on T1 Sunday — avoid_shifts conflict, no viable swap'). No engine warnings, no false alarms."),
  })

  try {
    const result = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: assignmentSchema,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 16000,
    })

    const { assessment, assignments: aiAssignments, warnings: aiWarnings } = result.object
    const reasoning = assessment

    // Validate assignments
    const validStaffIds = new Set(allStaff.map((s) => s.id))
    const validDates = new Set(weekDates)

    const validAssignments = aiAssignments.filter((a) => {
      if (!validStaffIds.has(a.staff_id)) return false
      if (!validShiftCodes.has(a.shift_type)) return false
      if (!validDates.has(a.date)) return false
      if (leaveByDate[a.date]?.includes(a.staff_id)) return false
      return true
    })

    // Deduplicate
    const seen = new Set<string>()
    const deduped = validAssignments.filter((a) => {
      const key = `${a.staff_id}:${a.date}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // L1 safety check: cap each staff member to their days_per_week budget
    // Instead of falling back entirely, trim excess assignments per-staff
    const budgetByStaff: Record<string, number> = {}
    const staffCaps: Record<string, number> = {}
    for (const s of allStaff) {
      const cap = s.days_per_week ?? 5
      const leaveDays = weekDates.filter((d) => leaveByDate[d]?.includes(s.id)).length
      staffCaps[s.id] = Math.max(0, cap - leaveDays)
    }

    const budgetCapped: typeof deduped = []
    for (const a of deduped) {
      const count = budgetByStaff[a.staff_id] ?? 0
      const cap = staffCaps[a.staff_id] ?? 5
      if (count < cap) {
        budgetCapped.push(a)
        budgetByStaff[a.staff_id] = count + 1
      }
      // else: silently drop this assignment (over budget)
    }

    // L1 safety net: ensure under-budget staff get filled back up
    // If Claude dropped someone below their effective budget, re-add them from engine base rota
    for (const s of allStaff) {
      const cap = staffCaps[s.id] ?? 0
      if (cap <= 0) continue
      const current = budgetByStaff[s.id] ?? 0
      if (current >= cap) continue
      // Find days this staff was in the engine base rota but not in AI output
      const aiDates = new Set(budgetCapped.filter((a) => a.staff_id === s.id).map((a) => a.date))
      const engineDays = engineResult.days
        .filter((d) => d.assignments.some((a) => a.staff_id === s.id) && !aiDates.has(d.date))
        .sort((a, b) => a.assignments.length - b.assignments.length)
      let added = current
      for (const day of engineDays) {
        if (added >= cap) break
        const engineAssign = day.assignments.find((a) => a.staff_id === s.id)
        if (!engineAssign) continue
        if (leaveByDate[day.date]?.includes(s.id)) continue
        budgetCapped.push({ staff_id: s.id, date: day.date, shift_type: engineAssign.shift_type })
        added++
      }
      // If still under budget, add to least-staffed available days
      if (added < cap) {
        const usedDates = new Set(budgetCapped.filter((a) => a.staff_id === s.id).map((a) => a.date))
        const availDays = weekDates
          .filter((d) => !usedDates.has(d) && !leaveByDate[d]?.includes(s.id))
          .sort((a, b) => {
            const countA = budgetCapped.filter((x) => x.date === a).length
            const countB = budgetCapped.filter((x) => x.date === b).length
            return countA - countB
          })
        for (const d of availDays) {
          if (added >= cap) break
          const fallbackShift = shiftCodes[0] ?? "T1"
          budgetCapped.push({ staff_id: s.id, date: d, shift_type: fallbackShift })
          added++
        }
      }
      budgetByStaff[s.id] = added
    }

    const finalAssignments = budgetCapped

    // Filter out overrides
    const toInsert = finalAssignments
      .filter((a) => !overrideKeys.has(`${a.staff_id}:${a.date}`))
      .map((a) => ({
        organisation_id: orgId,
        rota_id: rotaId,
        staff_id: a.staff_id,
        date: a.date,
        shift_type: a.shift_type,
        is_manual_override: false,
        function_label: "",
      }))

    // toInsert can be 0 if every slot is already a manual override (already in DB) — that's valid
    if (toInsert.length === 0 && overrideAssignments.length === 0) {
      return { error: "Hybrid generation produced 0 valid assignments." }
    }

    const { error: insertError } = await supabase
      .from("rota_assignments")
      .upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })

    if (insertError) return { error: insertError.message }

    // Build reasoning summary — assessment + unresolved issues only (no changes list)
    const warningsStr = aiWarnings.length > 0 ? `\n\nRemaining issues:\n${aiWarnings.map((w) => `• ${w}`).join("\n")}` : ""
    const fullReasoning = `${reasoning}${warningsStr}`

    // Recalculate shift coverage warnings from FINAL assignments (not stale engine warnings)
    const finalCoverageWarnings: string[] = []
    if (labConfig.shift_coverage_enabled && labConfig.shift_coverage_by_day) {
      const scByDay = labConfig.shift_coverage_by_day as ShiftCoverageByDay
      const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
      const activeShifts = shiftTypes.filter((st) => st.active !== false)
      const staffById = new Map(allStaff.map((s) => [s.id, s]))
      for (const date of weekDates) {
        const dc = dayNames[new Date(date + "T12:00:00").getDay()]
        // Merge AI assignments with manual overrides so coverage is counted correctly
        const dayAssignments = [
          ...finalAssignments.filter((a) => a.date === date),
          ...overrideAssignments.filter((a) => a.date === date),
        ]
        const dayShifts = activeShifts
          .filter((st) => !st.active_days || st.active_days.length === 0 || st.active_days.includes(dc))
          .map((st) => st.code)
        for (const sc of dayShifts) {
          const rawCov = (scByDay as Record<string, Record<string, unknown>>)[sc]?.[dc]
          const req = rawCov == null ? { lab: 0, andrology: 0, admin: 0 }
            : typeof rawCov === "number" ? { lab: rawCov, andrology: 0, admin: 0 }
            : rawCov as { lab: number; andrology: number; admin: number }
          let lab = 0, andro = 0, admin = 0
          for (const a of dayAssignments.filter((x) => x.shift_type === sc)) {
            const s = staffById.get(a.staff_id)
            if (s?.role === "lab") lab++
            else if (s?.role === "andrology") andro++
            else admin++
          }
          if (lab < req.lab) finalCoverageWarnings.push(`${date}: ${sc} — lab insuficiente: ${lab}/${req.lab}`)
          if (andro < req.andrology) finalCoverageWarnings.push(`${date}: ${sc} — andrología insuficiente: ${andro}/${req.andrology}`)
          if (admin < req.admin) finalCoverageWarnings.push(`${date}: ${sc} — admin insuficiente: ${admin}/${req.admin}`)
        }
      }
    }

    // Save warnings + reasoning (use recalculated coverage + Claude's own warnings, not stale engine ones)
    const allWarnings = [...aiWarnings, `[ai-reasoning] ${fullReasoning}`]
    const { error: warnError } = await supabase.from("rotas").update({ engine_warnings: allWarnings } as never).eq("id", rotaId)
    if (warnError) console.error("Failed to save engine_warnings:", warnError.message)

    // Audit
    const { data: { user: auditUser } } = await supabase.auth.getUser()
    logAuditEvent({
      orgId,
      userId: auditUser?.id,
      userEmail: auditUser?.email,
      action: "rota_generated",
      entityType: "rota",
      entityId: rotaId,
      metadata: { weekStart, method: "ai_hybrid", assignmentCount: toInsert.length, preserveOverrides },
    })

    // Log usage for quota tracking
    await supabase.from("hybrid_generation_log").insert({ organisation_id: orgId } as never)

    revalidatePath("/")
    return { assignmentCount: toInsert.length, reasoning: fullReasoning }
  } catch (e) {
    // If Claude fails, fall back to engine v2 result
    const engineAssignments = engineResult.days.flatMap((d) =>
      d.assignments
        .filter((a) => !overrideKeys.has(`${a.staff_id}:${d.date}`))
        .map((a) => ({
          organisation_id: orgId,
          rota_id: rotaId,
          staff_id: a.staff_id,
          date: d.date,
          shift_type: a.shift_type,
          is_manual_override: false,
          function_label: "",
        }))
    )

    if (engineAssignments.length > 0) {
      await supabase.from("rota_assignments")
        .upsert(engineAssignments as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    }

    // Save engine warnings
    const userWarnings = engineResult.warnings.filter((w) => !w.startsWith("[engine]") && !w.includes("[debug]"))
    await supabase.from("rotas").update({ engine_warnings: userWarnings.length > 0 ? userWarnings : null } as never).eq("id", rotaId)

    // Log usage for quota tracking (fallback still counts as a hybrid attempt)
    await supabase.from("hybrid_generation_log").insert({ organisation_id: orgId } as never)

    revalidatePath("/")

    const msg = e instanceof Error ? e.message : "AI optimisation failed"
    return {
      assignmentCount: engineAssignments.length,
      reasoning: `⚠ Claude optimisation failed (${msg}). Showing engine v2 base rota instead.`,
    }
  }
}

// ── generateTaskHybrid ────────────────────────────────────────────────────────
// By-task hybrid: task engine base + Claude optimisation of technique assignments.
// Key difference from generateRotaHybrid: assignments carry function_label; budget
// is counted by DISTINCT WORKING DAYS per staff (not assignment count).

export async function generateTaskHybrid(
  weekStart: string,
  preserveOverrides: boolean,
): Promise<{ error?: string; assignmentCount?: number; reasoning?: string }> {
  const { anthropic } = await import("@ai-sdk/anthropic")
  const { generateObject } = await import("ai")
  const { z } = await import("zod")

  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // ── 0. Check daily quota ─────────────────────────────────────────────────────
  const quota = await getHybridUsage()
  if (quota.remaining <= 0) {
    return { error: `Daily hybrid generation limit reached (${quota.limit}/day). Try again tomorrow.` }
  }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - RECENT_ASSIGNMENTS_LOOKBACK_DAYS)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0]

  // ── 1. Fetch all data ────────────────────────────────────────────────────────
  const [staffRes, leavesRes, recentRes, labConfigRes, rulesRes, shiftTypesRes, tecnicasRes, recentTaskRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").neq("onboarding_status", "inactive"),
    supabase.from("leaves").select("staff_id, start_date, end_date, type").lte("start_date", weekDates[6]).gte("end_date", weekDates[0]).eq("status", "approved"),
    supabase.from("rota_assignments").select("staff_id, date, shift_type").gte("date", fourWeeksAgoStr).lt("date", weekStart),
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("id, type, is_hard, enabled, staff_ids, params, notes, expires_at").eq("enabled", true),
    supabase.from("shift_types").select("code, name_es, start_time, end_time, sort_order, active, active_days").order("sort_order"),
    supabase.from("tecnicas").select("id, codigo, nombre_es, department, typical_shifts, avoid_shifts, required_skill, orden").eq("activa", true).order("orden") as unknown as Promise<{ data: { id: string; codigo: string; nombre_es: string; department: string; typical_shifts: string[]; avoid_shifts: string[]; required_skill: string | null; orden: number }[] | null }>,
    supabase.from("rota_assignments").select("staff_id, function_label, date").gte("date", fourWeeksAgoStr).lt("date", weekStart).neq("function_label", "").not("function_label", "is", null) as unknown as Promise<{ data: { staff_id: string; function_label: string; date: string }[] | null }>,
  ])

  const labConfig = labConfigRes.data as LabConfig | null
  if (!labConfig) return { error: "Lab configuration not found." }
  if (staffRes.error) return { error: `Failed to load staff: ${staffRes.error.message}` }

  const hybridYears = [...new Set(weekDates.map((d) => parseInt(d.slice(0, 4))))]
  const hybridHolidays: Record<string, string> = Object.assign({}, ...hybridYears.map((y) => getPublicHolidays(y, labConfig.country || "ES", labConfig.region || null)))

  const allStaff = (staffRes.data ?? []) as StaffWithSkills[]
  const leaves = (leavesRes.data ?? []) as Leave[]
  const recentAssignments = (recentRes.data ?? []) as RotaAssignment[]
  const activeRules = ((rulesRes.data ?? []) as RotaRule[]).filter((r) => !r.expires_at || r.expires_at > weekStart)
  const shiftTypes = ((shiftTypesRes.data ?? []) as ShiftTypeDefinition[]).filter((st) => st.active !== false)
  const tecnicas = (tecnicasRes.data ?? []) as { id: string; codigo: string; nombre_es: string; department: string; typical_shifts: string[]; avoid_shifts: string[]; required_skill: string | null; orden: number }[]
  const recentTaskAssignments = (recentTaskRes.data ?? []).map((r) => ({
    staff_id: r.staff_id,
    tecnica_code: r.function_label,
    date: r.date,
  }))

  const validShiftCodes = new Set(shiftTypes.map((st) => st.code))
  const validTecnicaCodes = new Set(tecnicas.map((t) => t.codigo))

  const validEngineCodes = new Set(shiftTypes.map((st) => st.code))
  const normalizedStaff = allStaff.map((s) =>
    validEngineCodes.size > 0 && s.preferred_shift && !validEngineCodes.has(s.preferred_shift)
      ? { ...s, preferred_shift: null } : s
  )
  const engineTecnicas = tecnicas.map((t) => ({
    codigo: t.codigo, department: t.department ?? "lab",
    typical_shifts: t.typical_shifts ?? [], avoid_shifts: t.avoid_shifts ?? [],
  }))

  // ── 2. Upsert rota & clear old assignments ───────────────────────────────────
  const { data: rotaRow, error: rotaError } = await supabase
    .from("rotas")
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" } as never, { onConflict: "organisation_id,week_start" })
    .select("id").single()
  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }
  const rotaId = (rotaRow as { id: string }).id

  await supabase.from("rotas").update({ generation_type: "ai_hybrid" } as never).eq("id", rotaId)

  const overrideKeys = new Set<string>()
  let overrideAssignments: { staff_id: string; date: string; shift_type: string; function_label: string }[] = []
  if (preserveOverrides) {
    const { data: overrides } = await supabase
      .from("rota_assignments").select("staff_id, date, shift_type, function_label")
      .eq("rota_id", rotaId).eq("is_manual_override", true) as { data: { staff_id: string; date: string; shift_type: string; function_label: string }[] | null }
    overrideAssignments = overrides ?? []
    for (const o of overrideAssignments) overrideKeys.add(`${o.staff_id}:${o.date}:${o.function_label ?? ""}`)
  }

  captureWeekSnapshot(rotaId, weekStart)
  if (preserveOverrides) {
    await supabase.from("rota_assignments").delete().eq("rota_id", rotaId).eq("is_manual_override", false)
  } else {
    await supabase.from("rota_assignments").delete().eq("rota_id", rotaId)
  }

  // ── 3. Run task engine for base rota ─────────────────────────────────────────
  const taskResult = runTaskEngine({
    weekStart, staff: normalizedStaff, leaves, recentAssignments, labConfig,
    shiftTypes, rules: activeRules, tecnicas: engineTecnicas,
    taskRotation: (labConfig.shift_rotation as "stable" | "weekly" | "daily") ?? "stable",
    taskCoverageEnabled: labConfig.task_coverage_enabled ?? false,
    taskCoverageByDay: labConfig.task_coverage_by_day as Record<string, Record<string, number>> | null,
    recentTaskAssignments,
  })

  // Pre-build equipo_completo lookup
  const wholeTeamByDate: Record<string, Set<string>> = {}
  for (const rule of activeRules.filter((r) => r.type === "equipo_completo")) {
    const codes = (rule.params.tecnica_codes as string[] | undefined) ?? []
    const ruleDays = (rule.params.days as string[] | undefined) ?? []
    for (const d of weekDates) {
      const dayCode = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(d + "T12:00:00").getDay()]
      if (ruleDays.length > 0 && !ruleDays.includes(dayCode)) continue
      if (!wholeTeamByDate[d]) wholeTeamByDate[d] = new Set()
      for (const c of codes) wholeTeamByDate[d].add(c)
    }
  }

  // Skill maps
  const staffSkillMap = new Map(allStaff.map((s) => [s.id, new Set(s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill))]))
  const tecnicaSkillMap = new Map(tecnicas.map((t) => [t.codigo, t.required_skill]))

  // ── 4. Serialize context for Claude ─────────────────────────────────────────
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

  const leaveByDate: Record<string, string[]> = {}
  for (const l of leaves) {
    for (const d of weekDates) {
      if (d >= l.start_date && d <= l.end_date) {
        if (!leaveByDate[d]) leaveByDate[d] = []
        leaveByDate[d].push(l.staff_id)
      }
    }
  }

  const recentWorkload: Record<string, number> = {}
  for (const a of recentAssignments) recentWorkload[a.staff_id] = (recentWorkload[a.staff_id] ?? 0) + 1

  const recentTaskCounts: Record<string, Record<string, number>> = {}
  for (const a of recentTaskAssignments) {
    if (!recentTaskCounts[a.staff_id]) recentTaskCounts[a.staff_id] = {}
    recentTaskCounts[a.staff_id][a.tecnica_code] = (recentTaskCounts[a.staff_id][a.tecnica_code] ?? 0) + 1
  }

  const staffContext = allStaff.map((s) => ({
    id: s.id,
    name: `${s.first_name} ${s.last_name}`,
    role: s.role,
    days_per_week: s.days_per_week,
    avoid_days: s.avoid_days,
    certified_skills: s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill),
    recent_days_worked: recentWorkload[s.id] ?? 0,
    recent_top_tasks: Object.entries(recentTaskCounts[s.id] ?? {})
      .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([code, cnt]) => `${code}(×${cnt})`),
  }))

  const rulesContext = activeRules.map((r) => ({
    type: r.type, is_hard: r.is_hard,
    staff: r.staff_ids.map((id) => { const s = allStaff.find((st) => st.id === id); return s ? `${s.first_name} ${s.last_name} (${id})` : id }),
    params: r.params, notes: r.notes,
  }))

  const taskCoverage = labConfig.task_coverage_enabled && labConfig.task_coverage_by_day
    ? labConfig.task_coverage_by_day as Record<string, Record<string, number>>
    : null

  const tecnicasContext = tecnicas.map((t) => ({
    code: t.codigo, name: t.nombre_es, department: t.department,
    required_skill: t.required_skill, typical_shifts: t.typical_shifts,
    coverage_by_day: taskCoverage
      ? Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((day) => [
          day, (taskCoverage[t.codigo] as Record<string, number> | undefined)?.[day] ?? 0,
        ]))
      : null,
  }))

  const datesWithInfo = weekDates.map((d) => ({
    date: d,
    dayOfWeek: dayNames[new Date(d + "T12:00:00").getDay()],
    onLeave: (leaveByDate[d] ?? []).map((id) => { const s = allStaff.find((st) => st.id === id); return s ? `${s.first_name} ${s.last_name}` : id }),
  }))

  // Serialize base rota — grouped per day, then per staff with their task list
  const baseRota = taskResult.days.map((day) => {
    const byStaff: Record<string, { name: string; role: string; tasks: { code: string; shift: string }[] }> = {}
    for (const a of day.assignments) {
      const s = allStaff.find((st) => st.id === a.staff_id)
      if (!byStaff[a.staff_id]) byStaff[a.staff_id] = { name: s ? `${s.first_name} ${s.last_name}` : a.staff_id, role: s?.role ?? "unknown", tasks: [] }
      byStaff[a.staff_id].tasks.push({ code: a.function_label, shift: a.shift_type })
    }
    return {
      date: day.date,
      dayOfWeek: dayNames[new Date(day.date + "T12:00:00").getDay()],
      staff: Object.entries(byStaff).map(([id, info]) => ({ id, ...info })),
      offStaff: day.offStaff.map((id) => { const s = allStaff.find((st) => st.id === id); return s ? `${s.first_name} ${s.last_name} (${id})` : id }),
    }
  })

  const engineWarningsSummary = taskResult.warnings
    .filter((w) => !w.startsWith("[engine]") && !w.includes("[debug]"))
    .slice(0, 20)

  const systemPrompt = `You are an expert IVF lab scheduler reviewing a computer-generated task assignment rota.

An algorithm (task engine) has already produced a VALID base rota that satisfies all Level 1 constraints:
- L1.1 Leave respected — no one on leave is assigned to any task
- L1.2 Budget exact (UNBREAKABLE) — each person works on EXACTLY days_per_week minus leave DISTINCT DAYS. Important: one person may perform MULTIPLE tasks in one day — that still counts as 1 working day.
- L1.3 Skill gate — only staff with the required certified skill are assigned to each technique
- L1.4 Technique coverage — each active technique+day meets its required minimum staffing

YOUR JOB: Review the base rota and IMPROVE it by optimising Level 2 and Level 3 constraints. You may swap task assignments between staff but you MUST NOT violate any Level 1 constraint.

In by-task mode, the key unit is: which qualified staff member performs which technique on which day.

═══ LEVEL 2 — MANDATORY (your primary focus) ═══
L2.1 TECHNIQUE ROTATION: Do not assign the same demanding technique to the same person every day. Rotate qualified staff so each person's weekly task profile varies. Use recent_top_tasks to see who is overloaded — give relief to those with high counts on specific techniques.
L2.2 HARD RULES (is_hard=true): no_coincidir, supervisor_requerido, max_dias_consecutivos.
L2.3 PREFERRED DAYS OFF: avoid_days is a STRONG signal — swap to give these days off if possible.
L2.4 INTRA-DAY LOAD BALANCE: Avoid piling many tasks on one person while another qualified person handles one. Aim for similar task counts within the same department per day.

═══ LEVEL 3 — OPTIMISATION (secondary) ═══
L3.1 TASK FAIRNESS: Distribute high-demand and less-desirable techniques fairly across all qualified staff over the week.
L3.2 WEEKLY VARIETY: Each person's task profile should differ day-to-day — variety reduces fatigue.
L3.3 SOFT RULES (is_hard=false): Respect when possible.
L3.4 EQUIPO_COMPLETO: Techniques designated equipo_completo should be flagged in whole_team_dates — do not enumerate every staff member for them.

RULE TYPE REFERENCE:
- no_coincidir: listed staff cannot work same day (scope=same_day) or same shift (scope=same_shift)
- supervisor_requerido: supervisor must be on same day as supervised staff
- max_dias_consecutivos: max consecutive working days
- equipo_completo: technique done by all qualified staff on specified days (use whole_team_dates)
- asignacion_fija: staff always on a specific task/day

CRITICAL RULES:
1. UNBREAKABLE — EXACT DAY BUDGET: Each person must appear on EXACTLY days_per_week minus leave DISTINCT DAYS. Count unique dates per person. One person with 3 tasks on Monday = 1 working day.
2. Do NOT assign anyone on leave.
3. For each technique, only assign staff who have the required certified skill (check required_skill vs certified_skills).
4. Every active technique+day must maintain at least its coverage_by_day minimum.
5. Return ALL assignments for ALL 7 days — not just changes.
6. If you see no improvements to make, return the base rota unchanged.`

  const userPrompt = `## Staff (${staffContext.length} members)
${JSON.stringify(staffContext, null, 2)}

## Techniques (${tecnicasContext.length} active)
${JSON.stringify(tecnicasContext, null, 2)}

## Dates (with leave)
${JSON.stringify(datesWithInfo, null, 2)}

## Rules (${rulesContext.length})
${JSON.stringify(rulesContext, null, 2)}

## Task Engine Base Rota
${JSON.stringify(baseRota, null, 2)}

## Engine Warnings
${engineWarningsSummary.length > 0 ? engineWarningsSummary.join("\n") : "None — engine reports no issues."}

Review the base rota. Identify L2/L3 improvements (technique rotation gaps, intra-day load imbalances, hard rule violations, avoid_days violations) and return the optimised version. Explain what you changed and why in the assessment field.`

  // ── 5. Call Claude ───────────────────────────────────────────────────────────
  const assignmentSchema = z.object({
    assessment: z.string().describe("One or two short sentences summarising rota quality and what was improved. Be concise."),
    assignments: z.array(z.object({
      staff_id: z.string(),
      date: z.string().describe("ISO date YYYY-MM-DD"),
      shift_type: z.string().describe("Shift code"),
      function_label: z.string().describe("Technique code (codigo)"),
    })),
    whole_team_dates: z.array(z.object({
      date: z.string(),
      function_label: z.string(),
    })).optional().describe("Techniques to mark as whole_team on these dates (equipo_completo)"),
    warnings: z.array(z.string()).describe("Unresolved hard constraints only — one short phrase each."),
  })

  try {
    const result = await generateObject({
      model: anthropic("claude-sonnet-4-6"),
      schema: assignmentSchema,
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 16000,
    })

    const { assessment, assignments: aiAssignments, whole_team_dates, warnings: aiWarnings } = result.object

    // ── Validate ────────────────────────────────────────────────────────────────
    const validStaffIds = new Set(allStaff.map((s) => s.id))
    const validDates = new Set(weekDates)
    const validAssignments = aiAssignments.filter((a) => {
      if (!validStaffIds.has(a.staff_id)) return false
      if (!validDates.has(a.date)) return false
      if (!validTecnicaCodes.has(a.function_label)) return false
      if (!validShiftCodes.has(a.shift_type)) return false
      if (leaveByDate[a.date]?.includes(a.staff_id)) return false
      const reqSkill = tecnicaSkillMap.get(a.function_label)
      if (reqSkill && !staffSkillMap.get(a.staff_id)?.has(reqSkill)) return false
      return true
    })

    // Deduplicate by staff+date+function_label
    const seen = new Set<string>()
    const deduped = validAssignments.filter((a) => {
      const key = `${a.staff_id}:${a.date}:${a.function_label}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })

    // ── Budget cap by DISTINCT WORKING DAYS ─────────────────────────────────────
    const staffCaps: Record<string, number> = {}
    for (const s of allStaff) {
      const leaveDays = weekDates.filter((d) => leaveByDate[d]?.includes(s.id)).length
      staffCaps[s.id] = Math.max(0, (s.days_per_week ?? 5) - leaveDays)
    }

    // Count distinct days per staff from deduped
    const workingDays: Record<string, Set<string>> = {}
    for (const a of deduped) {
      if (!workingDays[a.staff_id]) workingDays[a.staff_id] = new Set()
      workingDays[a.staff_id].add(a.date)
    }
    // Build allowed-dates per staff (trim to cap if over)
    const allowedDates: Record<string, Set<string>> = {}
    for (const [staffId, days] of Object.entries(workingDays)) {
      const cap = staffCaps[staffId] ?? 5
      allowedDates[staffId] = new Set([...days].sort().slice(0, cap))
    }
    const budgetCapped = deduped.filter((a) => allowedDates[a.staff_id]?.has(a.date))

    // ── Under-budget rescue ─────────────────────────────────────────────────────
    const finalWorkingDays: Record<string, Set<string>> = {}
    for (const a of budgetCapped) {
      if (!finalWorkingDays[a.staff_id]) finalWorkingDays[a.staff_id] = new Set()
      finalWorkingDays[a.staff_id].add(a.date)
    }
    const finalAssignments = [...budgetCapped]

    for (const s of allStaff) {
      const cap = staffCaps[s.id] ?? 0
      if (cap <= 0) continue
      const current = finalWorkingDays[s.id]?.size ?? 0
      if (current >= cap) continue

      const aiDates = finalWorkingDays[s.id] ?? new Set<string>()
      // Restore missing days from engine base (prefer days engine had this staff)
      const engineDays = taskResult.days
        .filter((d) => d.assignments.some((a) => a.staff_id === s.id) && !aiDates.has(d.date))
        .sort((a, b) => a.assignments.length - b.assignments.length)

      let added = current
      for (const day of engineDays) {
        if (added >= cap) break
        for (const ta of day.assignments.filter((a) => a.staff_id === s.id)) {
          finalAssignments.push({ staff_id: s.id, date: day.date, shift_type: ta.shift_type, function_label: ta.function_label })
        }
        if (!finalWorkingDays[s.id]) finalWorkingDays[s.id] = new Set()
        finalWorkingDays[s.id].add(day.date)
        added++
      }

      // Still under — fill least-staffed available days
      if (added < cap) {
        const usedDates = finalWorkingDays[s.id] ?? new Set<string>()
        const availDays = weekDates
          .filter((d) => !usedDates.has(d) && !leaveByDate[d]?.includes(s.id))
          .sort((a, b) => finalAssignments.filter((x) => x.date === a).length - finalAssignments.filter((x) => x.date === b).length)
        for (const d of availDays) {
          if (added >= cap) break
          const engineDay = taskResult.days.find((day) => day.date === d)
          const engineTasks = engineDay?.assignments.filter((a) => a.staff_id === s.id) ?? []
          if (engineTasks.length > 0) {
            for (const ta of engineTasks) {
              finalAssignments.push({ staff_id: s.id, date: d, shift_type: ta.shift_type, function_label: ta.function_label })
            }
          } else {
            const qualifiedTec = tecnicas.find((t) => {
              const rs = t.required_skill; return !rs || staffSkillMap.get(s.id)?.has(rs)
            })
            if (qualifiedTec) {
              finalAssignments.push({ staff_id: s.id, date: d, shift_type: shiftTypes[0]?.code ?? "T1", function_label: qualifiedTec.codigo })
            }
          }
          if (!finalWorkingDays[s.id]) finalWorkingDays[s.id] = new Set()
          finalWorkingDays[s.id].add(d)
          added++
        }
      }
    }

    // ── Technique coverage rescue ───────────────────────────────────────────────
    if (taskCoverage) {
      for (const [tecCode, coverageByDay] of Object.entries(taskCoverage)) {
        for (const [dayCode, minCount] of Object.entries(coverageByDay as Record<string, number>)) {
          if (minCount <= 0) continue
          const date = weekDates.find((d) => dayNames[new Date(d + "T12:00:00").getDay()] === dayCode)
          if (!date) continue
          const current = finalAssignments.filter((a) => a.date === date && a.function_label === tecCode).length
          if (current >= minCount) continue
          const engineDay = taskResult.days.find((d) => d.date === date)
          for (const ea of engineDay?.assignments.filter((a) => a.function_label === tecCode) ?? []) {
            if (!finalAssignments.some((a) => a.staff_id === ea.staff_id && a.date === date && a.function_label === tecCode)) {
              finalAssignments.push({ staff_id: ea.staff_id, date, shift_type: ea.shift_type, function_label: ea.function_label })
            }
          }
        }
      }
    }

    // ── Build DB rows ────────────────────────────────────────────────────────────
    const wholeTeamAI = new Set((whole_team_dates ?? []).map((wt) => `${wt.date}:${wt.function_label}`))
    const toInsert = finalAssignments
      .filter((a) => !overrideKeys.has(`${a.staff_id}:${a.date}:${a.function_label ?? ""}`))
      .map((a) => ({
        organisation_id: orgId, rota_id: rotaId,
        staff_id: a.staff_id, date: a.date, shift_type: a.shift_type,
        is_manual_override: false, function_label: a.function_label,
        tecnica_id: tecnicas.find((t) => t.codigo === a.function_label)?.id ?? null,
        whole_team: wholeTeamByDate[a.date]?.has(a.function_label) || wholeTeamAI.has(`${a.date}:${a.function_label}`) || false,
      }))

    if (toInsert.length === 0 && overrideAssignments.length === 0) {
      return { error: "Hybrid task generation produced 0 valid assignments." }
    }

    const { error: insertError } = await supabase
      .from("rota_assignments")
      .upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (insertError) return { error: insertError.message }

    const warningsStr = aiWarnings.length > 0 ? `\n\nRemaining issues:\n${aiWarnings.map((w) => `• ${w}`).join("\n")}` : ""
    const fullReasoning = `${assessment}${warningsStr}`
    await supabase.from("rotas").update({ engine_warnings: [...aiWarnings, `[ai-reasoning] ${fullReasoning}`] } as never).eq("id", rotaId)

    const { data: { user: auditUser } } = await supabase.auth.getUser()
    logAuditEvent({ orgId, userId: auditUser?.id, userEmail: auditUser?.email, action: "rota_generated", entityType: "rota", entityId: rotaId, metadata: { weekStart, method: "ai_hybrid_task", assignmentCount: toInsert.length, preserveOverrides } })
    await supabase.from("hybrid_generation_log").insert({ organisation_id: orgId } as never)

    revalidatePath("/")
    return { assignmentCount: toInsert.length, reasoning: fullReasoning }

  } catch (e) {
    // Fallback: store task engine base result
    const engineAssignments = taskResult.days.flatMap((d) =>
      d.assignments
        .filter((a) => !overrideKeys.has(`${a.staff_id}:${d.date}:${a.function_label ?? ""}`))
        .map((a) => ({
          organisation_id: orgId, rota_id: rotaId,
          staff_id: a.staff_id, date: d.date, shift_type: a.shift_type,
          is_manual_override: false, function_label: a.function_label,
          tecnica_id: tecnicas.find((t) => t.codigo === a.function_label)?.id ?? null,
          whole_team: wholeTeamByDate[d.date]?.has(a.function_label) ?? false,
        }))
    )
    if (engineAssignments.length > 0) {
      await supabase.from("rota_assignments")
        .upsert(engineAssignments as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    }
    const userWarnings = taskResult.warnings.filter((w) => !w.startsWith("[engine]") && !w.includes("[debug]"))
    await supabase.from("rotas").update({ engine_warnings: userWarnings.length > 0 ? userWarnings : null } as never).eq("id", rotaId)
    await supabase.from("hybrid_generation_log").insert({ organisation_id: orgId } as never)
    revalidatePath("/")
    const msg = e instanceof Error ? e.message : "AI optimisation failed"
    return { assignmentCount: engineAssignments.length, reasoning: `⚠ Claude optimisation failed (${msg}). Showing task engine base rota instead.` }
  }
}

// ── getActiveStaff ────────────────────────────────────────────────────────────

export async function getActiveStaff(): Promise<StaffWithSkills[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("staff")
    .select("*, staff_skills(*)")
    .neq("onboarding_status", "inactive")
    .order("first_name")
  if (error) {
    console.error("[getActiveStaff] Query error:", error.message)
    throw new Error(`Failed to load staff: ${error.message}`)
  }
  return (data ?? []) as StaffWithSkills[]
}

// ── upsertAssignment ──────────────────────────────────────────────────────────

export async function upsertAssignment(params: {
  weekStart: string
  assignmentId?: string
  staffId: string
  date: string
  shiftType: ShiftType
  notes?: string | null
  traineeStaffId?: string | null
  isOpu?: boolean
  functionLabel?: string | null
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Upsert rota record (create if this week has no rota yet)
  const { data: rotaRow, error: rotaError } = await supabase
    .from("rotas")
    .upsert(
      { organisation_id: orgId, week_start: params.weekStart, status: "draft" } as never,
      { onConflict: "organisation_id,week_start" }
    )
    .select("id")
    .single()
  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }
  const rotaId = (rotaRow as { id: string }).id

  // Snapshot before mutation
  captureSnapshot(rotaId, params.date, params.weekStart)

  if (params.assignmentId) {
    // Update existing
    const { error } = await supabase
      .from("rota_assignments")
      .update({
        staff_id: params.staffId,
        shift_type: params.shiftType,
        notes: params.notes ?? null,
        trainee_staff_id: params.traineeStaffId ?? null,
        is_manual_override: true,
      } as never)
      .eq("id", params.assignmentId)
    if (error) return { error: error.message }
    revalidatePath("/")
    return { id: params.assignmentId }
  } else {
    // Insert new assignment — use upsert if constraint exists, fall back to insert
    const row_data = {
      organisation_id: orgId,
      rota_id: rotaId,
      staff_id: params.staffId,
      date: params.date,
      shift_type: params.shiftType,
      is_manual_override: true,
      notes: params.notes ?? null,
      trainee_staff_id: params.traineeStaffId ?? null,
      function_label: params.functionLabel ?? "",
    }
    let { data: row, error } = await supabase
      .from("rota_assignments")
      .upsert(row_data as never, { onConflict: "rota_id,staff_id,date,function_label" })
      .select("id")
      .single()
    // Fall back to plain insert if constraint doesn't exist
    if (error?.message?.includes("ON CONFLICT")) {
      const res = await supabase.from("rota_assignments").insert(row_data as never).select("id").single()
      row = res.data
      error = res.error
    }
    if (error) return { error: error.message }
    // Audit
    const { data: { user: auUser } } = await supabase.auth.getUser()
    logAuditEvent({
      orgId, userId: auUser?.id, userEmail: auUser?.email,
      action: "assignment_changed",
      entityType: "rota_assignment",
      metadata: { staffId: params.staffId, date: params.date, shiftType: params.shiftType, functionLabel: params.functionLabel ?? "" },
    })
    revalidatePath("/")
    return { id: (row as unknown as { id: string })?.id }
  }
}

// ── deleteAssignment ──────────────────────────────────────────────────────────

export async function deleteAssignment(assignmentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  // Snapshot before deletion
  const { data: asg } = await supabase.from("rota_assignments").select("rota_id, date, rota:rota_id(week_start)").eq("id", assignmentId).eq("organisation_id", orgId).maybeSingle() as { data: { rota_id: string; date: string; rota: { week_start: string } | null } | null }
  if (asg?.rota) captureSnapshot(asg.rota_id, asg.date, asg.rota.week_start)

  const { error } = await supabase
    .from("rota_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── updateAssignmentShift ─────────────────────────────────────────────────────

export async function updateAssignmentShift(
  assignmentId: string,
  shiftType: ShiftType,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("rota_assignments")
    .update({ shift_type: shiftType, is_manual_override: true } as never)
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── setDayOpu ─────────────────────────────────────────────────────────────────

// ── deleteAllDayAssignments ───────────────────────────────────────────────────

export async function deleteAllDayAssignments(
  rotaId: string,
  date: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("rota_assignments")
    .delete()
    .eq("rota_id", rotaId)
    .eq("date", date)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── regenerateDay ────────────────────────────────────────────────────────────

export async function regenerateDay(
  weekStart: string,
  date: string,
): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - RECENT_ASSIGNMENTS_LOOKBACK_DAYS)

  // Fetch data (same as full generate)
  const [staffRes, leavesRes, recentRes, configRes, rulesRes, shiftRes, tecRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").neq("onboarding_status", "inactive"),
    supabase.from("leaves").select("staff_id, start_date, end_date, type").lte("start_date", weekDates[6]).gte("end_date", weekDates[0]).eq("status", "approved"),
    supabase.from("rota_assignments").select("staff_id, date, shift_type").gte("date", fourWeeksAgo.toISOString().split("T")[0]).lte("date", weekDates[6]),
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("id, type, is_hard, enabled, staff_ids, params, notes, expires_at").eq("enabled", true),
    supabase.from("shift_types").select("code, name_es, name_en, start_time, end_time, sort_order, active, active_days").order("sort_order"),
    supabase.from("tecnicas").select("codigo, typical_shifts").eq("activa", true),
  ])

  const labConfig = configRes.data as unknown as LabConfig | null
  if (!labConfig) return { error: "No lab config found." }

  // Public holidays
  const regenYears = [...new Set(weekDates.map((d) => parseInt(d.slice(0, 4))))]
  const regenHolidays: Record<string, string> = Object.assign({}, ...regenYears.map((y) => getPublicHolidays(y, labConfig.country || "ES", labConfig.region || null)))

  // Run engine for the full week (needed for budget tracking)
  const { days } = runRotaEngine({
    weekStart,
    staff: (staffRes.data ?? []) as StaffWithSkills[],
    leaves: (leavesRes.data ?? []) as Leave[],
    recentAssignments: (recentRes.data ?? []) as RotaAssignment[],
    labConfig,
    shiftTypes: (shiftRes.data ?? []) as ShiftTypeDefinition[],
    rules: ((rulesRes.data ?? []) as RotaRule[]).filter((r) => !r.expires_at || r.expires_at > weekStart),
    tecnicas: (tecRes.data ?? []).map((t: any) => ({
      codigo: t.codigo,
      department: t.department ?? "lab",
      typical_shifts: t.typical_shifts ?? [],
      avoid_shifts: t.avoid_shifts ?? [],
    })),
    shiftRotation: (labConfig.shift_rotation as "stable" | "weekly" | "daily") ?? "stable",
    taskCoverageEnabled: labConfig.task_coverage_enabled ?? false,
    taskCoverageByDay: labConfig.task_coverage_by_day as Record<string, Record<string, number>> | null,
    shiftCoverageEnabled: labConfig.shift_coverage_enabled ?? false,
    shiftCoverageByDay: labConfig.shift_coverage_by_day as import("@/lib/types/database").ShiftCoverageByDay | null,
    publicHolidays: regenHolidays,
  })

  // Find the specific day's assignments from the engine output
  const dayPlan = days.find((d) => d.date === date)
  if (!dayPlan) return { error: "Date not in week range." }

  // Upsert rota record
  const { data: rotaRow, error: rotaError } = await supabase
    .from("rotas")
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" } as never, { onConflict: "organisation_id,week_start" })
    .select("id")
    .single()
  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }
  const rotaId = (rotaRow as { id: string }).id

  // Delete existing assignments for THIS DAY only (preserve manual overrides)
  await supabase
    .from("rota_assignments")
    .delete()
    .eq("rota_id", rotaId)
    .eq("date", date)
    .eq("is_manual_override", false)

  // Insert engine assignments for this day
  const toInsert = dayPlan.assignments.map((a) => ({
    organisation_id: orgId,
    rota_id: rotaId,
    staff_id: a.staff_id,
    date,
    shift_type: a.shift_type,
    is_manual_override: false,
    function_label: "",
  }))

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return { count: toInsert.length }
}

// ── moveAssignment ────────────────────────────────────────────────────────────

export async function moveAssignment(
  assignmentId: string,
  newDate: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("rota_assignments")
    .update({ date: newDate, is_manual_override: true } as never)
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── setPunctionsOverride ──────────────────────────────────────────────────────

export async function setPunctionsOverride(
  rotaId: string,
  date: string,
  value: number | null,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }

  // Fetch existing override map
  const { data: rotaData } = await supabase
    .from("rotas")
    .select("punctions_override")
    .eq("id", rotaId)
    .eq("organisation_id", orgId)
    .single() as { data: { punctions_override: Record<string, number> | null } | null }

  const current = rotaData?.punctions_override ?? {}
  let updated: Record<string, number>
  if (value === null) {
    const { [date]: _removed, ...rest } = current
    updated = rest
  } else {
    updated = { ...current, [date]: value }
  }

  const { error } = await supabase
    .from("rotas")
    .update({ punctions_override: updated } as never)
    .eq("id", rotaId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── publishRota ───────────────────────────────────────────────────────────────

export async function publishRota(rotaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { data: { user } } = await supabase.auth.getUser()
  const publisherName = (user?.user_metadata?.full_name as string) ?? user?.email ?? "—"

  // Get the rota's week_start before publishing
  const { data: rotaRow } = await supabase
    .from("rotas")
    .select("week_start")
    .eq("id", rotaId)
    .eq("organisation_id", orgId)
    .single() as { data: { week_start: string } | null }

  const { error } = await supabase
    .from("rotas")
    .update({ status: "published", published_at: new Date().toISOString(), published_by: publisherName } as never)
    .eq("id", rotaId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  if (orgId) logAuditEvent({ orgId, userId: user?.id, userEmail: user?.email, action: "rota_published", entityType: "rota", entityId: rotaId })
  // Capture locale before revalidation (cookies may not be available after)
  const cookieStore = await cookies()
  const notifLocale = (cookieStore.get("locale")?.value ?? "es") === "en" ? "en" : "es"

  revalidatePath("/")

  // Fire-and-forget: send notification emails
  if (rotaRow?.week_start) {
    sendPublishNotifications(orgId, rotaRow.week_start, publisherName, notifLocale).catch((err) => {
      console.error("[publishRota] notification error:", err)
    })
  }

  return {}
}

async function sendPublishNotifications(orgId: string, weekStart: string, publisherName: string, locale: "es" | "en") {
  const { getEnabledRecipientEmails } = await import("@/app/(clinic)/notifications-actions")
  const { sendRotaPublishEmails } = await import("@/lib/rota-email")
  const { createAdminClient } = await import("@/lib/supabase/admin")

  const emails = await getEnabledRecipientEmails(orgId)
  if (emails.length === 0) return

  // Get org name + email format preference
  const admin = createAdminClient()
  const { data: org } = await admin.from("organisations").select("name, rota_email_format").eq("id", orgId).single() as { data: { name: string; rota_email_format?: string } | null }
  const orgName = org?.name ?? "LabRota"
  const emailFormat = (org?.rota_email_format as "by_shift" | "by_person") ?? "by_shift"

  // Fetch rota data (uses RLS client via cookies — called while request is still alive)
  const data = await getRotaWeek(weekStart)

  await sendRotaPublishEmails({ emails, data, orgName, publisherName, locale, emailFormat })
}

// ── unlockRota ────────────────────────────────────────────────────────────────

export async function unlockRota(rotaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("rotas")
    .update({ status: "draft", published_at: null } as never)
    .eq("id", rotaId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── moveAssignmentShift ───────────────────────────────────────────────────────

export async function moveAssignmentShift(assignmentId: string, newShiftType: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("rota_assignments")
    .update({ shift_type: newShiftType, is_manual_override: true } as never)
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── removeAssignment ──────────────────────────────────────────────────────────

export async function removeAssignment(assignmentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  // Snapshot before removal
  const { data: asg } = await supabase.from("rota_assignments").select("rota_id, date, rota:rota_id(week_start)").eq("id", assignmentId).eq("organisation_id", orgId).maybeSingle() as { data: { rota_id: string; date: string; rota: { week_start: string } | null } | null }
  if (asg?.rota) captureSnapshot(asg.rota_id, asg.date, asg.rota.week_start)

  const { error } = await supabase
    .from("rota_assignments")
    .delete()
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── setTecnica ────────────────────────────────────────────────────────────────

export async function setTecnica(assignmentId: string, tecnicaId: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("rota_assignments")
    .update({ tecnica_id: tecnicaId } as never)
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── setFunctionLabel ──────────────────────────────────────────────────────────

export async function setFunctionLabel(assignmentId: string, label: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase
    .from("rota_assignments")
    .update({ function_label: label ?? "" } as never)
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── setWholeTeam ─────────────────────────────────────────────────────────────

export async function setWholeTeam(
  weekStart: string,
  functionLabel: string,
  date: string,
  wholeTeam: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Find rota for this week
  const { data: rota } = await supabase
    .from("rotas")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("week_start", weekStart)
    .single()
  if (!rota) return { error: "No rota found." }

  const rotaId = (rota as { id: string }).id

  // Check if there are existing assignments for this function_label + date
  const { data: existing } = await supabase
    .from("rota_assignments")
    .select("id")
    .eq("rota_id", rotaId)
    .eq("date", date)
    .eq("function_label", functionLabel)
    .limit(1)

  if (existing && existing.length > 0) {
    // Update existing assignments
    const { error } = await supabase
      .from("rota_assignments")
      .update({ whole_team: wholeTeam } as never)
      .eq("rota_id", rotaId)
      .eq("date", date)
      .eq("function_label", functionLabel)
    if (error) return { error: error.message }
  } else if (wholeTeam) {
    // No assignments yet — create a marker row so whole_team persists
    // Use a special staff_id placeholder (first org member)
    const { data: firstStaff } = await supabase
      .from("staff")
      .select("id")
      .eq("organisation_id", orgId)
      .limit(1)
      .single()
    if (firstStaff) {
      await supabase.from("rota_assignments").upsert({
        organisation_id: orgId,
        rota_id: rotaId,
        staff_id: (firstStaff as { id: string }).id,
        date,
        shift_type: "T1",
        function_label: functionLabel,
        whole_team: true,
        is_manual_override: true,
      } as never, { onConflict: "rota_id,staff_id,date,function_label" })
    }
  }

  revalidatePath("/")
  return {}
}

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
      gridDates.push(d.toISOString().split("T")[0])
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
      gridDates.push(d.toISOString().split("T")[0])
    }
  }

  const orgRes = await (supabase.from("organisations").select("rota_display_mode").limit(1).maybeSingle() as unknown as Promise<{ data: { rota_display_mode?: string } | null }>)
  const rotaDisplayMode = orgRes.data?.rota_display_mode ?? "by_shift"

  const [assignmentsRes, skillsRes, leavesRes, labConfigRes, rotasRes, staffRes, tecnicasRes] = await Promise.all([
    supabase
      .from("rota_assignments")
      .select("date, staff_id, shift_type, staff:staff_id(first_name, last_name, role)")
      .gte("date", gridDates[0])
      .lte("date", gridDates[gridDates.length - 1]) as unknown as Promise<{ data: { date: string; staff_id: string; shift_type: string; staff: { first_name: string; last_name: string; role: string } | null }[] | null }>,
    supabase
      .from("staff_skills")
      .select("staff_id, skill, level") as unknown as Promise<{ data: SkillRow[] | null }>,
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date")
      .lte("start_date", gridDates[gridDates.length - 1])
      .gte("end_date", gridDates[0])
      .eq("status", "approved") as unknown as Promise<{ data: { staff_id: string; start_date: string; end_date: string }[] | null }>,
    supabase.from("lab_config").select("punctions_by_day, country, region").single() as unknown as Promise<{ data: { punctions_by_day: Record<string, number> | null; country?: string | null; region?: string | null } | null }>,
    supabase
      .from("rotas")
      .select("week_start, status, engine_warnings")
      .gte("week_start", gridDates[0])
      .lte("week_start", gridDates[gridDates.length - 1]) as unknown as Promise<{ data: { week_start: string; status: string; engine_warnings: string[] | null }[] | null }>,
    supabase
      .from("staff")
      .select("id, first_name, last_name, role, days_per_week")
      .neq("onboarding_status", "inactive") as unknown as Promise<{ data: { id: string; first_name: string; last_name: string; role: string; days_per_week: number }[] | null }>,
    supabase
      .from("tecnicas")
      .select("codigo, required_skill, typical_shifts")
      .eq("activa", true) as unknown as Promise<{ data: { codigo: string; required_skill: string | null; typical_shifts: string[] | null }[] | null }>,
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
      const iso = d.toISOString().split("T")[0]
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
    const monthHolidayMode = (labConfigRes.data as { public_holiday_mode?: string } | null)?.public_holiday_mode ?? "saturday"
    const isHolidayReducedCoverage = monthHolidayMode !== "weekday" && !!holidays[date] && !isWeekend
    const effectiveWeekend = isWeekend || isHolidayReducedCoverage
    const uniqueEntries = [...new Map(entries.map((e) => [e.staff_id, e])).values()]
    const labCount = uniqueEntries.filter((e) => e.role === "lab").length
    const andrologyCount = uniqueEntries.filter((e) => e.role === "andrology").length
    // Coverage warning: check if below minimums
    const lc = labConfigRes.data as Record<string, number> | null
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

  const ratioConfigRes = await supabase.from("lab_config").select("ratio_optimal, ratio_minimum, first_day_of_week, time_format, biopsy_conversion_rate, biopsy_day5_pct, biopsy_day6_pct").maybeSingle()
  const ratioOptimal = (ratioConfigRes.data as { ratio_optimal?: number } | null)?.ratio_optimal ?? 1.0
  const ratioMinimum = (ratioConfigRes.data as { ratio_minimum?: number } | null)?.ratio_minimum ?? 0.75
  const firstDayOfWeek = (ratioConfigRes.data as { first_day_of_week?: number } | null)?.first_day_of_week ?? 0

  const timeFormat = (ratioConfigRes.data as { time_format?: string } | null)?.time_format ?? "24h"
  const biopsyConversionRate = (ratioConfigRes.data as { biopsy_conversion_rate?: number } | null)?.biopsy_conversion_rate ?? 0.5
  const biopsyDay5Pct = (ratioConfigRes.data as { biopsy_day5_pct?: number } | null)?.biopsy_day5_pct ?? 0.5
  const biopsyDay6Pct = (ratioConfigRes.data as { biopsy_day6_pct?: number } | null)?.biopsy_day6_pct ?? 0.5
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
  const today    = new Date().toISOString().split("T")[0]

  // Go back 8 weeks to capture enough history for "last 10 shifts"
  const eightWeeksAgo = new Date()
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
  const since = eightWeeksAgo.toISOString().split("T")[0]

  // Compute previous and next week date ranges relative to the viewed week
  const viewedMonday = weekStart ? new Date(weekStart + "T12:00:00") : new Date(getMondayOfWeek() + "T12:00:00")
  const prevMonday = new Date(viewedMonday)
  prevMonday.setDate(prevMonday.getDate() - 7)
  const prevSunday = new Date(prevMonday)
  prevSunday.setDate(prevSunday.getDate() + 6)
  const nextMonday = new Date(viewedMonday)
  nextMonday.setDate(nextMonday.getDate() + 7)
  const nextSunday = new Date(nextMonday)
  nextSunday.setDate(nextSunday.getDate() + 6)
  const fmt = (d: Date) => d.toISOString().split("T")[0]

  const [assignmentsRes, leavesRes, pastLeavesRes, prevWeekRes, nextWeekRes, rulesRes] = await Promise.all([
    supabase
      .from("rota_assignments")
      .select("date, shift_type, function_label")
      .eq("staff_id", staffId)
      .gte("date", since)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(20) as unknown as Promise<{ data: { date: string; shift_type: string; function_label: string | null }[] | null }>,
    supabase
      .from("leaves")
      .select("start_date, end_date, type")
      .eq("staff_id", staffId)
      .eq("status", "approved")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(5) as unknown as Promise<{ data: { start_date: string; end_date: string; type: string }[] | null }>,
    supabase
      .from("leaves")
      .select("start_date, end_date, type")
      .eq("staff_id", staffId)
      .eq("status", "approved")
      .lt("end_date", today)
      .order("end_date", { ascending: false })
      .limit(3) as unknown as Promise<{ data: { start_date: string; end_date: string; type: string }[] | null }>,
    supabase
      .from("rota_assignments")
      .select("date, shift_type")
      .eq("staff_id", staffId)
      .gte("date", fmt(prevMonday))
      .lte("date", fmt(prevSunday))
      .order("date") as unknown as Promise<{ data: { date: string; shift_type: string }[] | null }>,
    supabase
      .from("rota_assignments")
      .select("date, shift_type")
      .eq("staff_id", staffId)
      .gte("date", fmt(nextMonday))
      .lte("date", fmt(nextSunday))
      .order("date") as unknown as Promise<{ data: { date: string; shift_type: string }[] | null }>,
    supabase
      .from("rota_rules")
      .select("type, is_hard, staff_ids, params, notes, expires_at")
      .eq("enabled", true) as unknown as Promise<{ data: { type: string; is_hard: boolean; staff_ids: string[]; params: Record<string, unknown>; notes: string | null; expires_at: string | null }[] | null }>,
  ])

  return {
    recentAssignments: assignmentsRes.data ?? [],
    upcomingLeaves: leavesRes.data ?? [],
    pastLeaves: pastLeavesRes.data ?? [],
    prevWeekAssignments: prevWeekRes.data ?? [],
    nextWeekAssignments: nextWeekRes.data ?? [],
    rules: (rulesRes.data ?? []).filter((r) =>
      (r.staff_ids.includes(staffId) || r.params.supervisor_id === staffId) &&
      (!r.expires_at || r.expires_at > (weekStart ?? new Date().toISOString().split("T")[0]))
    ),
  }
}

export async function copyDayFromLastWeek(weekStart: string, date: string): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Get the same weekday from last week
  const lastWeekDate = new Date(date + "T12:00:00")
  lastWeekDate.setDate(lastWeekDate.getDate() - 7)
  const lastWeek = lastWeekDate.toISOString().split("T")[0]

  const { data: lastWeekAssignments } = await supabase
    .from("rota_assignments")
    .select("staff_id, shift_type, function_label")
    .eq("date", lastWeek) as unknown as { data: { staff_id: string; shift_type: string; function_label: string | null }[] | null }

  if (!lastWeekAssignments || lastWeekAssignments.length === 0) {
    return { error: "No assignments on the same day last week." }
  }

  // Ensure rota exists
  const { data: rotaRow } = await supabase
    .from("rotas")
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" } as never, { onConflict: "organisation_id,week_start" })
    .select("id")
    .single() as unknown as { data: { id: string } | null }
  if (!rotaRow) return { error: "Error creating rota." }

  // Check who's on leave
  const { data: leaves } = await supabase
    .from("leaves")
    .select("staff_id")
    .lte("start_date", date)
    .gte("end_date", date)
    .eq("status", "approved") as unknown as { data: { staff_id: string }[] | null }
  const leaveIds = new Set((leaves ?? []).map((l) => l.staff_id))

  const toInsert = lastWeekAssignments
    .filter((a) => !leaveIds.has(a.staff_id))
    .map((a) => ({
      organisation_id: orgId,
      rota_id: rotaRow.id,
      staff_id: a.staff_id,
      date,
      shift_type: a.shift_type,
      is_manual_override: true,
      function_label: a.function_label ?? "",
    }))

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return { count: toInsert.length }
}

export async function copyPreviousWeek(weekStart: string): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Previous week start
  const prevDate = new Date(weekStart + "T12:00:00")
  prevDate.setDate(prevDate.getDate() - 7)
  const prevWeekStart = prevDate.toISOString().split("T")[0]
  const prevDates = getWeekDates(prevWeekStart)
  const currDates = getWeekDates(weekStart)

  // Fetch previous week's assignments
  const { data: prevAssignments } = await supabase
    .from("rota_assignments")
    .select("staff_id, date, shift_type, function_label")
    .gte("date", prevDates[0])
    .lte("date", prevDates[6]) as unknown as { data: { staff_id: string; date: string; shift_type: string; function_label: string | null }[] | null }

  if (!prevAssignments || prevAssignments.length === 0) {
    return { error: "No assignments in the previous week." }
  }

  // Upsert rota
  const { data: rotaRow } = await supabase
    .from("rotas")
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" } as never, { onConflict: "organisation_id,week_start" })
    .select("id")
    .single() as unknown as { data: { id: string } | null }
  if (!rotaRow) return { error: "Error creating rota." }

  // Check leaves for this week
  const { data: leaves } = await supabase
    .from("leaves")
    .select("staff_id, start_date, end_date")
    .lte("start_date", currDates[6])
    .gte("end_date", currDates[0])
    .eq("status", "approved") as unknown as { data: { staff_id: string; start_date: string; end_date: string }[] | null }

  const onLeave: Record<string, Set<string>> = {}
  for (const l of leaves ?? []) {
    const s = new Date(l.start_date + "T12:00:00")
    const e = new Date(l.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split("T")[0]
      if (!onLeave[iso]) onLeave[iso] = new Set()
      onLeave[iso].add(l.staff_id)
    }
  }

  // Map previous assignments to current week (same day offset)
  const toInsert = prevAssignments
    .map((a) => {
      const dayOffset = prevDates.indexOf(a.date)
      if (dayOffset < 0) return null
      const newDate = currDates[dayOffset]
      if (onLeave[newDate]?.has(a.staff_id)) return null
      return {
        organisation_id: orgId,
        rota_id: rotaRow.id,
        staff_id: a.staff_id,
        date: newDate,
        shift_type: a.shift_type,
        is_manual_override: false,
        function_label: a.function_label ?? "",
      }
    })
    .filter(Boolean)

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return { count: toInsert.length }
}

export async function clearWeek(weekStart: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { data: rotaRow, error: upsertErr } = await supabase
    .from("rotas")
    .upsert(
      { organisation_id: orgId, week_start: weekStart, status: "draft" } as never,
      { onConflict: "organisation_id,week_start" }
    )
    .select("id")
    .single() as unknown as { data: { id: string } | null; error: { message: string } | null }

  if (upsertErr) return { error: upsertErr.message }
  if (!rotaRow) return { error: "Error creating rota." }

  // Best-effort: set generation_type
  await supabase.from("rotas").update({ generation_type: "manual" } as never).eq("id", rotaRow.id)

  await supabase.from("rota_assignments").delete().eq("rota_id", rotaRow.id)
  revalidatePath("/")
  return {}
}

// ── Template actions ──────────────────────────────────────────────────────────

import type { RotaTemplate, RotaTemplateAssignment } from "@/lib/types/database"

export async function saveAsTemplate(weekStart: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  const dates = getWeekDates(weekStart)
  const { data: assignments } = await supabase
    .from("rota_assignments")
    .select("staff_id, date, shift_type, function_label")
    .gte("date", dates[0])
    .lte("date", dates[6]) as unknown as { data: { staff_id: string; date: string; shift_type: string; function_label: string | null }[] | null }

  if (!assignments || assignments.length === 0) return { error: "No shifts to save." }

  const templateAssignments: RotaTemplateAssignment[] = assignments.map((a) => {
    const dayIndex = dates.indexOf(a.date)
    return {
      staff_id: a.staff_id,
      day_offset: dayIndex >= 0 ? dayIndex : 0,
      shift_type: a.shift_type,
      function_label: a.function_label ?? null,
    }
  })

  const { error } = await (supabase
    .from("rota_templates") as ReturnType<typeof supabase.from>)
    .insert({ organisation_id: orgId, name, assignments: templateAssignments } as never)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

export async function getTemplates(): Promise<RotaTemplate[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("rota_templates")
    .select("id, name, assignments, created_at")
    .order("created_at", { ascending: false }) as unknown as { data: RotaTemplate[] | null }
  return data ?? []
}

export async function applyTemplate(templateId: string, weekStart: string, strict = true): Promise<{ error?: string; skipped?: string[] }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Fetch template
  const { data: template } = await supabase
    .from("rota_templates")
    .select("id, name, assignments")
    .eq("id", templateId)
    .single() as unknown as { data: RotaTemplate | null }
  if (!template) return { error: "Template not found." }

  const dates = getWeekDates(weekStart)

  // Upsert rota record
  const { data: rota } = await supabase
    .from("rotas")
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" } as never, { onConflict: "organisation_id, week_start" })
    .select("id")
    .single() as unknown as { data: { id: string } | null }
  if (!rota) return { error: "Error creating rota." }

  // Best-effort: set generation_type
  await supabase.from("rotas").update({ generation_type: strict ? "strict_template" : "flexible_template" } as never).eq("id", rota.id)

  // Fetch leaves for this week
  const { data: leaves } = await supabase
    .from("leaves")
    .select("staff_id, start_date, end_date")
    .lte("start_date", dates[6])
    .gte("end_date", dates[0])
    .eq("status", "approved") as unknown as { data: { staff_id: string; start_date: string; end_date: string }[] | null }

  const onLeave: Record<string, Set<string>> = {}
  for (const l of leaves ?? []) {
    const s = new Date(l.start_date + "T12:00:00")
    const e = new Date(l.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split("T")[0]
      if (!onLeave[iso]) onLeave[iso] = new Set()
      onLeave[iso].add(l.staff_id)
    }
  }

  // Fetch active staff
  const { data: activeStaff } = await supabase
    .from("staff")
    .select("id, onboarding_status")
    .eq("onboarding_status", "active") as unknown as { data: { id: string }[] | null }
  const activeIds = new Set((activeStaff ?? []).map((s) => s.id))

  // Delete existing non-override assignments
  await supabase
    .from("rota_assignments")
    .delete()
    .eq("rota_id", rota.id)
    .eq("is_manual_override", false)

  // Insert template assignments, skipping leave/inactive
  const skipped: string[] = []
  const toInsert: { organisation_id: string; rota_id: string; staff_id: string; date: string; shift_type: string; is_manual_override: boolean; function_label: string }[] = []

  for (const a of template.assignments) {
    const date = dates[a.day_offset]
    if (!date) continue
    if (!activeIds.has(a.staff_id)) { skipped.push(a.staff_id); continue }
    if (onLeave[date]?.has(a.staff_id)) { skipped.push(a.staff_id); continue }
    toInsert.push({
      organisation_id: orgId,
      rota_id: rota.id,
      staff_id: a.staff_id,
      date,
      shift_type: a.shift_type,
      is_manual_override: false,
      function_label: a.function_label ?? "",
    })
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return { skipped: [...new Set(skipped)] }
}

export async function renameTemplate(id: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase.from("rota_templates").update({ name } as never).eq("id", id).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase.from("rota_templates").delete().eq("id", id).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}
