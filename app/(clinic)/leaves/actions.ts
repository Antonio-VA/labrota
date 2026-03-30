"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { notifyLeaveImpact } from "@/app/(clinic)/notification-actions"
import type { LeaveType, LeaveStatus } from "@/lib/types/database"
import { getOrgId } from "@/lib/get-org-id"

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

  const { error } = await supabase
    .from("leaves")
    .insert({ ...leave, organisation_id: orgId } as never)

  if (error) return { error: error.message }

  // Auto-remove conflicting rota assignments for this staff during leave period
  await supabase
    .from("rota_assignments")
    .delete()
    .eq("staff_id", leave.staff_id)
    .eq("organisation_id", orgId)
    .gte("date", leave.start_date)
    .lte("date", leave.end_date)
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
    .update(leave as never)
    .eq("id", id)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }

  // Auto-remove conflicting rota assignments for updated leave period
  if (orgId) {
    await supabase
      .from("rota_assignments")
      .delete()
      .eq("staff_id", leave.staff_id)
      .eq("organisation_id", orgId)
      .gte("date", leave.start_date)
      .lte("date", leave.end_date)
    revalidatePath("/")
  }

  revalidatePath("/leaves")
  return { success: true }
}

/** Quick-create leave from the rota screen (no FormData). */
export async function quickCreateLeave(params: {
  staffId: string
  type: string
  startDate: string
  endDate: string
  notes?: string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  if (!params.staffId) return { error: "Staff member is required." }
  if (params.endDate < params.startDate) return { error: "End date must be on or after start date." }

  const { error } = await supabase
    .from("leaves")
    .insert({
      staff_id: params.staffId,
      type: params.type,
      start_date: params.startDate,
      end_date: params.endDate,
      status: "approved",
      notes: params.notes?.trim() || null,
      organisation_id: orgId,
    } as never)

  if (error) return { error: error.message }

  // Auto-remove conflicting rota assignments
  await supabase
    .from("rota_assignments")
    .delete()
    .eq("staff_id", params.staffId)
    .eq("organisation_id", orgId)
    .gte("date", params.startDate)
    .lte("date", params.endDate)

  revalidatePath("/")
  revalidatePath("/leaves")
  return {}
}

export async function deleteLeave(id: string) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  await supabase.from("leaves").delete().eq("id", id).eq("organisation_id", orgId)
  revalidatePath("/leaves")
}

/** Employee submits a leave request (status = pending). */
export async function requestLeave(params: {
  staffId: string
  type: string
  startDate: string
  endDate: string
  notes?: string
}): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }
  if (params.endDate < params.startDate) return { error: "La fecha de fin debe ser posterior a la de inicio." }

  // Use admin client to bypass RLS — viewers don't have INSERT on leaves
  const admin = createAdminClient()

  const { data: insertedLeave, error } = await admin
    .from("leaves")
    .insert({
      staff_id: params.staffId,
      type: params.type,
      start_date: params.startDate,
      end_date: params.endDate,
      status: "pending",
      notes: params.notes?.trim() || null,
      organisation_id: orgId,
    } as never)
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
        })
      }
    }
  } catch {
    // Email failure should not block the request
  }

  revalidatePath("/leaves")
  return {}
}

