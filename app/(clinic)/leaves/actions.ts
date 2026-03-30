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

  const { error } = await admin
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

  if (error) return { error: error.message }

  // Send email notification to managers/admins
  try {
    const { data: staff } = await admin
      .from("staff")
      .select("first_name, last_name")
      .eq("id", params.staffId)
      .single() as { data: { first_name: string; last_name: string } | null }

    const staffName = staff ? `${staff.first_name} ${staff.last_name}` : "Unknown"

    // Get managers/admins in this org
    const { data: managers } = await admin
      .from("organisation_members")
      .select("user_id, role")
      .eq("organisation_id", orgId)
      .in("role", ["admin", "manager"]) as { data: Array<{ user_id: string; role: string }> | null }

    if (managers?.length) {
      const { data: profiles } = await admin
        .from("profiles")
        .select("id, email")
        .in("id", managers.map((m) => m.user_id)) as { data: Array<{ id: string; email: string }> | null }

      const emails = (profiles ?? []).map((p) => p.email).filter(Boolean)
      if (emails.length > 0) {
        const { data: org } = await admin
          .from("organisations")
          .select("name")
          .eq("id", orgId)
          .single() as { data: { name: string } | null }

        await sendLeaveRequestEmail({
          to: emails,
          staffName,
          type: params.type,
          startDate: params.startDate,
          endDate: params.endDate,
          notes: params.notes?.trim() || null,
          orgName: org?.name ?? "LabRota",
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
  staffName: string
  type: string
  startDate: string
  endDate: string
  notes: string | null
  orgName: string
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SECRET_KEY
  if (!supabaseUrl || !serviceKey) return

  // Use Supabase Edge Function or direct SMTP — for now use Supabase's auth.admin
  // to send via the built-in email. We'll use a simple fetch to a Supabase edge function.
  // Fallback: use Resend or similar if configured.
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return

  const typeLabels: Record<string, string> = {
    annual: "Vacaciones", sick: "Baja médica", personal: "Asuntos propios",
    training: "Formación", maternity: "Maternidad/Paternidad", other: "Otros",
  }

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `LabRota <noreply@labrota.app>`,
      to: params.to,
      subject: `Solicitud de ausencia: ${params.staffName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 480px;">
          <h2 style="color: #1B4F8A; font-size: 18px;">Nueva solicitud de ausencia</h2>
          <p><strong>${params.staffName}</strong> ha solicitado una ausencia en <strong>${params.orgName}</strong>.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
            <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">Tipo</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${typeLabels[params.type] ?? params.type}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">Desde</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.startDate}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">Hasta</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.endDate}</td></tr>
            ${params.notes ? `<tr><td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">Notas</td><td style="padding: 8px; border: 1px solid #e2e8f0;">${params.notes}</td></tr>` : ""}
          </table>
          <p style="color: #64748b; font-size: 13px;">Accede a LabRota para aprobar o rechazar esta solicitud.</p>
        </div>
      `,
    }),
  })
}

/** Admin approves a pending leave request. */
export async function approveLeave(leaveId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

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
export async function rejectLeave(leaveId: string, reason?: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }

  const { error } = await supabase
    .from("leaves")
    .delete()
    .eq("id", leaveId)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/leaves")
  return {}
}
