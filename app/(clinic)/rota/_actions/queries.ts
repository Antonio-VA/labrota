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
import type { SkillRow } from "./_shared"
import { DOW_TO_KEY } from "./_shared"
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


import { getPublicHolidays } from "@/lib/rota-holidays"
import { isWeekend } from "@/lib/engine-helpers"

// ── getRotaWeek ───────────────────────────────────────────────────────────────

export async function getRotaWeek(weekStart: string): Promise<RotaWeekData> {
  const cookieStore = await cookies()
  const locale = (cookieStore.get("locale")?.value ?? "es") === "en" ? "en" : "es"
  const supabase = await createClient()
  const dates = getWeekDates(weekStart)

  // Fire the assignments query in parallel with everything else, but don't block
  // the null-rota return on it — if no rota exists, we throw it away unawaited.
  // This saves ~50-150ms on "no rota" weeks (next-week clicks before generation).
  type AssignmentJoinRow = { id: string; staff_id: string; date: string; shift_type: string; is_manual_override: boolean; trainee_staff_id: string | null; notes: string | null; function_label: string | null; tecnica_id: string | null; whole_team: boolean; rota_id: string }
  const assignmentsPromise = typedQuery<AssignmentJoinRow[]>(
    supabase
      .from("rota_assignments")
      .select("id, staff_id, date, shift_type, is_manual_override, trainee_staff_id, notes, function_label, tecnica_id, whole_team, rota_id, rotas!inner(week_start)")
      .eq("rotas.week_start", weekStart))

  const [rotaResultFull, labConfigResult, leavesResult, shiftTypesRes, tecnicasRes, departmentsRes, rulesRes, orgResult, staffRes, skillsRes] = await Promise.all([
    typedQuery<RotaRecord>(
      supabase
        .from("rotas")
        .select("id, status, published_at, published_by, punctions_override, engine_warnings")
        .eq("week_start", weekStart)
        .maybeSingle()),
    supabase.from("lab_config").select("punctions_by_day, country, region, ratio_optimal, ratio_minimum, first_day_of_week, time_format, biopsy_conversion_rate, biopsy_day5_pct, biopsy_day6_pct, days_off_preference, task_conflict_threshold, enable_task_in_shift, enable_swap_requests, part_time_weight, intern_weight, public_holiday_mode, shift_coverage_enabled, shift_coverage_by_day").maybeSingle(),
    typedQuery<LeaveRow[]>(
      supabase
        .from("leaves")
        .select("staff_id, start_date, end_date, type")
        .lte("start_date", dates[6])
        .gte("end_date", dates[0])
        .eq("status", "approved")),
    typedQuery<ShiftTypeDefinition[]>(supabase.from("shift_types").select("code, name_es, name_en, start_time, end_time, sort_order, active, active_days, department_codes").order("sort_order")),
    typedQuery<Tecnica[]>(supabase.from("tecnicas").select("*").order("orden").order("created_at")),
    typedQuery<import("@/lib/types/database").Department[]>(supabase.from("departments").select("*").order("sort_order")),
    typedQuery<RuleRow[]>(supabase.from("rota_rules").select("type, enabled, staff_ids, params, expires_at").eq("enabled", true).in("type", ["restriccion_dia_tecnica", "supervisor_requerido"])),
    typedQuery<OrgConfig>(
      supabase
        .from("organisations")
        .select("rota_display_mode, ai_optimal_version, engine_hybrid_enabled, engine_reasoning_enabled, task_optimal_version, task_hybrid_enabled, task_reasoning_enabled")
        .limit(1)
        .maybeSingle()),
    typedQuery<StaffRow[]>(
      supabase
        .from("staff")
        .select("id, first_name, last_name, role, onboarding_status, contract_type, onboarding_end_date, days_per_week, working_pattern, preferred_days, avoid_days, preferred_shift, avoid_shifts, prefers_guardia, color, email, start_date, end_date, notes, contracted_hours")),
    typedQuery<SkillRow[]>(
      supabase
        .from("staff_skills")
        .select("staff_id, skill, level")),
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
    const fallback = await typedQuery<RotaRecord>(
      supabase
        .from("rotas")
        .select("id, status, published_at, published_by, punctions_override")
        .eq("week_start", weekStart)
        .maybeSingle())
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
    dayMap[date] = { date, isWeekend: isWeekend(date), assignments: [], skillGaps: [], warnings: [] }
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
      const iso = toISODate(d)
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
    // Throw away the speculative assignments query without awaiting it.
    assignmentsPromise.catch(() => {})
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

  // Assignments were fetched in parallel via rota join — now that we know the
  // rota exists, await the speculative query started at the top of this function.
  const assignmentsRes = (await assignmentsPromise) as { data: RawAssignment[] | null; error: { message: string } | null }

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
    const { data: baseData } = await typedQuery<Omit<RawAssignment, "trainee_staff_id" | "notes" | "function_label" | "tecnica_id">[]>(
      supabase
        .from("rota_assignments")
        .select("id, staff_id, date, shift_type, is_manual_override")
        .eq("rota_id", rota.id))
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
