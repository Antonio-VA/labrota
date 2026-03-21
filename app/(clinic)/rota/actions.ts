"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { runRotaEngine, getWeekDates } from "@/lib/rota-engine"
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
} from "@/lib/types/database"

// ── Shared types exported to client ──────────────────────────────────────────

export interface RotaDayWarning {
  category: "coverage" | "skill_gap" | "rule"
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
    is_opu: boolean
    function_label: string | null
    tecnica_id: string | null
    staff: { id: string; first_name: string; last_name: string; role: StaffRole }
  }[]
  skillGaps: SkillName[]
  warnings: RotaDayWarning[]
}

export type ShiftTimes = Record<string, { start: string; end: string }>

export interface RotaWeekData {
  weekStart: string
  rota: { id: string; status: RotaStatus; published_at: string | null; punctions_override: Record<string, number> } | null
  days: RotaDay[]
  punctionsDefault: Record<string, number>
  shiftTypes: ShiftTypeDefinition[]
  shiftTimes: ShiftTimes | null
  /** date → list of staff_ids on approved leave that day */
  onLeaveByDate: Record<string, string[]>
  /** date → holiday name for Spanish national holidays */
  publicHolidays: Record<string, string>
  tecnicas: Tecnica[]
}

// ── Spanish national public holidays ─────────────────────────────────────────

function easterSunday(year: number): Date {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(year, month - 1, day)
}

