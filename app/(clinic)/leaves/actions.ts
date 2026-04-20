"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyLeaveImpact } from "@/app/(clinic)/notification-actions"
import { isHrModuleActive, computeHrLeaveFields, createOverflowEntry, checkLeaveRequestBalance } from "@/lib/hr-leave-integration"
import type { LeaveType, LeaveStatus } from "@/lib/types/database"
import { getOrgId } from "@/lib/get-org-id"
import { formatDateWithYear } from "@/lib/format-date"
import { clearRotaAssignmentsForLeave } from "@/lib/leaves/clear-rota-assignments"
import { sendLeaveRequestEmail, sendLeaveCancellationEmail, notifyLeaveDecision } from "./emails"

function parseLeaveForm(formData: FormData) {
  return {
    staff_id:   formData.get("staff_id") as string,
    type:       formData.get("type") as LeaveType,
    start_date: formData.get("start_date") as string,
    end_date:   formData.get("end_date") as string,
    status:     "approved" as LeaveStatus,
    notes:      ((formData.get("notes") as string) || "").trim() || null,
  }
}

export async function createLeave(_prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const leave = parseLeaveForm(formData)

  if (!leave.staff_id) return { error: "Staff member is required." }
  if (leave.end_date < leave.start_date) return { error: "End date must be on or after start date." }

  // Compute HR module fields if active
  const leaveTypeId = formData.get("leave_type_id") as string | null
  let hrFields: Record<string, unknown> = {}
  if (leaveTypeId && await isHrModuleActive(orgId)) {
    const hrResult = await computeHrLeaveFields({
      orgId,
      staffId: leave.staff_id,
      leaveTypeId,
      startDate: leave.start_date,
      endDate: leave.end_date,
    })
    hrFields = {
      leave_type_id: hrResult.leave_type_id,
      days_counted: hrResult.overflow.needed ? hrResult.overflow.mainDays : hrResult.days_counted,
      balance_year: hrResult.balance_year,
      uses_cf_days: hrResult.uses_cf_days,
      cf_days_used: hrResult.cf_days_used,
    }
  }

  const { error, data: insertedLeave } = await supabase
    .from("leaves")
    .insert({ ...leave, ...hrFields, organisation_id: orgId })
    .select("id")
    .single() as { error: { message: string } | null; data: { id: string } | null }

  if (error) return { error: error.message }

  // Create overflow companion entry if needed
  if (leaveTypeId && insertedLeave && hrFields.leave_type_id) {
    const hrResult = await computeHrLeaveFields({
      orgId,
      staffId: leave.staff_id,
      leaveTypeId,
      startDate: leave.start_date,
      endDate: leave.end_date,
    })
    if (hrResult.overflow.needed && hrResult.overflow.overflowTypeId) {
      await createOverflowEntry({
        orgId,
        staffId: leave.staff_id,
        parentLeaveId: insertedLeave.id,
        overflowTypeId: hrResult.overflow.overflowTypeId,
        startDate: leave.start_date,
        endDate: leave.end_date,
        overflowDays: hrResult.overflow.overflowDays,
        balanceYear: hrResult.balance_year ?? new Date().getFullYear(),
        notes: `Overflow from ${leave.type}`,
      })
    }
  }

  // Auto-remove conflicting rota assignments for this staff during leave period
  if (insertedLeave) {
    const { data: { user } } = await supabase.auth.getUser()
    await clearRotaAssignmentsForLeave({
      client: supabase,
      orgId,
      staffId: leave.staff_id,
      startDate: leave.start_date,
      endDate: leave.end_date,
      leaveId: insertedLeave.id,
      userId: user?.id,
      trigger: "leave_created",
    })
  }
  revalidatePath("/")

  // Notify admins if this leave impacts published rotas
  const { data: staffData } = await supabase
    .from("staff")
    .select("first_name, last_name")
    .eq("id", leave.staff_id)
    .single() as { data: { first_name: string; last_name: string } | null }
  if (staffData) {
    notifyLeaveImpact({
      orgId,
      staffName: `${staffData.first_name} ${staffData.last_name}`,
      startDate: leave.start_date,
      endDate: leave.end_date,
    }).catch((err) => console.error("[leave] notifyLeaveImpact failed:", err))
  }

  revalidatePath("/leaves")
  return { success: true }
}

