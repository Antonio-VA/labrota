"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { isHrModuleActive, checkLeaveRequestBalance } from "@/lib/hr-leave-integration"
import type { LeaveType } from "@/lib/types/database"
import { getOrgId } from "@/lib/get-org-id"
import { formatDateWithYear } from "@/lib/format-date"
import { clearRotaAssignmentsForLeave } from "@/lib/leaves/clear-rota-assignments"
import { sendLeaveRequestEmail, sendLeaveCancellationEmail, notifyLeaveDecision } from "../emails"

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

  const { data: member } = await supabase
    .from("organisation_members")
    .select("linked_staff_id")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single() as { data: { linked_staff_id: string | null } | null }
  if (!member?.linked_staff_id || member.linked_staff_id !== params.staffId) {
    return { error: "You can only request leave for yourself." }
  }

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

  try {
    const [staffRes, managersRes, orgRes, labConfigRes, activeStaffRes, overlappingLeavesRes] = await Promise.all([
      admin.from("staff").select("first_name, last_name, role").eq("id", params.staffId).single(),
      admin.from("organisation_members").select("user_id, role").eq("organisation_id", orgId).in("role", ["admin", "manager"]),
      admin.from("organisations").select("name").eq("id", orgId).single(),
      admin.from("lab_config").select("country").eq("organisation_id", orgId).maybeSingle(),
      admin.from("staff").select("id, role", { count: "exact" }).eq("organisation_id", orgId).eq("onboarding_status", "active"),
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

  // Atomic: update only if still pending — prevents double-approval race
  const { data: leave, error } = await supabase
    .from("leaves")
    .update({ status: "approved" })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    .eq("status", "pending")
    .select("staff_id, start_date, end_date")
    .single() as { data: { staff_id: string; start_date: string; end_date: string } | null; error: unknown }

  if (error || !leave) return { error: "Leave not found or no longer pending." }

  // Try to store reviewer info (columns may not exist before migration)
  await supabase
    .from("leaves")
    .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

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

  notifyLeaveDecision({ leaveId, orgId, decision: "approved" }).catch(() => {})

  revalidatePath("/schedule")
  revalidatePath("/leaves")
  return {}
}

/** Admin rejects a pending leave request. */
export async function rejectLeave(leaveId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }

  const { data: { user } } = await supabase.auth.getUser()

  // Atomic: update only if still pending — prevents approve+reject race
  const { data: rejected, error } = await supabase
    .from("leaves")
    .update({ status: "rejected" })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    .eq("status", "pending")
    .select("id")
    .single() as { data: { id: string } | null; error: unknown }

  if (error || !rejected) return { error: "Leave not found or no longer pending." }

  // Try to store reviewer info (columns may not exist before migration)
  await supabase
    .from("leaves")
    .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

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

  const { data: { user } } = await supabase.auth.getUser()

  // Atomic: update only if still pending/approved — prevents cancel-after-reject race
  const { data: cancelled, error } = await admin
    .from("leaves")
    .update({ status: "cancelled" })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    .in("status", ["pending", "approved"])
    .select("id")
    .single() as { data: { id: string } | null; error: unknown }

  if (!cancelled || error) return { error: (error as { message?: string })?.message ?? "Leave is no longer cancellable." }

  // Try to store reviewer info (columns may not exist before migration)
  await admin
    .from("leaves")
    .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() })
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

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
  revalidatePath("/schedule")
  return {}
}
