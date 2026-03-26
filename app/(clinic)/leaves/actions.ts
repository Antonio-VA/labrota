"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
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
  const leave = parseLeaveForm(formData)

  if (leave.end_date < leave.start_date) return { error: "End date must be on or after start date." }

  const { error } = await supabase
    .from("leaves")
    .update(leave as never)
    .eq("id", id)

  if (error) return { error: error.message }

  // Auto-remove conflicting rota assignments for updated leave period
  const orgId = await getOrgId()
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
  await supabase.from("leaves").delete().eq("id", id)
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

  const { error } = await supabase
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
  revalidatePath("/leaves")
  return {}
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
    .single() as { data: { staff_id: string; start_date: string; end_date: string; type: string } | null; error: unknown }

  if (fetchError || !leave) return { error: "Leave not found." }

  const { error } = await supabase
    .from("leaves")
    .update({ status: "approved" } as never)
    .eq("id", leaveId)

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

  const { error } = await supabase
    .from("leaves")
    .delete()
    .eq("id", leaveId)

  if (error) return { error: error.message }

  revalidatePath("/leaves")
  return {}
}