export async function updateLeave(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const leave = parseLeaveForm(formData)

  if (leave.end_date < leave.start_date) return { error: "End date must be on or after start date." }

  const { error } = await supabase
    .from("leaves")
    .update(leave)
    .eq("id", id)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }

  // Auto-remove conflicting rota assignments for updated leave period
  const { data: { user } } = await supabase.auth.getUser()
  await clearRotaAssignmentsForLeave({
    client: supabase,
    orgId,
    staffId: leave.staff_id,
    startDate: leave.start_date,
    endDate: leave.end_date,
    leaveId: id,
    userId: user?.id,
    trigger: "leave_updated",
  })
  revalidatePath("/")

  revalidatePath("/leaves")
  return { success: true }
}

/** Quick-create leave from the rota screen (no FormData). */
export async function quickCreateLeave(params: {
  staffId: string
  type: LeaveType
  startDate: string
  endDate: string
  notes?: string
  leaveTypeId?: string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  if (!params.staffId) return { error: "Staff member is required." }
  if (params.endDate < params.startDate) return { error: "End date must be on or after start date." }

  // Compute HR module fields if active
  let hrFields: Partial<Pick<import("@/lib/types/database").Leave, 'leave_type_id' | 'days_counted' | 'balance_year' | 'uses_cf_days' | 'cf_days_used'>> = {}
  if (params.leaveTypeId && await isHrModuleActive(orgId)) {
    const hrResult = await computeHrLeaveFields({
      orgId,
      staffId: params.staffId,
      leaveTypeId: params.leaveTypeId,
      startDate: params.startDate,
      endDate: params.endDate,
    })
    hrFields = {
      leave_type_id: hrResult.leave_type_id,
      days_counted: hrResult.overflow.needed ? hrResult.overflow.mainDays : hrResult.days_counted,
      balance_year: hrResult.balance_year,
      uses_cf_days: hrResult.uses_cf_days,
      cf_days_used: hrResult.cf_days_used,
    }
  }

  const { error, data: insertedLeave } = await supabase
    .from("leaves")
    .insert({
      staff_id: params.staffId,
      type: params.type,
      start_date: params.startDate,
      end_date: params.endDate,
      status: "approved" as const,
      notes: params.notes?.trim() || null,
      organisation_id: orgId,
      ...hrFields,
    })
    .select("id")
    .single() as { error: { message: string } | null; data: { id: string } | null }

  if (error) return { error: error.message }

  // Create overflow companion entry if needed
  if (params.leaveTypeId && insertedLeave && hrFields.leave_type_id) {
    const hrResult = await computeHrLeaveFields({
      orgId,
      staffId: params.staffId,
      leaveTypeId: params.leaveTypeId,
      startDate: params.startDate,
      endDate: params.endDate,
    })
    if (hrResult.overflow.needed && hrResult.overflow.overflowTypeId) {
      await createOverflowEntry({
        orgId,
        staffId: params.staffId,
        parentLeaveId: insertedLeave.id,
        overflowTypeId: hrResult.overflow.overflowTypeId,
        startDate: params.startDate,
        endDate: params.endDate,
        overflowDays: hrResult.overflow.overflowDays,
        balanceYear: hrResult.balance_year ?? new Date().getFullYear(),
        notes: `Overflow from ${params.type}`,
      })
    }
  }

  // Auto-remove conflicting rota assignments
  if (insertedLeave) {
    const { data: { user } } = await supabase.auth.getUser()
    await clearRotaAssignmentsForLeave({
      client: supabase,
      orgId,
      staffId: params.staffId,
      startDate: params.startDate,
      endDate: params.endDate,
      leaveId: insertedLeave.id,
      userId: user?.id,
      trigger: "leave_created",
    })
  }

  revalidatePath("/")
  revalidatePath("/leaves")
  return {}
}

export async function deleteLeave(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase.from("leaves").delete().eq("id", id).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/leaves")
  return {}
}

/**
 * Upload a leave attachment file (PDF, image, doc). Returns the org-scoped
 * storage path (NOT a URL) to persist on the leave row. Downloads are served
 * via the /api/leave-attachment/[id] proxy, which re-checks org access.
 */
export async function uploadLeaveAttachment(formData: FormData): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const file = formData.get("file") as File
  if (!file || file.size === 0) return { error: "No file provided." }
  if (file.size > 10 * 1024 * 1024) return { error: "File exceeds 10 MB limit." }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "bin"
  const path = `${orgId}/${user.id}/${Date.now()}.${ext}`

  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from("leave-attachments")
    .upload(path, file, { upsert: false, contentType: file.type })
  if (uploadError) return { error: uploadError.message }

  return { path }
}