async function sendLeaveRequestEmail(params: {
  to: string[]
  leaveId: string
  staffName: string
  staffRole: string
  type: string
  startDate: string
  endDate: string
  notes: string | null
  orgName: string
  locale: "es" | "en"
  overlapNames: string[]
  sameRoleOverlapCount: number
  totalActiveStaff: number
}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const { signLeaveAction } = await import("@/app/api/leave-action/route")
  const approveToken = signLeaveAction(params.leaveId, "approve")
  const rejectToken = signLeaveAction(params.leaveId, "reject")

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.labrota.app"
  const approveUrl = `${baseUrl}/api/leave-action?id=${params.leaveId}&action=approve&token=${approveToken}`
  const rejectUrl = `${baseUrl}/api/leave-action?id=${params.leaveId}&action=reject&token=${rejectToken}`
  const appUrl = `${baseUrl}/leaves`

  const isEs = params.locale === "es"

  const typeLabels: Record<string, { es: string; en: string }> = {
    annual:    { es: "Vacaciones",            en: "Annual leave" },
    sick:      { es: "Baja médica",           en: "Sick leave" },
    personal:  { es: "Asuntos propios",       en: "Personal leave" },
    training:  { es: "Formación",             en: "Training" },
    maternity: { es: "Maternidad/Paternidad", en: "Maternity/Paternity" },
    other:     { es: "Otros",                 en: "Other" },
  }
  const typeLabel = typeLabels[params.type]?.[params.locale] ?? params.type

  const roleLabels: Record<string, { es: string; en: string }> = {
    lab:       { es: "Lab", en: "Lab" },
    andrology: { es: "Andrología", en: "Andrology" },
    admin:     { es: "Admin", en: "Admin" },
  }
  const roleLabel = roleLabels[params.staffRole]?.[params.locale] ?? params.staffRole

  // Calculate days
  const days = Math.round((new Date(params.endDate + "T12:00:00").getTime() - new Date(params.startDate + "T12:00:00").getTime()) / 86400000) + 1

  // Format dates nicely
  const fmtDate = (d: string) => {
    const date = new Date(d + "T12:00:00")
    return date.toLocaleDateString(isEs ? "es-ES" : "en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
  }

  // Build warning section
  let warningHtml = ""
  if (params.overlapNames.length > 0) {
    const warningTitle = isEs ? "Posible impacto en cobertura" : "Potential coverage impact"
    const alsoOff = isEs
      ? `También de ausencia en este período:`
      : `Also off during this period:`
    const sameRoleNote = params.sameRoleOverlapCount > 0
      ? (isEs
          ? `${params.sameRoleOverlapCount} persona${params.sameRoleOverlapCount > 1 ? "s" : ""} del mismo rol (${roleLabel}) también ausente${params.sameRoleOverlapCount > 1 ? "s" : ""}.`
          : `${params.sameRoleOverlapCount} ${roleLabel} team member${params.sameRoleOverlapCount > 1 ? "s" : ""} also off.`)
      : ""

    warningHtml = `
      <div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:16px 0;">
        <p style="margin:0 0 6px;font-weight:600;color:#92400e;font-size:14px;">⚠️ ${warningTitle}</p>
        <p style="margin:0 0 4px;color:#78350f;font-size:13px;">${alsoOff}</p>
        <p style="margin:0 0 4px;color:#78350f;font-size:13px;font-weight:500;">${params.overlapNames.join(", ")}</p>
        ${sameRoleNote ? `<p style="margin:6px 0 0;color:#92400e;font-size:12px;font-weight:600;">${sameRoleNote}</p>` : ""}
      </div>`
  }

  const subject = isEs
    ? `Solicitud de ausencia: ${params.staffName}`
    : `Leave request: ${params.staffName}`

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 16px;">

  <!-- Header -->
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:24px;color:#1B4F8A;letter-spacing:-0.5px;">
      <span style="font-weight:300;">lab</span><span style="font-weight:700;">rota</span>
    </span>
  </div>

  <!-- Card -->
  <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">

    <!-- Blue header strip -->
    <div style="background:#1B4F8A;padding:20px 24px;">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:600;">
        ${isEs ? "Nueva solicitud de ausencia" : "New leave request"}
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">
        ${params.orgName}
      </p>
    </div>

    <!-- Body -->
    <div style="padding:24px;">

      <p style="margin:0 0 20px;color:#334155;font-size:15px;">
        ${isEs
          ? `<strong>${params.staffName}</strong> ha solicitado una ausencia.`
          : `<strong>${params.staffName}</strong> has requested leave.`}
      </p>

      <!-- Details table -->
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;width:120px;">
            ${isEs ? "Tipo" : "Type"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${typeLabel}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Desde" : "From"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${fmtDate(params.startDate)}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Hasta" : "To"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${fmtDate(params.endDate)}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Duración" : "Duration"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${days} ${isEs ? (days === 1 ? "día" : "días") : (days === 1 ? "day" : "days")}
          </td>
        </tr>
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Rol" : "Role"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">
            ${roleLabel}
          </td>
        </tr>
        ${params.notes ? `
        <tr>
          <td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">
            ${isEs ? "Notas" : "Notes"}
          </td>
          <td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#475569;font-style:italic;">
            ${params.notes}
          </td>
        </tr>` : ""}
      </table>

      ${warningHtml}

      <!-- Action buttons -->
      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${approveUrl}" style="display:inline-block;background:#059669;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;margin-right:12px;">
          ${isEs ? "✓ Aprobar" : "✓ Approve"}
        </a>
        <a href="${rejectUrl}" style="display:inline-block;background:white;color:#dc2626;text-decoration:none;padding:12px 32px;border-radius:8px;font-size:15px;font-weight:600;border:2px solid #fecaca;">
          ${isEs ? "✗ Rechazar" : "✗ Reject"}
        </a>
      </div>

      <p style="text-align:center;margin:16px 0 0;">
        <a href="${appUrl}" style="color:#1B4F8A;font-size:13px;text-decoration:underline;">
          ${isEs ? "Abrir LabRota" : "Open LabRota"}
        </a>
      </p>

    </div>
  </div>

  <!-- Footer -->
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">
    ${isEs ? "Este email fue enviado automáticamente por LabRota." : "This email was sent automatically by LabRota."}
  </p>

</div>
</body>
</html>`

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `LabRota <noreply@labrota.app>`,
      to: params.to,
      subject,
      html,
    }),
  })
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
    .update({ status: "approved" } as never)
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }

  // Try to store reviewer info (columns may not exist before migration)
  await supabase
    .from("leaves")
    .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() } as never)
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    .then(() => {})

  // Auto-remove conflicting rota assignments
  await supabase
    .from("rota_assignments")
    .delete()
    .eq("staff_id", leave.staff_id)
    .eq("organisation_id", orgId)
    .gte("date", leave.start_date)
    .lte("date", leave.end_date)

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
    .update({ status: "rejected" } as never)
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }

  // Try to store reviewer info (columns may not exist before migration)
  await supabase
    .from("leaves")
    .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() } as never)
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    .then(() => {})

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
    .update({ status: "cancelled" } as never)
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

  // Try to store reviewer info (columns may not exist before migration)
  if (!error) {
    await admin
      .from("leaves")
      .update({ reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() } as never)
      .eq("id", leaveId)
      .eq("organisation_id", orgId)
      .then(() => {})
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

async function sendLeaveCancellationEmail(params: {
  to: string[]; staffName: string; type: string
  startDate: string; endDate: string; wasApproved: boolean
  orgName: string; locale: "es" | "en"
}) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const isEs = params.locale === "es"
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.labrota.app"

  const typeLabels: Record<string, { es: string; en: string }> = {
    annual: { es: "Vacaciones", en: "Annual leave" }, sick: { es: "Baja médica", en: "Sick leave" },
    personal: { es: "Asuntos propios", en: "Personal leave" }, training: { es: "Formación", en: "Training" },
    maternity: { es: "Maternidad/Paternidad", en: "Maternity/Paternity" }, other: { es: "Otros", en: "Other" },
  }
  const typeLabel = typeLabels[params.type]?.[params.locale] ?? params.type
  const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(isEs ? "es-ES" : "en-GB", { weekday: "short", day: "numeric", month: "short" })

  const statusNote = params.wasApproved
    ? (isEs ? "Esta ausencia ya estaba aprobada. Revisa el horario si es necesario." : "This leave was already approved. Review the schedule if needed.")
    : ""

  const subject = isEs
    ? `Ausencia cancelada: ${params.staffName}`
    : `Leave cancelled: ${params.staffName}`

  const html = `
<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:520px;margin:0 auto;padding:32px 16px;">
  <div style="text-align:center;margin-bottom:24px;">
    <span style="font-size:24px;color:#1B4F8A;"><span style="font-weight:300;">lab</span><span style="font-weight:700;">rota</span></span>
  </div>
  <div style="background:white;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden;">
    <div style="background:#64748b;padding:20px 24px;">
      <h1 style="margin:0;color:white;font-size:18px;font-weight:600;">${isEs ? "Ausencia cancelada" : "Leave cancelled"}</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">${params.orgName}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#334155;font-size:15px;">
        ${isEs
          ? `<strong>${params.staffName}</strong> ha cancelado su ausencia.`
          : `<strong>${params.staffName}</strong> has cancelled their leave.`}
      </p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 16px;" cellpadding="0" cellspacing="0">
        <tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;width:120px;">${isEs ? "Tipo" : "Type"}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${typeLabel}</td></tr>
        <tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Desde" : "From"}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${fmtDate(params.startDate)}</td></tr>
        <tr><td style="padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;color:#64748b;font-weight:600;">${isEs ? "Hasta" : "To"}</td><td style="padding:10px 12px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;">${fmtDate(params.endDate)}</td></tr>
      </table>
      ${statusNote ? `<div style="background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:12px 16px;margin:0 0 16px;"><p style="margin:0;color:#92400e;font-size:13px;">⚠️ ${statusNote}</p></div>` : ""}
      <p style="text-align:center;margin:16px 0 0;"><a href="${baseUrl}/leaves" style="color:#1B4F8A;font-size:13px;text-decoration:underline;">${isEs ? "Abrir LabRota" : "Open LabRota"}</a></p>
    </div>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:24px;">${isEs ? "Este email fue enviado automáticamente por LabRota." : "This email was sent automatically by LabRota."}</p>
</div></body></html>`

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "LabRota <noreply@labrota.app>", to: params.to, subject, html }),
  })
}
