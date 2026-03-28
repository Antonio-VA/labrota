"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { runRotaEngine, getWeekDates } from "@/lib/rota-engine"
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
} from "@/lib/types/database"

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
  days: RotaDay[]
  punctionsDefault: Record<string, number>
  shiftTypes: ShiftTypeDefinition[]
  shiftTimes: ShiftTimes | null
  /** date → list of staff_ids on approved leave that day */
  onLeaveByDate: Record<string, string[]>
  /** date → staff_id → leave type */
  onLeaveTypeByDate: Record<string, Record<string, string>>
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
  taskConflictThreshold: number
  enableTaskInShift: boolean
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

function getPublicHolidays(year: number, country = "ES"): Record<string, string> {
  const easter = easterSunday(year)
  const goodFriday = new Date(easter); goodFriday.setDate(goodFriday.getDate() - 2)
  const easterMonday = new Date(easter); easterMonday.setDate(easter.getDate() + 1)
  const fmt = (d: Date) => d.toISOString().split("T")[0]

  const HOLIDAYS: Record<string, Record<string, string>> = {
    ES: {
      [`${year}-01-01`]: "Año Nuevo",
      [`${year}-01-06`]: "Reyes Magos",
      [fmt(goodFriday)]: "Viernes Santo",
      [`${year}-05-01`]: "Día del Trabajo",
      [`${year}-08-15`]: "Asunción de la Virgen",
      [`${year}-10-12`]: "Día de la Hispanidad",
      [`${year}-11-01`]: "Todos los Santos",
      [`${year}-12-06`]: "Día de la Constitución",
      [`${year}-12-08`]: "Inmaculada Concepción",
      [`${year}-12-25`]: "Navidad",
    },
    AE: {
      [`${year}-01-01`]: "New Year's Day",
      [`${year}-12-01`]: "Commemoration Day",
      [`${year}-12-02`]: "National Day",
      [`${year}-12-03`]: "National Day Holiday",
    },
    GB: {
      [`${year}-01-01`]: "New Year's Day",
      [fmt(goodFriday)]: "Good Friday",
      [fmt(easterMonday)]: "Easter Monday",
      [`${year}-05-05`]: "Early May Bank Holiday",
      [`${year}-05-26`]: "Spring Bank Holiday",
      [`${year}-08-25`]: "Summer Bank Holiday",
      [`${year}-12-25`]: "Christmas Day",
      [`${year}-12-26`]: "Boxing Day",
    },
    US: {
      [`${year}-01-01`]: "New Year's Day",
      [`${year}-07-04`]: "Independence Day",
      [`${year}-11-11`]: "Veterans Day",
      [`${year}-12-25`]: "Christmas Day",
    },
    IN: {
      [`${year}-01-26`]: "Republic Day",
      [`${year}-08-15`]: "Independence Day",
      [`${year}-10-02`]: "Gandhi Jayanti",
      [`${year}-12-25`]: "Christmas",
    },
    PT: {
      [`${year}-01-01`]: "Ano Novo",
      [fmt(goodFriday)]: "Sexta-feira Santa",
      [`${year}-04-25`]: "Dia da Liberdade",
      [`${year}-05-01`]: "Dia do Trabalhador",
      [`${year}-06-10`]: "Dia de Portugal",
      [`${year}-08-15`]: "Assunção de Nossa Senhora",
      [`${year}-10-05`]: "Implantação da República",
      [`${year}-11-01`]: "Todos os Santos",
      [`${year}-12-01`]: "Restauração da Independência",
      [`${year}-12-08`]: "Imaculada Conceição",
      [`${year}-12-25`]: "Natal",
    },
  }

  return HOLIDAYS[country] ?? HOLIDAYS["ES"] ?? {}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getOrgId(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
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
  const [rotaResult, labConfigResult, leavesResult, shiftTypesRes, tecnicasRes, departmentsRes] = await Promise.all([
    supabase
      .from("rotas")
      .select("*")
      .eq("week_start", weekStart)
      .maybeSingle() as unknown as Promise<{ data: { id: string; status: string; published_at: string | null; punctions_override?: Record<string, number> | null } | null }>,
    supabase.from("lab_config").select("*").maybeSingle(),
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date, type")
      .lte("start_date", dates[6])
      .gte("end_date", dates[0])
      .eq("status", "approved") as unknown as Promise<{ data: { staff_id: string; start_date: string; end_date: string; type: string }[] | null }>,
    supabase.from("shift_types").select("*").order("sort_order") as unknown as Promise<{ data: ShiftTypeDefinition[] | null }>,
    supabase.from("tecnicas").select("*").order("orden").order("created_at") as unknown as Promise<{ data: Tecnica[] | null }>,
    supabase.from("departments").select("*").order("sort_order") as unknown as Promise<{ data: import("@/lib/types/database").Department[] | null }>,
  ])

  const rotaData  = rotaResult.data
  const labConfig = labConfigResult.data as import("@/lib/types/database").LabConfig | null
  const tecnicas  = (tecnicasRes.data ?? []) as Tecnica[]

  // Fetch org display mode
  const { data: { user: authUser } } = await supabase.auth.getUser()
  let orgDisplayMode = "by_shift"
  if (authUser) {
    const { data: prof } = await supabase.from("profiles").select("organisation_id").eq("id", authUser.id).single() as { data: { organisation_id: string | null } | null }
    if (prof?.organisation_id) {
      const { data: orgData } = await supabase.from("organisations").select("rota_display_mode").eq("id", prof.organisation_id).single() as { data: { rota_display_mode?: string } | null }
      orgDisplayMode = orgData?.rota_display_mode ?? "by_shift"
    }
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
  const publicHolidays: Record<string, string> = Object.assign({}, ...years.map((y) => getPublicHolidays(y, orgCountry)))

  if (!rota) {
    return { weekStart, rota: null, days: dates.map((d) => dayMap[d]), punctionsDefault, shiftTypes: shiftTypesData, shiftTimes, onLeaveByDate, onLeaveTypeByDate, publicHolidays, tecnicas, departments: departmentsRes.data ?? [], ratioOptimal: labConfig?.ratio_optimal ?? 1.0, ratioMinimum: labConfig?.ratio_minimum ?? 0.75, firstDayOfWeek: labConfig?.first_day_of_week ?? 0, timeFormat: labConfig?.time_format ?? "24h", biopsyConversionRate: labConfig?.biopsy_conversion_rate ?? 0.5, biopsyDay5Pct: labConfig?.biopsy_day5_pct ?? 0.5, biopsyDay6Pct: labConfig?.biopsy_day6_pct ?? 0.5, rotaDisplayMode: orgDisplayMode, taskConflictThreshold: labConfig?.task_conflict_threshold ?? 3, enableTaskInShift: labConfig?.enable_task_in_shift ?? false }
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

  const [assignmentsRes, staffRes, skillsRes] = await Promise.all([
    // Try full column set; fallback handled below
    supabase
      .from("rota_assignments")
      .select("id, staff_id, date, shift_type, is_manual_override, trainee_staff_id, notes, function_label, tecnica_id, whole_team")
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
    if (!staffSkillMap[ss.staff_id]) staffSkillMap[ss.staff_id] = []
    staffSkillMap[ss.staff_id].push(ss.skill as SkillName)
  }

  const allOrgSkills = [...new Set((skillsData ?? []).map((ss) => ss.skill as SkillName))]

  // Only include assignments whose shift_type exists in this org's shift_types table.
  // Assignments with stale codes (e.g. 'am'/'pm'/'full' from before the shift_types migration)
  // would otherwise make staff invisible: they'd be in assignedIds but match no shift row.
  // Skip this filter for by_task orgs — shift_type is irrelevant there.
  const validShiftCodes = (orgDisplayMode === "by_task" || shiftTypesData.length === 0)
    ? null  // null = no filtering
    : new Set(shiftTypesData.map((st) => st.code))

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
      function_label: a.function_label ?? null,
      tecnica_id: a.tecnica_id ?? null,
      whole_team: (a as unknown as { whole_team?: boolean }).whole_team ?? false,
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

    // Technique-shift gap warnings (by_shift only)
    // Skip if ALL of a technique's typical_shifts are inactive on this day
    const dayCodeForWarning = ["sun","mon","tue","wed","thu","fri","sat"][new Date(day.date + "T12:00:00").getDay()] as string
    const activeDayShifts = new Set(
      shiftTypesData.filter((st) => st.active !== false && (!st.active_days || st.active_days.length === 0 || (st.active_days as string[]).includes(dayCodeForWarning)))
        .map((st) => st.code)
    )
    if (orgDisplayMode === "by_shift" && tecnicas.length > 0 && day.assignments.length > 0) {
      for (const tec of tecnicas) {
        if (!tec.typical_shifts || tec.typical_shifts.length === 0) continue
        // Skip if none of this technique's shifts are active today
        if (!tec.typical_shifts.some((s: string) => activeDayShifts.has(s))) continue
        for (const shiftCode of tec.typical_shifts) {
          if (!activeDayShifts.has(shiftCode)) continue
          const staffInShift = day.assignments.filter((a) => a.shift_type === shiftCode)
          const hasCoverage = staffInShift.some((a) => {
            const skills = staffSkillMap[a.staff_id] ?? []
            return skills.includes(tec.codigo as SkillName)
          })
          if (!hasCoverage) {
            day.warnings.push({
              category: "technique_shift_gap",
              message: `${shiftCode}: sin personal cualificado para ${tec.nombre_es ?? tec.codigo}`,
            })
          }
        }
      }
    }
  }

  return { weekStart, rota, days: dates.map((d) => dayMap[d]), punctionsDefault, shiftTypes: shiftTypesData, shiftTimes, onLeaveByDate, onLeaveTypeByDate, publicHolidays, tecnicas, departments: departmentsRes.data ?? [], ratioOptimal: labConfig?.ratio_optimal ?? 1.0, ratioMinimum: labConfig?.ratio_minimum ?? 0.75, firstDayOfWeek: labConfig?.first_day_of_week ?? 0, timeFormat: labConfig?.time_format ?? "24h", biopsyConversionRate: labConfig?.biopsy_conversion_rate ?? 0.5, biopsyDay5Pct: labConfig?.biopsy_day5_pct ?? 0.5, biopsyDay6Pct: labConfig?.biopsy_day6_pct ?? 0.5, rotaDisplayMode: orgDisplayMode, taskConflictThreshold: labConfig?.task_conflict_threshold ?? 3, enableTaskInShift: labConfig?.enable_task_in_shift ?? false }
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
  const [staffRes, leavesRes, recentAssignmentsRes, labConfigRes, rulesRes, shiftTypesForEngine, tecnicasForEngine] = await Promise.all([
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
    supabase.from("tecnicas").select("codigo, typical_shifts").eq("activa", true) as unknown as Promise<{ data: { codigo: string; typical_shifts: string[] }[] | null }>,
  ])

  const labConfig = labConfigRes.data as import("@/lib/types/database").LabConfig | null
  if (!labConfig) return { error: "Lab configuration not found. Set it up in the Lab settings page." }

  if (staffRes.error) return { error: `Failed to load staff: ${staffRes.error.message}` }

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
  await supabase.from("rotas").update({ generation_type: generationType } as never).eq("id", rotaId).then(() => {})

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
  const { days, warnings: engineWarnings } = runRotaEngine({
    weekStart,
    staff: normalizedStaff,
    leaves: (leavesRes.data ?? []) as Leave[],
    recentAssignments: (recentAssignmentsRes.data ?? []) as RotaAssignment[],
    labConfig,
    shiftTypes: shiftTypesData,
    punctionsOverride,
    rules: (rulesRes.data ?? []) as RotaRule[],
    tecnicas: (tecnicasForEngine.data ?? []).map((t) => ({ codigo: t.codigo, typical_shifts: t.typical_shifts ?? [] })),
    shiftRotation: (labConfig.shift_rotation as "stable" | "weekly" | "daily") ?? "stable",
  })

  // Log engine output for debugging
  if (engineWarnings.length > 0) {
    console.log("[rota-engine] Warnings:", engineWarnings)
  }
  for (const day of days) {
    const byRole: Record<string, number> = {}
    for (const a of day.assignments) {
      const s = normalizedStaff.find((st) => st.id === a.staff_id)
      byRole[s?.role ?? "?"] = (byRole[s?.role ?? "?"] ?? 0) + 1
    }
    console.log(`[rota-engine] ${day.date}: ${day.assignments.length} total`, byRole)
  }
  // Per-staff summary: total assignments this week
  const staffCounts: Record<string, { name: string; count: number; budget: number }> = {}
  for (const day of days) {
    for (const a of day.assignments) {
      const s = normalizedStaff.find((st) => st.id === a.staff_id)
      if (!s) continue
      if (!staffCounts[s.id]) staffCounts[s.id] = { name: `${s.first_name} ${s.last_name}`, count: 0, budget: s.days_per_week ?? 5 }
      staffCounts[s.id].count++
    }
  }
  console.log("[rota-engine] Staff totals:", Object.values(staffCounts).map((s) => `${s.name}: ${s.count}/${s.budget}`).join(", "))

  // Insert new assignments (skip individual staff+date that have manual overrides)
  const toInsert = days.flatMap((day) =>
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

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("rota_assignments")
      .upsert(toInsert as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })

    if (insertError) return { error: insertError.message }
  }

  // Audit log
  const { data: { user: auditUser } } = await supabase.auth.getUser()
  logAuditEvent({
    orgId,
    userId: auditUser?.id,
    userEmail: auditUser?.email,
    action: "rota_generated",
    entityType: "rota",
    entityId: rotaId,
    metadata: { weekStart, method: generationType, assignmentCount: toInsert.length, preserveOverrides },
  })

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
  functionLabel?: string | null
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
  // Snapshot before deletion
  const { data: asg } = await supabase.from("rota_assignments").select("rota_id, date, rota:rota_id(week_start)").eq("id", assignmentId).maybeSingle() as { data: { rota_id: string; date: string; rota: { week_start: string } | null } | null }
  if (asg?.rota) captureSnapshot(asg.rota_id, asg.date, asg.rota.week_start)

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

// ── regenerateDay ────────────────────────────────────────────────────────────

export async function regenerateDay(
  weekStart: string,
  date: string,
): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "No organisation found." }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)

  // Fetch data (same as full generate)
  const [staffRes, leavesRes, recentRes, configRes, rulesRes, shiftRes, tecRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").neq("onboarding_status", "inactive"),
    supabase.from("leaves").select("*").lte("start_date", weekDates[6]).gte("end_date", weekDates[0]).eq("status", "approved"),
    supabase.from("rota_assignments").select("staff_id, date").gte("date", fourWeeksAgo.toISOString().split("T")[0]).lte("date", weekDates[6]),
    supabase.from("lab_config").select("*").single(),
    supabase.from("rota_rules").select("*").eq("enabled", true),
    supabase.from("shift_types").select("*").order("sort_order"),
    supabase.from("tecnicas").select("codigo, typical_shifts").eq("activa", true),
  ])

  const labConfig = configRes.data as unknown as LabConfig | null
  if (!labConfig) return { error: "No lab config found." }

  // Run engine for the full week (needed for budget tracking)
  const { days } = runRotaEngine({
    weekStart,
    staff: (staffRes.data ?? []) as StaffWithSkills[],
    leaves: (leavesRes.data ?? []) as Leave[],
    recentAssignments: (recentRes.data ?? []) as RotaAssignment[],
    labConfig,
    shiftTypes: (shiftRes.data ?? []) as ShiftTypeDefinition[],
    rules: (rulesRes.data ?? []) as RotaRule[],
    tecnicas: (tecRes.data ?? []).map((t: { codigo: string; typical_shifts: string[] }) => ({ codigo: t.codigo, typical_shifts: t.typical_shifts ?? [] })),
    shiftRotation: (labConfig.shift_rotation as "stable" | "weekly" | "daily") ?? "stable",
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
  const { data: { user } } = await supabase.auth.getUser()
  const publisherName = (user?.user_metadata?.full_name as string) ?? user?.email ?? "—"
  const { error } = await supabase
    .from("rotas")
    .update({ status: "published", published_at: new Date().toISOString(), published_by: publisherName } as never)
    .eq("id", rotaId)
  if (error) return { error: error.message }
  const orgId = await getOrgId(supabase)
  if (orgId) logAuditEvent({ orgId, userId: user?.id, userEmail: user?.email, action: "rota_published", entityType: "rota", entityId: rotaId })
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
  // Snapshot before removal
  const { data: asg } = await supabase.from("rota_assignments").select("rota_id, date, rota:rota_id(week_start)").eq("id", assignmentId).maybeSingle() as { data: { rota_id: string; date: string; rota: { week_start: string } | null } | null }
  if (asg?.rota) captureSnapshot(asg.rota_id, asg.date, asg.rota.week_start)

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
    .update({ function_label: label ?? "" } as never)
    .eq("id", assignmentId)
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
  const orgId = await getOrgId(supabase)
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

  const [assignmentsRes, skillsRes, leavesRes, labConfigRes, rotasRes, staffRes] = await Promise.all([
    supabase
      .from("rota_assignments")
      .select("date, staff_id, staff:staff_id(first_name, last_name, role)")
      .gte("date", gridDates[0])
      .lte("date", gridDates[gridDates.length - 1]) as unknown as Promise<{ data: { date: string; staff_id: string; staff: { first_name: string; last_name: string; role: string } | null }[] | null }>,
    supabase
      .from("staff_skills")
      .select("staff_id, skill") as unknown as Promise<{ data: { staff_id: string; skill: string }[] | null }>,
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date")
      .lte("start_date", gridDates[gridDates.length - 1])
      .gte("end_date", gridDates[0])
      .eq("status", "approved") as unknown as Promise<{ data: { staff_id: string; start_date: string; end_date: string }[] | null }>,
    supabase.from("lab_config").select("punctions_by_day").single() as unknown as Promise<{ data: { punctions_by_day: Record<string, number> | null } | null }>,
    supabase
      .from("rotas")
      .select("week_start, status")
      .gte("week_start", gridDates[0])
      .lte("week_start", gridDates[gridDates.length - 1]) as unknown as Promise<{ data: { week_start: string; status: string }[] | null }>,
    supabase
      .from("staff")
      .select("id, first_name, last_name, role, days_per_week")
      .neq("onboarding_status", "inactive") as unknown as Promise<{ data: { id: string; first_name: string; last_name: string; role: string; days_per_week: number }[] | null }>,
  ])

  // Assignment data
  const byDate: Record<string, { staff_id: string; role: string; first_name: string; last_name: string }[]> = {}
  for (const a of assignmentsRes.data ?? []) {
    if (!byDate[a.date]) byDate[a.date] = []
    byDate[a.date].push({ staff_id: a.staff_id, role: a.staff?.role ?? "lab", first_name: a.staff?.first_name ?? "", last_name: a.staff?.last_name ?? "" })
  }

  // Staff totals for month taskbar
  const staffTotals: RotaMonthSummary["staffTotals"] = {}
  const staffLookup = Object.fromEntries((staffRes.data ?? []).map((s) => [s.id, s]))
  const currentMonthPrefix = monthStart.slice(0, 7)
  for (const a of assignmentsRes.data ?? []) {
    if (!a.date.startsWith(currentMonthPrefix)) continue
    if (!staffTotals[a.staff_id]) {
      const s = staffLookup[a.staff_id] ?? a.staff
      staffTotals[a.staff_id] = {
        first: s?.first_name ?? "?", last: s?.last_name ?? "?",
        role: s?.role ?? "lab", count: 0,
        daysPerWeek: staffLookup[a.staff_id]?.days_per_week ?? 5,
      }
    }
    staffTotals[a.staff_id].count++
  }

  // Skills
  const staffSkillMap: Record<string, string[]> = {}
  for (const ss of skillsRes.data ?? []) {
    if (!staffSkillMap[ss.staff_id]) staffSkillMap[ss.staff_id] = []
    staffSkillMap[ss.staff_id].push(ss.skill)
  }
  const allOrgSkills = [...new Set((skillsRes.data ?? []).map((ss) => ss.skill))]

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
  const holidays: Record<string, string> = Object.assign({}, ...years.map((y) => getPublicHolidays(y, monthCountry)))

  // Week statuses
  const rotaMap = Object.fromEntries((rotasRes.data ?? []).map((r) => [r.week_start, r.status]))
  const weekStarts: string[] = []
  for (let i = 0; i < gridDates.length; i += 7) weekStarts.push(gridDates[i])
  const weekStatuses: MonthWeekStatus[] = weekStarts.map((ws) => ({
    weekStart: ws,
    status: (rotaMap[ws] as "published" | "draft") ?? null,
  }))

  const days: MonthDaySummary[] = gridDates.map((date) => {
    const entries   = byDate[date] ?? []
    const staffIds  = entries.map((e) => e.staff_id)
    const covered   = new Set(staffIds.flatMap((id) => staffSkillMap[id] ?? []))
    const hasSkillGaps = staffIds.length > 0 && allOrgSkills.some((sk) => !covered.has(sk))
    const dow       = new Date(date + "T12:00:00").getDay()
    const dowKey    = DOW_TO_KEY[dow]
    const isWeekend = dow === 0 || dow === 6
    const labCount = entries.filter((e) => e.role === "lab").length
    const andrologyCount = entries.filter((e) => e.role === "andrology").length
    // Coverage warning: check if below minimums
    const lc = labConfigRes.data as Record<string, number> | null
    const hasCoverageWarning = staffIds.length > 0 && lc ? (
      labCount < (isWeekend ? (lc.min_weekend_lab_coverage ?? lc.min_lab_coverage ?? 0) : (lc.min_lab_coverage ?? 0)) ||
      andrologyCount < (isWeekend ? (lc.min_weekend_andrology ?? lc.min_andrology_coverage ?? 0) : (lc.min_andrology_coverage ?? 0))
    ) : false
    return {
      date,
      staffCount: staffIds.length,
      labCount,
      andrologyCount,
      adminCount: entries.filter((e) => e.role === "admin").length,
      hasSkillGaps: hasSkillGaps || hasCoverageWarning,
      isWeekend,
      isCurrentMonth: weekStartOverride ? true : date.startsWith(currentMonthPrefix),
      punctions: puncByDay[dowKey] ?? 0,
      leaveCount: leaveByDate[date] ?? 0,
      holidayName: holidays[date] ?? null,
      staffRoles: entries.slice(0, 4).map((e) => e.role),
      staffInitials: [...entries]
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
  return { monthStart, days, weekStatuses, staffTotals, ratioOptimal, ratioMinimum, firstDayOfWeek, timeFormat, biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct, rotaDisplayMode: "by_shift", taskConflictThreshold: 3, enableTaskInShift: false }
}

// ── getStaffProfile ───────────────────────────────────────────────────────────

export interface StaffProfileData {
  /** Last 20 assignments, newest first */
  recentAssignments: { date: string; shift_type: string; function_label: string | null }[]
  /** Future approved leaves */
  upcomingLeaves: { start_date: string; end_date: string; type: string }[]
  /** Last 3 past leaves */
  pastLeaves: { start_date: string; end_date: string; type: string }[]
}

export async function getStaffProfile(staffId: string): Promise<StaffProfileData> {
  const supabase = await createClient()
  const today    = new Date().toISOString().split("T")[0]

  // Go back 8 weeks to capture enough history for "last 10 shifts"
  const eightWeeksAgo = new Date()
  eightWeeksAgo.setDate(eightWeeksAgo.getDate() - 56)
  const since = eightWeeksAgo.toISOString().split("T")[0]

  const [assignmentsRes, leavesRes, pastLeavesRes] = await Promise.all([
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
  ])

  return {
    recentAssignments: assignmentsRes.data ?? [],
    upcomingLeaves: leavesRes.data ?? [],
    pastLeaves: pastLeavesRes.data ?? [],
  }
}

export async function copyDayFromLastWeek(weekStart: string, date: string): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
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
  const orgId = await getOrgId(supabase)
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
  const orgId = await getOrgId(supabase)
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
  await supabase.from("rotas").update({ generation_type: "manual" } as never).eq("id", rotaRow.id).then(() => {})

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
  await supabase.from("rotas").update({ generation_type: strict ? "strict_template" : "flexible_template" } as never).eq("id", rota.id).then(() => {})

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