/** Client-side live preview: returns balance info for the given staff/type/dates, or null if HR module is inactive. */
export async function previewLeaveBalance(params: {
  staffId: string
  type: string
  startDate: string
  endDate: string
}): Promise<Awaited<ReturnType<typeof checkLeaveRequestBalance>> | null> {
  const orgId = await getOrgId()
  if (!orgId) return null
  if (!await isHrModuleActive(orgId)) return null
  try {
    return await checkLeaveRequestBalance({
      orgId,
      staffId: params.staffId,
      legacyType: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
    })
  } catch {
    return null
  }
}

/** Employee submits a leave request (status = pending). Can also return { info? } for balance overflow notes. */
export async function requestLeave(params: {
  staffId: string
  type: LeaveType
  startDate: string
  endDate: string
  notes?: string
  attachmentUrl?: string
}): Promise<{ error?: string; info?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }
  if (params.endDate < params.startDate) return { error: "La fecha de fin debe ser posterior a la de inicio." }

  // Verify the staffId belongs to the authenticated user
  const { data: member } = await supabase
    .from("organisation_members")
    .select("linked_staff_id")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single() as { data: { linked_staff_id: string | null } | null }
  if (!member?.linked_staff_id || member.linked_staff_id !== params.staffId) {
    return { error: "You can only request leave for yourself." }
  }

  // Balance check — block if controlled type with no overflow and insufficient balance
  let overflowInfo: { mainDays: number; mainTypeName: string; overflowDays: number; overflowTypeName: string } | null = null
  if (await isHrModuleActive(orgId)) {
    const bal = await checkLeaveRequestBalance({
      orgId,
      staffId: params.staffId,
      legacyType: params.type,
      startDate: params.startDate,
      endDate: params.endDate,
    })
    if (bal.blocked) {
      return {
        error: `No tienes suficientes días disponibles de ${bal.leaveTypeName ?? "este tipo de ausencia"}. Disponibles: ${bal.available}d, solicitados: ${bal.daysCounted}d.`
      }
    }
    if (bal.overflow.needed && bal.overflow.overflowTypeName) {
      overflowInfo = {
        mainDays: bal.overflow.mainDays,
        mainTypeName: bal.leaveTypeName ?? params.type,
        overflowDays: bal.overflow.overflowDays,
        overflowTypeName: bal.overflow.overflowTypeName,
      }
    }
  }

  // Use admin client to bypass RLS — viewers don't have INSERT on leaves
  const admin = createAdminClient()

  const { data: insertedLeave, error } = await admin
    .from("leaves")
    .insert({
      staff_id: params.staffId,
      type: params.type,
      start_date: params.startDate,
      end_date: params.endDate,
      status: "pending" as const,
      notes: params.notes?.trim() || null,
      attachment_url: params.attachmentUrl ?? null,
      organisation_id: orgId,
    })
    .select("id")
    .single() as { data: { id: string } | null; error: unknown }

  if (error || !insertedLeave) return { error: (error as { message?: string })?.message ?? "Insert failed." }

  // Send email notification to managers/admins
  try {
    const [staffRes, managersRes, orgRes, labConfigRes, activeStaffRes, overlappingLeavesRes] = await Promise.all([
      admin.from("staff").select("first_name, last_name, role").eq("id", params.staffId).single(),
      admin.from("organisation_members").select("user_id, role").eq("organisation_id", orgId).in("role", ["admin", "manager"]),
      admin.from("organisations").select("name").eq("id", orgId).single(),
      admin.from("lab_config").select("country").eq("organisation_id", orgId).maybeSingle(),
      admin.from("staff").select("id, role", { count: "exact" }).eq("organisation_id", orgId).eq("onboarding_status", "active"),
      // Find other approved/pending leaves that overlap with this request
      admin.from("leaves").select("staff_id, staff:staff!inner(first_name, last_name, role)")
        .eq("organisation_id", orgId)
        .neq("staff_id", params.staffId)
        .in("status", ["approved", "pending"])
        .lte("start_date", params.endDate)
        .gte("end_date", params.startDate),
    ])

    const staff = staffRes.data as { first_name: string; last_name: string; role: string } | null
    const staffName = staff ? `${staff.first_name} ${staff.last_name}` : "Unknown"
    const managers = (managersRes.data ?? []) as Array<{ user_id: string; role: string }>
    const orgName = (orgRes.data as { name: string } | null)?.name ?? "LabRota"
    const country = (labConfigRes.data as { country?: string } | null)?.country ?? ""
    const locale: "es" | "en" = country === "ES" || country === "" ? "es" : "en"
    const totalActive = activeStaffRes.count ?? 0
    const overlapping = (overlappingLeavesRes.data ?? []) as unknown as Array<{ staff_id: string; staff: { first_name: string; last_name: string; role: string } }>

    // Deduplicate overlapping staff
    const overlapNames = [...new Map(overlapping.map((l) => [l.staff_id, `${l.staff.first_name} ${l.staff.last_name}`])).values()]
    const sameRoleOverlap = overlapping.filter((l) => l.staff.role === staff?.role)
    const sameRoleCount = new Set(sameRoleOverlap.map((l) => l.staff_id)).size

    if (managers.length) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", managers.map((m) => m.user_id)) as { data: Array<{ id: string; email: string }> | null }

      const emails = (profiles ?? []).map((p) => p.email).filter(Boolean)
      if (emails.length > 0) {
        await sendLeaveRequestEmail({
          to: emails,
          leaveId: insertedLeave.id,
          staffName,
          staffRole: staff?.role ?? "lab",
          type: params.type,
          startDate: params.startDate,
          endDate: params.endDate,
          notes: params.notes?.trim() || null,
          orgName,
          locale,
          overlapNames,
          sameRoleOverlapCount: sameRoleCount,
          totalActiveStaff: totalActive,
          overflowNote: overflowInfo
            ? (locale === "es"
                ? `${overflowInfo.mainDays}d de ${overflowInfo.mainTypeName} + ${overflowInfo.overflowDays}d de ${overflowInfo.overflowTypeName}.`
                : `${overflowInfo.mainDays}d from ${overflowInfo.mainTypeName} + ${overflowInfo.overflowDays}d from ${overflowInfo.overflowTypeName}.`)
            : undefined,
        })
      }

      // In-app notifications for each admin/manager
      const inAppNotifs = managers.map(({ user_id }) => ({
        organisation_id: orgId,
        user_id,
        type: "leave_request",
        title: locale === "es" ? "Nueva solicitud de ausencia" : "New leave request",
        message: locale === "es"
          ? `${staffName} ha solicitado ausencia del ${formatDateWithYear(params.startDate + "T12:00:00", locale)} al ${formatDateWithYear(params.endDate + "T12:00:00", locale)}.${overflowInfo ? ` (${overflowInfo.mainDays}d ${overflowInfo.mainTypeName} + ${overflowInfo.overflowDays}d ${overflowInfo.overflowTypeName})` : ""}`
          : `${staffName} has requested leave from ${formatDateWithYear(params.startDate + "T12:00:00", locale)} to ${formatDateWithYear(params.endDate + "T12:00:00", locale)}.${overflowInfo ? ` (${overflowInfo.mainDays}d ${overflowInfo.mainTypeName} + ${overflowInfo.overflowDays}d ${overflowInfo.overflowTypeName})` : ""}`,
        data: { leaveId: insertedLeave.id, staffId: params.staffId, startDate: params.startDate, endDate: params.endDate },
      }))
      await admin.from("notifications").insert(inAppNotifs)
    }
  } catch {
    // Notification/email failure should not block the request
  }

  const infoMessage = overflowInfo
    ? `Nota: ${overflowInfo.mainDays}d de ${overflowInfo.mainTypeName} + ${overflowInfo.overflowDays}d de ${overflowInfo.overflowTypeName}.`
    : undefined

  revalidatePath("/leaves")
  return infoMessage ? { info: infoMessage } : {}
}


