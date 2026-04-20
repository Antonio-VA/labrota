"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getCachedOrgId } from "@/lib/auth-cache"
import { ONE_DAY_MS, RECENT_ASSIGNMENTS_LOOKBACK_DAYS } from "@/lib/constants"
import { runRotaEngineV2 } from "@/lib/rota-engine-v2"
import { getWeekDates } from "@/lib/engine-helpers"
import { runTaskEngine } from "@/lib/task-engine"
import { logAuditEvent } from "@/lib/audit"
import { captureWeekSnapshot } from "@/lib/rota-snapshots"
import { getPublicHolidays } from "@/lib/rota-holidays"
import {
  acquireRotaGenerationLock,
  releaseRotaGenerationLock,
  ROTA_GENERATION_LOCK_ERROR,
} from "@/lib/rota-generation-lock"
import { toISODate } from "@/lib/format-date"
import type {
  StaffWithSkills,
  Leave,
  RotaAssignment,
  RotaRule,
  ShiftTypeDefinition,
  LabConfig,
  ShiftCoverageByDay,
} from "@/lib/types/database"

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
  const fourWeeksAgoStr = toISODate(fourWeeksAgo)

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
    .eq("id", orgId)
    .limit(1)
    .maybeSingle() as { data: { rota_display_mode?: string } | null }
  const rotaDisplayMode = orgRow?.rota_display_mode ?? "by_shift"

  // Upsert rota record
  const { data: rotaRow, error: rotaError } = await supabase
    .from("rotas")
    .upsert(
      { organisation_id: orgId, week_start: weekStart, status: "draft" },
      { onConflict: "organisation_id,week_start" }
    )
    .select("id")
    .single()

  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }

  const rotaId = (rotaRow as { id: string }).id

  if (!(await acquireRotaGenerationLock(supabase, rotaId))) {
    return { error: ROTA_GENERATION_LOCK_ERROR }
  }

  try {
  // Best-effort: set generation_type (column may not exist yet)
  await supabase.from("rotas").update({ generation_type: generationType }).eq("id", rotaId)

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
  const normalizedStaff = ((staffRes.data ?? []) as unknown as StaffWithSkills[]).map((s) => {
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
    const { days, taskAssignments: shiftEngineTaskAssignments, warnings } = runRotaEngineV2({
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
    .upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })

  if (insertError) return { error: insertError.message }

  // Best-effort: save engine warnings to rota record (column may not exist yet)
  // Filter out internal [engine] logs — only keep user-facing warnings
  const userWarnings = engineWarnings.filter((w) => !w.startsWith("[engine]") && !w.includes("[debug]"))
  // Always update (even to clear) so stale warnings from previous generation are removed
  await supabase.from("rotas").update({ engine_warnings: userWarnings.length > 0 ? userWarnings : null }).eq("id", rotaId)

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
  } finally {
    await releaseRotaGenerationLock(supabase, rotaId)
  }
}

// ── generateRotaWithAI ────────────────────────────────────────────────────────
// Pure AI rota generation using Claude. Serialises all org context into a prompt
// and lets the model reason about optimal staff placement.

export async function generateRotaWithAI(
  weekStart: string,
  preserveOverrides: boolean,
): Promise<{ error?: string; assignmentCount?: number; reasoning?: string }> {
  const { anthropic } = await import("@ai-sdk/anthropic")
  const { generateText, Output } = await import("ai")
  const { z } = await import("zod")

  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - RECENT_ASSIGNMENTS_LOOKBACK_DAYS)
  const fourWeeksAgoStr = toISODate(fourWeeksAgo)

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

  const staff = (staffRes.data ?? []) as unknown as StaffWithSkills[]
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
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id,week_start" })
    .select("id").single()
  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }
  const rotaId = (rotaRow as { id: string }).id

  if (!(await acquireRotaGenerationLock(supabase, rotaId))) {
    return { error: ROTA_GENERATION_LOCK_ERROR }
  }

  try {
  await supabase.from("rotas").update({ generation_type: "ai_reasoning" }).eq("id", rotaId)

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
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      output: Output.object({ schema: assignmentSchema }),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 16000,
    })

    const { reasoning, assignments: aiAssignments, warnings: aiWarnings } = result.output!

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
      .upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })

    if (insertError) return { error: insertError.message }

    // Save warnings + reasoning to rota
    const allWarnings = [...aiWarnings, `[ai-reasoning] ${reasoning}`]
    const { error: warnError } = await supabase.from("rotas").update({ engine_warnings: allWarnings }).eq("id", rotaId)
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
  } finally {
    await releaseRotaGenerationLock(supabase, rotaId)
  }
}

// ── generateRotaHybrid ────────────────────────────────────────────────────────
// ── Hybrid quota helpers ──────────────────────────────────────────────────────

