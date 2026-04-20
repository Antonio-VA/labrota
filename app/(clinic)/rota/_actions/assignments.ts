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
import { getRotaWeek } from "./queries"
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
    supabase.from("rota_assignments").select("staff_id, date, shift_type").gte("date", toISODate(fourWeeksAgo)).lte("date", weekDates[6]),
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
  const { days } = runRotaEngineV2({
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