/** Admin approves a pending leave request. */
export async function approveLeave(leaveId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { data: { user } } = await supabase.auth.getUser()

  const { data: leave, error: fetchError } = await supabase
    .from("leaves")
    .select("staff_id, start_date, end_date, type")
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    .single() as { data: { staff_id: string; start_date: string; end_date: string; type: string } | null; error: unknown }

  if (fetchError || !leave) return { error: "Leave not found." }

  const { error } = await supabase
    .from("leaves")
    .update({ status: "approved" })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }

  // Try to store reviewer info (columns may not exist before migration)
  await supabase
    .from("leaves")
    .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    

  // Auto-remove conflicting rota assignments
  await clearRotaAssignmentsForLeave({
    client: supabase,
    orgId,
    staffId: leave.staff_id,
    startDate: leave.start_date,
    endDate: leave.end_date,
    leaveId,
    userId: user?.id,
    trigger: "leave_approved",
  })

  // Notify the staff member about the decision
  notifyLeaveDecision({ leaveId, orgId, decision: "approved" }).catch(() => {})

  revalidatePath("/")
  revalidatePath("/leaves")
  return {}
}

/** Admin rejects a pending leave request. */
export async function rejectLeave(leaveId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from("leaves")
    .update({ status: "rejected" })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }

  // Try to store reviewer info (columns may not exist before migration)
  await supabase
    .from("leaves")
    .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    

  // Notify the staff member about the decision
  notifyLeaveDecision({ leaveId, orgId, decision: "rejected" }).catch(() => {})

  revalidatePath("/leaves")
  return {}
}