function getPublicHolidays(year: number): Record<string, string> {
  const easter = easterSunday(year)
  const goodFriday = new Date(easter)
  goodFriday.setDate(goodFriday.getDate() - 2)
  const fmt = (d: Date) => d.toISOString().split("T")[0]
  return {
    [`${year}-01-01`]: "Año Nuevo",
    [`${year}-01-06`]: "Reyes Magos",
    [fmt(goodFriday)]:  "Viernes Santo",
    [`${year}-05-01`]: "Día del Trabajo",
    [`${year}-08-15`]: "Asunción de la Virgen",
    [`${year}-10-12`]: "Día de la Hispanidad",
    [`${year}-11-01`]: "Todos los Santos",
    [`${year}-12-06`]: "Día de la Constitución",
    [`${year}-12-08`]: "Inmaculada Concepción",
    [`${year}-12-25`]: "Navidad",
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
}

function isWeekendDate(isoDate: string): boolean {
  const day = new Date(isoDate + "T12:00:00").getDay()
  return day === 0 || day === 6
}

// ── getRotaWeek ───────────────────────────────────────────────────────────────

const DOW_TO_KEY: Record<number, keyof import("@/lib/types/database").PunctionsByDay> = {
  1: "mon", 2: "tue", 3: "wed", 4: "thu", 5: "fri", 6: "sat", 0: "sun",
}

export async function getRotaWeek(weekStart: string): Promise<RotaWeekData> {
  const supabase = await createClient()
  const dates = getWeekDates(weekStart)

  // Fetch rota record, lab config, approved leaves, shift types, and técnicas in parallel.
  const [rotaResult, labConfigResult, leavesResult, shiftTypesRes, tecnicasRes] = await Promise.all([
    supabase
      .from("rotas")
      .select("*")
      .eq("week_start", weekStart)
      .maybeSingle() as unknown as Promise<{ data: { id: string; status: string; published_at: string | null; punctions_override?: Record<string, number> | null } | null }>,
    supabase.from("lab_config").select("*").maybeSingle(),
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date")
      .lte("start_date", dates[6])
      .gte("end_date", dates[0])
      .eq("status", "approved") as unknown as Promise<{ data: { staff_id: string; start_date: string; end_date: string }[] | null }>,
    supabase.from("shift_types").select("*").order("sort_order") as unknown as Promise<{ data: ShiftTypeDefinition[] | null }>,
    supabase.from("tecnicas").select("*").order("orden").order("created_at") as unknown as Promise<{ data: Tecnica[] | null }>,
  ])

  const rotaData  = rotaResult.data
  const labConfig = labConfigResult.data as import("@/lib/types/database").LabConfig | null
  const tecnicas  = (tecnicasRes.data ?? []) as Tecnica[]

  const rota = rotaData
    ? {
        id: rotaData.id,
        status: rotaData.status as RotaStatus,
        published_at: rotaData.published_at,
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
  for (const leave of leavesResult.data ?? []) {
    const s = new Date(leave.start_date + "T12:00:00")
    const e = new Date(leave.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = d.toISOString().split("T")[0]
      if (!onLeaveByDate[iso]) onLeaveByDate[iso] = []
      onLeaveByDate[iso].push(leave.staff_id)
    }
  }

  // Compute public holidays for every year spanned by this week
  const years = [...new Set(dates.map((d) => parseInt(d.slice(0, 4))))]
  const publicHolidays: Record<string, string> = Object.assign({}, ...years.map(getPublicHolidays))

  if (!rota) {
    return { weekStart, rota: null, days: dates.map((d) => dayMap[d]), punctionsDefault, shiftTypes: shiftTypesData, shiftTimes, onLeaveByDate, publicHolidays, tecnicas }
  }

  // Fetch assignments + all org staff in parallel so we can enrich assignments without
  // relying on a PostgREST join (which can silently return null after schema migrations).
  type RawAssignment = {
    id: string; staff_id: string; date: string; shift_type: string;
    is_manual_override: boolean; trainee_staff_id: string | null; notes: string | null; is_opu: boolean;
    function_label: string | null; tecnica_id: string | null
  }
  type AssignmentRow = RawAssignment & {
    staff: { id: string; first_name: string; last_name: string; role: string } | null
  }

  const [assignmentsRes, staffRes, skillsRes] = await Promise.all([
    // Try full column set; fallback handled below
    supabase
      .from("rota_assignments")
      .select("id, staff_id, date, shift_type, is_manual_override, trainee_staff_id, notes, is_opu, function_label, tecnica_id")
      .eq("rota_id", rota.id) as unknown as Promise<{ data: RawAssignment[] | null; error: { message: string } | null }>,
    supabase
      .from("staff")
      .select("id, first_name, last_name, role") as unknown as Promise<{ data: { id: string; first_name: string; last_name: string; role: string }[] | null }>,
    supabase
      .from("staff_skills")
      .select("staff_id, skill") as unknown as Promise<{ data: { staff_id: string; skill: string }[] | null }>,
  ])

  // Build a staff lookup map so we don't depend on a join
  const staffLookup: Record<string, { id: string; first_name: string; last_name: string; role: string }> = {}
  for (const s of staffRes.data ?? []) staffLookup[s.id] = s

  // If newer columns missing, retry with minimal select
  let rawAssignments: RawAssignment[] = []
  if (assignmentsRes.error) {
    const { data: baseData } = (await supabase
      .from("rota_assignments")
      .select("id, staff_id, date, shift_type, is_manual_override")
      .eq("rota_id", rota.id)) as unknown as { data: Omit<RawAssignment, "trainee_staff_id" | "notes" | "is_opu" | "function_label" | "tecnica_id">[] | null }
    rawAssignments = (baseData ?? []).map((a) => ({ ...a, trainee_staff_id: null, notes: null, is_opu: false, function_label: null, tecnica_id: null }))
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
    if (!staffSkillMap[ss.staff_id]) staffSkillMap[ss.staff_id] = []
    staffSkillMap[ss.staff_id].push(ss.skill as SkillName)
  }

  const allOrgSkills = [...new Set((skillsData ?? []).map((ss) => ss.skill as SkillName))]

  // Only include assignments whose shift_type exists in this org's shift_types table.
  // Assignments with stale codes (e.g. 'am'/'pm'/'full' from before the shift_types migration)
  // would otherwise make staff invisible: they'd be in assignedIds but match no shift row.
  const validShiftCodes = shiftTypesData.length > 0
    ? new Set(shiftTypesData.map((st) => st.code))
    : null  // null = no filtering (shift_types not configured yet)

  // Populate day assignments
  for (const a of assignmentsData ?? []) {
    const day = dayMap[a.date]
    if (!day) continue
    if (validShiftCodes && !validShiftCodes.has(a.shift_type)) continue
    const staff = a.staff as { id: string; first_name: string; last_name: string; role: string } | null
    if (!staff) continue
    day.assignments.push({
      id: a.id,
      staff_id: a.staff_id,
      shift_type: a.shift_type as ShiftType,
      is_manual_override: a.is_manual_override,
      trainee_staff_id: a.trainee_staff_id,
      notes: a.notes,
      is_opu: a.is_opu ?? false,
      function_label: a.function_label ?? null,
      tecnica_id: a.tecnica_id ?? null,
      staff: { id: staff.id, first_name: staff.first_name, last_name: staff.last_name, role: staff.role as StaffRole },
    })
  }

  // Compute skill gaps and coverage warnings per day
  for (const day of Object.values(dayMap)) {
    // Skill gaps
    const covered = new Set(day.assignments.flatMap((a) => staffSkillMap[a.staff_id] ?? []))
    day.skillGaps = allOrgSkills.filter((sk) => !covered.has(sk))

    if (day.skillGaps.length > 0) {
      day.warnings.push({ category: "skill_gap", message: day.skillGaps.join(", ") })
    }

    // Coverage warnings — compare assigned staff by role against minimums
    if (labConfig && day.assignments.length > 0) {
      const weekend  = day.isWeekend
      const labCount = day.assignments.filter((a) => a.staff.role === "lab").length
      const andCount = day.assignments.filter((a) => a.staff.role === "andrology").length

      const dow    = new Date(day.date + "T12:00:00").getDay()
      const dowKey = DOW_TO_KEY[dow]
      const dayCov = labConfig.coverage_by_day?.[dowKey]

      const labMin = dayCov?.lab ?? (weekend
        ? (labConfig.min_weekend_lab_coverage ?? labConfig.min_lab_coverage)
        : labConfig.min_lab_coverage)
      const andMin = dayCov?.andrology ?? (weekend
        ? labConfig.min_weekend_andrology
        : labConfig.min_andrology_coverage)

      if (labCount < labMin) {
        day.warnings.push({ category: "coverage", message: `Lab: ${labCount}/${labMin}` })
      }
      if (andCount < andMin) {
        day.warnings.push({ category: "coverage", message: `Andrología: ${andCount}/${andMin}` })
      }
    }
  }

  return { weekStart, rota, days: dates.map((d) => dayMap[d]), punctionsDefault, shiftTypes: shiftTypesData, shiftTimes, onLeaveByDate, publicHolidays, tecnicas }
}

// ── generateRota ──────────────────────────────────────────────────────────────

export async function generateRota(
  weekStart: string,
  preserveOverrides: boolean,
  generationType: import("@/lib/types/database").GenerationType = "ai_optimal"
): Promise<{ error?: string; assignmentCount?: number }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "No organisation found." }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0]

  // Fetch all required data in parallel
  const [staffRes, leavesRes, recentAssignmentsRes, labConfigRes, rulesRes, shiftTypesForEngine] = await Promise.all([
    supabase
      .from("staff")
      .select("*, staff_skills(*)")
      .neq("onboarding_status", "inactive"),
    supabase
      .from("leaves")
      .select("*")
      .lte("start_date", weekDates[6])
      .gte("end_date", weekDates[0])
      .eq("status", "approved"),
    supabase
      .from("rota_assignments")
      .select("staff_id, date")
      .gte("date", fourWeeksAgoStr)
      .lt("date", weekStart),
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("*").eq("enabled", true),
    supabase.from("shift_types").select("*").order("sort_order"),
  ])

  const labConfig = labConfigRes.data as import("@/lib/types/database").LabConfig | null
  if (!labConfig) return { error: "Lab configuration not found. Set it up in the Lab settings page." }

  if (staffRes.error) return { error: `Failed to load staff: ${staffRes.error.message}` }

  // Upsert rota record
  const { data: rotaRow, error: rotaError } = await supabase
    .from("rotas")
    .upsert(
      { organisation_id: orgId, week_start: weekStart, status: "draft", generation_type: generationType } as never,
      { onConflict: "organisation_id,week_start" }
    )
    .select("id")
    .single()

  if (rotaError || !rotaRow) return { error: rotaError?.message ?? "Failed to create rota." }

  const rotaId = (rotaRow as { id: string }).id

  // Determine which dates have manual overrides (to preserve)
  const overrideDates = new Set<string>()
  if (preserveOverrides) {
    const { data: overrides } = await supabase
      .from("rota_assignments")
      .select("date")
      .eq("rota_id", rotaId)
      .eq("is_manual_override", true) as { data: { date: string }[] | null }
    for (const o of overrides ?? []) overrideDates.add(o.date)
  }

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
  // Staff seeded with old 'am'/'pm'/'full' values (before the shift_types migration) would
  // otherwise get assignments saved with those stale codes, making them invisible in the grid.
  const shiftTypesData = (shiftTypesForEngine.data ?? []) as import("@/lib/types/database").ShiftTypeDefinition[]
  const validEngineCodes = new Set(shiftTypesData.map((st) => st.code))
  const normalizedStaff = ((staffRes.data ?? []) as StaffWithSkills[]).map((s) => {
    return validEngineCodes.size > 0 && s.preferred_shift && !validEngineCodes.has(s.preferred_shift)
      ? { ...s, preferred_shift: null }  // engine will fall back to default (T1 / admin_default_shift)
      : s
  })

  // Run engine
  const { days } = runRotaEngine({
    weekStart,
    staff: normalizedStaff,
    leaves: (leavesRes.data ?? []) as Leave[],
    recentAssignments: (recentAssignmentsRes.data ?? []) as RotaAssignment[],
    labConfig,
    shiftTypes: shiftTypesData,
    punctionsOverride,
    rules: (rulesRes.data ?? []) as RotaRule[],
  })

  // Insert new assignments (skip override dates)
  const toInsert = days
    .filter((day) => !overrideDates.has(day.date))
    .flatMap((day) =>
      day.assignments.map((a) => ({
        organisation_id: orgId,
        rota_id: rotaId,
        staff_id: a.staff_id,
        date: day.date,
        shift_type: a.shift_type,
        is_manual_override: false,
        is_opu: a.is_opu,
      }))
    )

  if (toInsert.length === 0) {
    const staffCount = (staffRes.data ?? []).length
    if (staffCount === 0) {
      return { error: "No active staff found. Make sure staff members are added and are not inactive." }
    }
    if (!labConfig.min_lab_coverage && !labConfig.min_andrology_coverage) {
      return { error: "Lab config has zero minimum coverage — set min_lab_coverage or min_andrology_coverage in Lab settings." }
    }
    // Check if any staff have a non-empty working pattern
    const staffWithPattern = (staffRes.data ?? []).filter(
      (s) => Array.isArray((s as { working_pattern?: unknown }).working_pattern) &&
             ((s as { working_pattern: unknown[] }).working_pattern).length > 0
    )
    if (staffWithPattern.length === 0) {
      return { error: `All ${staffCount} staff members have no working days set. Go to Team and set the "Disponibilidad" for each person.` }
    }
    return { error: `Engine assigned 0 staff for this week (${staffCount} staff loaded). Check that working patterns include weekdays in this week and no one is on leave all week.` }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("rota_assignments")
      .insert(toInsert as never)

    if (insertError) {
      // is_opu column may not exist if migration 20260321000001_schema_updates.sql
      // hasn't been run yet — retry without it so generation still works.
      if (insertError.message.includes("is_opu")) {
        const compat = toInsert.map((row) => ({
          organisation_id:    row.organisation_id,
          rota_id:            row.rota_id,
          staff_id:           row.staff_id,
          date:               row.date,
          shift_type:         row.shift_type,
          is_manual_override: row.is_manual_override,
        }))
        const { error: insertError2 } = await supabase
          .from("rota_assignments")
          .insert(compat as never)
        if (insertError2) return { error: insertError2.message }
      } else {
        return { error: insertError.message }
      }
    }
  }

  revalidatePath("/")
  return { assignmentCount: toInsert.length }
}

