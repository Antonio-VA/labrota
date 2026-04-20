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

