"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { runRotaEngine, getWeekDates } from "@/lib/rota-engine"
import type {
  RotaStatus,
  StaffWithSkills,
  Leave,
  RotaAssignment,
  SkillName,
  ShiftType,
  StaffRole,
} from "@/lib/types/database"

// ── Shared types exported to client ──────────────────────────────────────────

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
    staff: { id: string; first_name: string; last_name: string; role: StaffRole }
  }[]
  skillGaps: SkillName[]
}

export interface RotaWeekData {
  weekStart: string
  rota: { id: string; status: RotaStatus; published_at: string | null; punctions_override: Record<string, number> } | null
  days: RotaDay[]
  punctionsDefault: Record<string, number>
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

  // Fetch rota record + lab config in parallel
  const [rotaResult, labConfigResult] = await Promise.all([
    supabase
      .from("rotas")
      .select("id, status, published_at, punctions_override")
      .eq("week_start", weekStart)
      .maybeSingle() as unknown as Promise<{ data: { id: string; status: string; published_at: string | null; punctions_override: Record<string, number> | null } | null }>,
    supabase.from("lab_config").select("punctions_by_day").single(),
  ])

  const rotaData = rotaResult.data
  const labConfig = labConfigResult.data as import("@/lib/types/database").LabConfig | null

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
    dayMap[date] = { date, isWeekend: isWeekendDate(date), assignments: [], skillGaps: [] }
  }

  if (!rota) {
    return { weekStart, rota: null, days: dates.map((d) => dayMap[d]), punctionsDefault }
  }

  // Fetch assignments with staff info
  type AssignmentRow = {
    id: string; staff_id: string; date: string; shift_type: string;
    is_manual_override: boolean; trainee_staff_id: string | null; notes: string | null
    staff: { id: string; first_name: string; last_name: string; role: string } | null
  }
  const { data: assignmentsData } = await supabase
    .from("rota_assignments")
    .select("id, staff_id, date, shift_type, is_manual_override, trainee_staff_id, notes, staff(id, first_name, last_name, role)")
    .eq("rota_id", rota.id) as { data: AssignmentRow[] | null }

  // Fetch all staff_skills to compute coverage
  const { data: skillsData } = await supabase
    .from("staff_skills")
    .select("staff_id, skill") as { data: { staff_id: string; skill: string }[] | null }

  const staffSkillMap: Record<string, SkillName[]> = {}
  for (const ss of skillsData ?? []) {
    if (!staffSkillMap[ss.staff_id]) staffSkillMap[ss.staff_id] = []
    staffSkillMap[ss.staff_id].push(ss.skill as SkillName)
  }

  const allOrgSkills = [...new Set((skillsData ?? []).map((ss) => ss.skill as SkillName))]

  // Populate day assignments
  for (const a of assignmentsData ?? []) {
    const day = dayMap[a.date]
    if (!day) continue
    const staff = a.staff as { id: string; first_name: string; last_name: string; role: string } | null
    if (!staff) continue
    day.assignments.push({
      id: a.id,
      staff_id: a.staff_id,
      shift_type: a.shift_type as ShiftType,
      is_manual_override: a.is_manual_override,
      trainee_staff_id: a.trainee_staff_id,
      notes: a.notes,
      staff: { id: staff.id, first_name: staff.first_name, last_name: staff.last_name, role: staff.role as StaffRole },
    })
  }

  // Compute skill gaps per day
  for (const day of Object.values(dayMap)) {
    const covered = new Set(day.assignments.flatMap((a) => staffSkillMap[a.staff_id] ?? []))
    day.skillGaps = allOrgSkills.filter((sk) => !covered.has(sk))
  }

  return { weekStart, rota, days: dates.map((d) => dayMap[d]), punctionsDefault }
}

// ── generateRota ──────────────────────────────────────────────────────────────

export async function generateRota(
  weekStart: string,
  preserveOverrides: boolean
): Promise<{ error?: string; assignmentCount?: number }> {
  const supabase = await createClient()
  const orgId = await getOrgId(supabase)
  if (!orgId) return { error: "No organisation found." }

  const weekDates = getWeekDates(weekStart)
  const fourWeeksAgo = new Date(weekStart + "T12:00:00")
  fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28)
  const fourWeeksAgoStr = fourWeeksAgo.toISOString().split("T")[0]

  // Fetch all required data in parallel
  const [staffRes, leavesRes, recentAssignmentsRes, labConfigRes] = await Promise.all([
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
  ])

  const labConfig = labConfigRes.data as import("@/lib/types/database").LabConfig | null
  if (!labConfig) return { error: "Lab configuration not found." }

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

  // Run engine
  const { days } = runRotaEngine({
    weekStart,
    staff: (staffRes.data ?? []) as StaffWithSkills[],
    leaves: (leavesRes.data ?? []) as Leave[],
    recentAssignments: (recentAssignmentsRes.data ?? []) as RotaAssignment[],
    labConfig,
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
      }))
    )

  if (toInsert.length === 0 && !preserveOverrides) {
    const staffCount = (staffRes.data ?? []).length
    if (staffCount === 0) {
      return { error: "No active staff found. Make sure staff members are added and not inactive." }
    }
    return { error: "No staff were eligible for any day this week. Check that staff have working patterns configured and are not all on leave." }
  }

  if (toInsert.length > 0) {
    const { error: insertError } = await supabase
      .from("rota_assignments")
      .insert(toInsert as never)
    if (insertError) return { error: insertError.message }
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
