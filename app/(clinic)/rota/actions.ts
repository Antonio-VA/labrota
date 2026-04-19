"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { getCachedOrgId } from "@/lib/auth-cache"
import { RECENT_ASSIGNMENTS_LOOKBACK_DAYS } from "@/lib/constants"
import { runRotaEngine, getWeekDates, getMondayOfWeek } from "@/lib/rota-engine"
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


import { getPublicHolidays, isWeekendDate } from "@/lib/rota-holidays"

// ── getRotaWeek ───────────────────────────────────────────────────────────────

const DOW_TO_KEY: Record<number, keyof import("@/lib/types/database").PunctionsByDay> = {
  1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 0: "sun",
}

export async function getRotaWeek(weekStart: string): Promise<RotaWeekData> {
  const cookieStore = await cookies()
  const locale = (cookieStore.get("locale")?.value ?? "es") === "en" ? "en" : "es"
  const supabase = await createClient()
  const dates = getWeekDates(weekStart)

  // Fire the assignments query in parallel with everything else, but don't block
  // the null-rota return on it — if no rota exists, we throw it away unawaited.
  // This saves ~50-150ms on "no rota" weeks (next-week clicks before generation).
  const assignmentsPromise = supabase
    .from("rota_assignments")
    .select("id, staff_id, date, shift_type, is_manual_override, trainee_staff_id, notes, function_label, tecnica_id, whole_team, rota_id, rotas!inner(week_start)")
    .eq("rotas.week_start", weekStart) as unknown as Promise<{ data: Array<{ id: string; staff_id: string; date: string; shift_type: string; is_manual_override: boolean; trainee_staff_id: string | null; notes: string | null; function_label: string | null; tecnica_id: string | null; whole_team: boolean; rota_id: string }> | null; error: { message: string } | null }>

  const [rotaResultFull, labConfigResult, leavesResult, shiftTypesRes, tecnicasRes, departmentsRes, rulesRes, orgResult, staffRes, skillsRes] = await Promise.all([
    supabase
      .from("rotas")
      .select("id, status, published_at, published_by, punctions_override, engine_warnings")
      .eq("week_start", weekStart)
      .maybeSingle() as unknown as Promise<{ data: RotaRecord | null; error: { message: string } | null }>,
    supabase.from("lab_config").select("punctions_by_day, country, region, ratio_optimal, ratio_minimum, first_day_of_week, time_format, biopsy_conversion_rate, biopsy_day5_pct, biopsy_day6_pct, days_off_preference, task_conflict_threshold, enable_task_in_shift, enable_swap_requests, part_time_weight, intern_weight, public_holiday_mode, shift_coverage_enabled, shift_coverage_by_day").maybeSingle(),
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date, type")
      .lte("start_date", dates[6])
      .gte("end_date", dates[0])
      .eq("status", "approved") as unknown as Promise<{ data: LeaveRow[] | null; error: { message: string } | null }>,
    supabase.from("shift_types").select("code, name_es, name_en, start_time, end_time, sort_order, active, active_days, department_codes").order("sort_order") as unknown as Promise<{ data: ShiftTypeDefinition[] | null; error: { message: string } | null }>,
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
  return (data ?? []) as unknown as StaffWithSkills[]
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
      { organisation_id: orgId, week_start: params.weekStart, status: "draft" },
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
      })
      .eq("id", params.assignmentId)
      .eq("organisation_id", orgId)
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
      .upsert(row_data, { onConflict: "rota_id,staff_id,date,function_label" })
      .select("id")
      .single()
    // Fall back to plain insert if constraint doesn't exist
    if (error?.message?.includes("ON CONFLICT")) {
      const res = await supabase.from("rota_assignments").insert(row_data).select("id").single()
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
    .update({ shift_type: shiftType, is_manual_override: true })
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
    staff: (staffRes.data ?? []) as unknown as StaffWithSkills[],
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
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id,week_start" })
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
    const { error } = await supabase.from("rota_assignments").upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
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
    .update({ date: newDate, is_manual_override: true })
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
    .update({ punctions_override: updated })
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
    .update({ status: "published", published_at: new Date().toISOString(), published_by: publisherName })
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
    .update({ status: "draft", published_at: null })
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
    .update({ shift_type: newShiftType, is_manual_override: true })
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
    .update({ tecnica_id: tecnicaId })
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
    .update({ function_label: label ?? "" })
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
      .update({ whole_team: wholeTeam })
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
      }, { onConflict: "rota_id,staff_id,date,function_label" })
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
    supabase.from("lab_config").select("punctions_by_day, country, region, public_holiday_mode, min_lab_coverage, min_weekend_lab_coverage, min_andrology_coverage, min_weekend_andrology, ratio_optimal, ratio_minimum, first_day_of_week, time_format, biopsy_conversion_rate, biopsy_day5_pct, biopsy_day6_pct").maybeSingle() as unknown as Promise<{ data: { punctions_by_day: Record<string, number> | null; country?: string | null; region?: string | null; public_holiday_mode?: string | null; min_lab_coverage?: number | null; min_weekend_lab_coverage?: number | null; min_andrology_coverage?: number | null; min_weekend_andrology?: number | null; ratio_optimal?: number | null; ratio_minimum?: number | null; first_day_of_week?: number | null; time_format?: string | null; biopsy_conversion_rate?: number | null; biopsy_day5_pct?: number | null; biopsy_day6_pct?: number | null } | null }>,
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
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id,week_start" })
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
    const { error } = await supabase.from("rota_assignments").upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
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
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id,week_start" })
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
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
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
      { organisation_id: orgId, week_start: weekStart, status: "draft" },
      { onConflict: "organisation_id,week_start" }
    )
    .select("id")
    .single() as unknown as { data: { id: string } | null; error: { message: string } | null }

  if (upsertErr) return { error: upsertErr.message }
  if (!rotaRow) return { error: "Error creating rota." }

  // Best-effort: set generation_type
  await supabase.from("rotas").update({ generation_type: "manual" }).eq("id", rotaRow.id)

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
    .insert({ organisation_id: orgId, name, assignments: templateAssignments })
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
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id, week_start" })
    .select("id")
    .single() as unknown as { data: { id: string } | null }
  if (!rota) return { error: "Error creating rota." }

  // Best-effort: set generation_type
  await supabase.from("rotas").update({ generation_type: strict ? "strict_template" : "flexible_template" }).eq("id", rota.id)

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
    const { error } = await supabase.from("rota_assignments").upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return { skipped: [...new Set(skipped)] }
}

export async function renameTemplate(id: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase.from("rota_templates").update({ name }).eq("id", id).eq("organisation_id", orgId)
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