// ── getActiveStaff ────────────────────────────────────────────────────────────

export async function getActiveStaff(): Promise<StaffWithSkills[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("staff")
    .select("*, staff_skills(*)")
    .neq("onboarding_status", "inactive")
    .order("first_name")
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
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
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

  if (params.assignmentId) {
    // Update existing
    const { error } = await supabase
      .from("rota_assignments")
      .update({
        staff_id: params.staffId,
        shift_type: params.shiftType,
        notes: params.notes ?? null,
        trainee_staff_id: params.traineeStaffId ?? null,
        is_opu: params.isOpu ?? false,
        is_manual_override: true,
      } as never)
      .eq("id", params.assignmentId)
    if (error) return { error: error.message }
    revalidatePath("/")
    return { id: params.assignmentId }
  } else {
    // Insert new
    const { data: row, error } = await supabase
      .from("rota_assignments")
      .insert({
        organisation_id: orgId,
        rota_id: rotaId,
        staff_id: params.staffId,
        date: params.date,
        shift_type: params.shiftType,
        is_manual_override: true,
        notes: params.notes ?? null,
        trainee_staff_id: params.traineeStaffId ?? null,
        is_opu: params.isOpu ?? false,
      } as never)
      .select("id")
      .single()
    if (error) return { error: error.message }
    revalidatePath("/")
    return { id: (row as { id: string }).id }
  }
}

