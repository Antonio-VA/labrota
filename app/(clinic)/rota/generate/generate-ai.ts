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

    revalidatePath("/schedule")
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