export async function getHybridUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { used: 0, limit: 10, remaining: 10 }

  const today = toISODate()
  const tomorrow = toISODate(new Date(today + "T00:00:00Z").getTime() + ONE_DAY_MS)

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
  const { generateText, Output } = await import("ai")
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
  const fourWeeksAgoStr = toISODate(fourWeeksAgo)

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

  const allStaff = (staffRes.data ?? []) as unknown as StaffWithSkills[]
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
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id,week_start" })
    .select("id").single()
  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }
  const rotaId = (rotaRow as { id: string }).id

  if (!(await acquireRotaGenerationLock(supabase, rotaId))) {
    return { error: ROTA_GENERATION_LOCK_ERROR }
  }

  try {
  await supabase.from("rotas").update({ generation_type: "ai_hybrid" }).eq("id", rotaId)

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
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      output: Output.object({ schema: assignmentSchema }),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 16000,
    })

    const { assessment, assignments: aiAssignments, warnings: aiWarnings } = result.output!
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
      .upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })

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
    const { error: warnError } = await supabase.from("rotas").update({ engine_warnings: allWarnings }).eq("id", rotaId)
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
    await supabase.from("hybrid_generation_log").insert({ organisation_id: orgId })

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
        .upsert(engineAssignments, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    }

    // Save engine warnings
    const userWarnings = engineResult.warnings.filter((w) => !w.startsWith("[engine]") && !w.includes("[debug]"))
    await supabase.from("rotas").update({ engine_warnings: userWarnings.length > 0 ? userWarnings : null }).eq("id", rotaId)

    // Log usage for quota tracking (fallback still counts as a hybrid attempt)
    await supabase.from("hybrid_generation_log").insert({ organisation_id: orgId })

    revalidatePath("/")

    const msg = e instanceof Error ? e.message : "AI optimisation failed"
    return {
      assignmentCount: engineAssignments.length,
      reasoning: `⚠ Claude optimisation failed (${msg}). Showing engine v2 base rota instead.`,
    }
  }
  } finally {
    await releaseRotaGenerationLock(supabase, rotaId)
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
  const { generateText, Output } = await import("ai")
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
  const fourWeeksAgoStr = toISODate(fourWeeksAgo)

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

  const allStaff = (staffRes.data ?? []) as unknown as StaffWithSkills[]
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
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id,week_start" })
    .select("id").single()
  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }
  const rotaId = (rotaRow as { id: string }).id

  if (!(await acquireRotaGenerationLock(supabase, rotaId))) {
    return { error: ROTA_GENERATION_LOCK_ERROR }
  }

  try {
  await supabase.from("rotas").update({ generation_type: "ai_hybrid" }).eq("id", rotaId)

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
    const result = await generateText({
      model: anthropic("claude-sonnet-4-6"),
      output: Output.object({ schema: assignmentSchema }),
      system: systemPrompt,
      prompt: userPrompt,
      maxOutputTokens: 16000,
    })

    const { assessment, assignments: aiAssignments, whole_team_dates, warnings: aiWarnings } = result.output!

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
      .upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (insertError) return { error: insertError.message }

    const warningsStr = aiWarnings.length > 0 ? `\n\nRemaining issues:\n${aiWarnings.map((w) => `• ${w}`).join("\n")}` : ""
    const fullReasoning = `${assessment}${warningsStr}`
    await supabase.from("rotas").update({ engine_warnings: [...aiWarnings, `[ai-reasoning] ${fullReasoning}`] }).eq("id", rotaId)

    const { data: { user: auditUser } } = await supabase.auth.getUser()
    logAuditEvent({ orgId, userId: auditUser?.id, userEmail: auditUser?.email, action: "rota_generated", entityType: "rota", entityId: rotaId, metadata: { weekStart, method: "ai_hybrid_task", assignmentCount: toInsert.length, preserveOverrides } })
    await supabase.from("hybrid_generation_log").insert({ organisation_id: orgId })

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
        .upsert(engineAssignments, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    }
    const userWarnings = taskResult.warnings.filter((w) => !w.startsWith("[engine]") && !w.includes("[debug]"))
    await supabase.from("rotas").update({ engine_warnings: userWarnings.length > 0 ? userWarnings : null }).eq("id", rotaId)
    await supabase.from("hybrid_generation_log").insert({ organisation_id: orgId })
    revalidatePath("/")
    const msg = e instanceof Error ? e.message : "AI optimisation failed"
    return { assignmentCount: engineAssignments.length, reasoning: `⚠ Claude optimisation failed (${msg}). Showing task engine base rota instead.` }
  }
  } finally {
    await releaseRotaGenerationLock(supabase, rotaId)
  }
}