// ── deleteAssignment ──────────────────────────────────────────────────────────

export async function deleteAssignment(assignmentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_assignments")
    .delete()
    .eq("id", assignmentId)
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
  const { error } = await supabase
    .from("rota_assignments")
    .update({ shift_type: shiftType, is_manual_override: true } as never)
    .eq("id", assignmentId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── setDayOpu ─────────────────────────────────────────────────────────────────

export async function setDayOpu(
  rotaId: string,
  date: string,
  newOpuAssignmentId: string,   // empty string = clear all
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error: clearError } = await supabase
    .from("rota_assignments")
    .update({ is_opu: false } as never)
    .eq("rota_id", rotaId)
    .eq("date", date)
  if (clearError) return { error: clearError.message }
  if (newOpuAssignmentId) {
    const { error: setError } = await supabase
      .from("rota_assignments")
      .update({ is_opu: true } as never)
      .eq("id", newOpuAssignmentId)
    if (setError) return { error: setError.message }
  }
  revalidatePath("/")
  return {}
}

// ── deleteAllDayAssignments ───────────────────────────────────────────────────

export async function deleteAllDayAssignments(
  rotaId: string,
  date: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_assignments")
    .delete()
    .eq("rota_id", rotaId)
    .eq("date", date)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── moveAssignment ────────────────────────────────────────────────────────────

export async function moveAssignment(
  assignmentId: string,
  newDate: string,
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_assignments")
    .update({ date: newDate, is_manual_override: true } as never)
    .eq("id", assignmentId)
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

  // Fetch existing override map
  const { data: rotaData } = await supabase
    .from("rotas")
    .select("punctions_override")
    .eq("id", rotaId)
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
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── publishRota ───────────────────────────────────────────────────────────────

export async function publishRota(rotaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rotas")
    .update({ status: "published", published_at: new Date().toISOString() } as never)
    .eq("id", rotaId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── unlockRota ────────────────────────────────────────────────────────────────

export async function unlockRota(rotaId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rotas")
    .update({ status: "draft", published_at: null } as never)
    .eq("id", rotaId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── moveAssignmentShift ───────────────────────────────────────────────────────

export async function moveAssignmentShift(assignmentId: string, newShiftType: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_assignments")
    .update({ shift_type: newShiftType, is_manual_override: true } as never)
    .eq("id", assignmentId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── removeAssignment ──────────────────────────────────────────────────────────

export async function removeAssignment(assignmentId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_assignments")
    .delete()
    .eq("id", assignmentId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── setTecnica ────────────────────────────────────────────────────────────────

export async function setTecnica(assignmentId: string, tecnicaId: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_assignments")
    .update({ tecnica_id: tecnicaId } as never)
    .eq("id", assignmentId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── setFunctionLabel ──────────────────────────────────────────────────────────

export async function setFunctionLabel(assignmentId: string, label: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_assignments")
    .update({ function_label: label } as never)
    .eq("id", assignmentId)
  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}

// ── getRotaMonthSummary ───────────────────────────────────────────────────────

export interface MonthDaySummary {
  date: string
  staffCount: number
  hasSkillGaps: boolean
  isWeekend: boolean
  isCurrentMonth: boolean
}

export interface RotaMonthSummary {
  monthStart: string   // "YYYY-MM-01"
  days: MonthDaySummary[]
}

export async function getRotaMonthSummary(monthStart: string): Promise<RotaMonthSummary> {
  const supabase = await createClient()

  // Build grid: Monday before 1st through Sunday after last day of month
  const first = new Date(monthStart + "T12:00:00")
  const last  = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)

  const gridStart = new Date(first)
  const startDow  = gridStart.getDay()
  gridStart.setDate(gridStart.getDate() - (startDow === 0 ? 6 : startDow - 1))

  const gridEnd = new Date(last)
  const endDow  = gridEnd.getDay()
  if (endDow !== 0) gridEnd.setDate(gridEnd.getDate() + (7 - endDow))

  const gridDates: string[] = []
  for (let d = new Date(gridStart); d <= gridEnd; d.setDate(d.getDate() + 1)) {
    gridDates.push(d.toISOString().split("T")[0])
  }

  const [assignmentsRes, skillsRes] = await Promise.all([
    supabase
      .from("rota_assignments")
      .select("date, staff_id")
      .gte("date", gridDates[0])
      .lte("date", gridDates[gridDates.length - 1]) as unknown as Promise<{ data: { date: string; staff_id: string }[] | null }>,
    supabase
      .from("staff_skills")
      .select("staff_id, skill") as unknown as Promise<{ data: { staff_id: string; skill: string }[] | null }>,
  ])

  const byDate: Record<string, string[]> = {}
  for (const a of assignmentsRes.data ?? []) {
    if (!byDate[a.date]) byDate[a.date] = []
    byDate[a.date].push(a.staff_id)
  }

  const staffSkillMap: Record<string, string[]> = {}
  for (const ss of skillsRes.data ?? []) {
    if (!staffSkillMap[ss.staff_id]) staffSkillMap[ss.staff_id] = []
    staffSkillMap[ss.staff_id].push(ss.skill)
  }
  const allOrgSkills = [...new Set((skillsRes.data ?? []).map((ss) => ss.skill))]
  const currentMonthPrefix = monthStart.slice(0, 7)

  const days: MonthDaySummary[] = gridDates.map((date) => {
    const staffIds = byDate[date] ?? []
    const covered  = new Set(staffIds.flatMap((id) => staffSkillMap[id] ?? []))
    const hasSkillGaps = staffIds.length > 0 && allOrgSkills.some((sk) => !covered.has(sk))
    const dow = new Date(date + "T12:00:00").getDay()
    return {
      date,
      staffCount: staffIds.length,
      hasSkillGaps,
      isWeekend: dow === 0 || dow === 6,
      isCurrentMonth: date.startsWith(currentMonthPrefix),
    }
  })

  return { monthStart, days }
}

// ── getStaffProfile ───────────────────────────────────────────────────────────

export interface StaffProfileData {
  /** Last 20 assignments, newest first */
  recentAssignments: { date: string; shift_type: string; is_opu: boolean; function_label: string | null }[]
  /** Future approved leaves */
  upcomingLeaves: { start_date: string; end_date: string; type: string }[]
}

export async function getStaffProfile(staffId: string): Promise<StaffProfileData> {
  const supabase = await createClient()
  const today    = new Date().toISOString().split("T")[0]

  // Go back 8 weeks to capture enough history for "last 10 shifts"
  const eightWeeksAgo = new Date()
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
  const since = eightWeeksAgo.toISOString().split("T")[0]

  const [assignmentsRes, leavesRes] = await Promise.all([
    supabase
      .from("rota_assignments")
      .select("date, shift_type, is_opu, function_label")
      .eq("staff_id", staffId)
      .gte("date", since)
      .lte("date", today)
      .order("date", { ascending: false })
      .limit(20) as unknown as Promise<{ data: { date: string; shift_type: string; is_opu: boolean; function_label: string | null }[] | null }>,
    supabase
      .from("leaves")
      .select("start_date, end_date, type")
      .eq("staff_id", staffId)
      .eq("status", "approved")
      .gte("end_date", today)
      .order("start_date", { ascending: true })
      .limit(5) as unknown as Promise<{ data: { start_date: string; end_date: string; type: string }[] | null }>,
  ])

  return {
    recentAssignments: assignmentsRes.data ?? [],
    upcomingLeaves: leavesRes.data ?? [],
  }
}

export async function clearWeek(weekStart: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "No organisation found." }

  const { data: rotaRow } = await supabase
    .from("rotas")
    .upsert(
      { organisation_id: orgId, week_start: weekStart, status: "draft", generation_type: "manual" } as never,
      { onConflict: "organisation_id,week_start" }
    )
    .select("id")
    .single() as unknown as { data: { id: string } | null }
  if (!rotaRow) return { error: "Error creando la guardia." }

  await supabase.from("rota_assignments").delete().eq("rota_id", rotaRow.id)
  revalidatePath("/")
  return {}
}

// ── Template actions ──────────────────────────────────────────────────────────

import type { RotaTemplate, RotaTemplateAssignment } from "@/lib/types/database"

export async function saveAsTemplate(weekStart: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "No organisation found." }

  const dates = getWeekDates(weekStart)
  const { data: assignments } = await supabase
    .from("rota_assignments")
    .select("staff_id, date, shift_type, is_opu, function_label")
    .gte("date", dates[0])
    .lte("date", dates[6]) as unknown as { data: { staff_id: string; date: string; shift_type: string; is_opu: boolean; function_label: string | null }[] | null }

  if (!assignments || assignments.length === 0) return { error: "No hay turnos para guardar." }

  const templateAssignments: RotaTemplateAssignment[] = assignments.map((a) => {
    const dayIndex = dates.indexOf(a.date)
    return {
      staff_id: a.staff_id,
      day_offset: dayIndex >= 0 ? dayIndex : 0,
      shift_type: a.shift_type,
      is_opu: a.is_opu ?? false,
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
    .select("*")
    .order("created_at", { ascending: false }) as unknown as { data: RotaTemplate[] | null }
  return data ?? []
}

export async function applyTemplate(templateId: string, weekStart: string, strict = true): Promise<{ error?: string; skipped?: string[] }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "No organisation found." }

  // Fetch template
  const { data: template } = await supabase
    .from("rota_templates")
    .select("*")
    .eq("id", templateId)
    .single() as unknown as { data: RotaTemplate | null }
  if (!template) return { error: "Plantilla no encontrada." }

  const dates = getWeekDates(weekStart)

  // Upsert rota record
  const { data: rota } = await supabase
    .from("rotas")
    .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft", generation_type: strict ? "strict_template" : "flexible_template" } as never, { onConflict: "organisation_id, week_start" })
    .select("id")
    .single() as unknown as { data: { id: string } | null }
  if (!rota) return { error: "Error creando la guardia." }

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
  const toInsert: { organisation_id: string; rota_id: string; staff_id: string; date: string; shift_type: string; is_opu: boolean; is_manual_override: boolean; function_label: string | null }[] = []

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
      is_opu: a.is_opu,
      is_manual_override: false,
      function_label: a.function_label,
    })
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").insert(toInsert as never)
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return { skipped: [...new Set(skipped)] }
}

export async function renameTemplate(id: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("rota_templates").update({ name } as never).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("rota_templates").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}