/** User cancels their own leave (pending or approved). Notifies managers. */
export async function cancelLeave(leaveId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const admin = createAdminClient()

  const { data: leave } = await admin
    .from("leaves")
    .select("id, staff_id, type, start_date, end_date, status, organisation_id, staff:staff!inner(first_name, last_name)")
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    .single() as { data: { id: string; staff_id: string; type: string; start_date: string; end_date: string; status: string; organisation_id: string; staff: { first_name: string; last_name: string } } | null }

  if (!leave) return { error: "Leave not found." }
  if (leave.status !== "pending" && leave.status !== "approved") {
    return { error: "Only pending or approved leaves can be cancelled." }
  }

  // Get the current user for tracking who cancelled
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await admin
    .from("leaves")
    .update({ status: "cancelled" })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

  // Try to store reviewer info (columns may not exist before migration)
  if (!error) {
    await admin
      .from("leaves")
      .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
      .eq("id", leaveId)
      .eq("organisation_id", orgId)
      
  }

  if (error) return { error: error.message }

  // Notify managers about the cancellation
  try {
    const staffName = `${leave.staff.first_name} ${leave.staff.last_name}`

    const [managersRes, orgRes, labConfigRes] = await Promise.all([
      admin.from("organisation_members").select("user_id").eq("organisation_id", orgId).in("role", ["admin", "manager"]),
      admin.from("organisations").select("name").eq("id", orgId).single(),
      admin.from("lab_config").select("country").eq("organisation_id", orgId).maybeSingle(),
    ])

    const managers = (managersRes.data ?? []) as Array<{ user_id: string }>
    if (managers.length) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", managers.map((m) => m.user_id)) as { data: Array<{ id: string; email: string }> | null }

      const emails = (profiles ?? []).map((p) => p.email).filter(Boolean)
      const orgName = (orgRes.data as { name: string } | null)?.name ?? "LabRota"
      const country = (labConfigRes.data as { country?: string } | null)?.country ?? ""
      const locale: "es" | "en" = country === "ES" || country === "" ? "es" : "en"

      if (emails.length > 0) {
        await sendLeaveCancellationEmail({
          to: emails, staffName, type: leave.type,
          startDate: leave.start_date, endDate: leave.end_date,
          wasApproved: leave.status === "approved",
          orgName, locale,
        })
      }
    }
  } catch {
    // Email failure should not block
  }

  revalidatePath("/leaves")
  return {}
}
