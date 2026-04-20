"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { notifyLeaveImpact } from "@/app/(clinic)/notification-actions"
import { isHrModuleActive, computeHrLeaveFields, createOverflowEntry } from "@/lib/hr-leave-integration"
import type { LeaveType, LeaveStatus, Leave } from "@/lib/types/database"
import { getOrgId } from "@/lib/get-org-id"
import { clearRotaAssignmentsForLeave } from "@/lib/leaves/clear-rota-assignments"

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

  const leaveTypeId = formData.get("leave_type_id") as string | null
  let hrFields: Record<string, unknown> = {}
  let hrResultCached: Awaited<ReturnType<typeof computeHrLeaveFields>> | null = null
  if (leaveTypeId && await isHrModuleActive(orgId)) {
    hrResultCached = await computeHrLeaveFields({
      orgId,
      staffId: leave.staff_id,
      leaveTypeId,
      startDate: leave.start_date,
      endDate: leave.end_date,
    })
    hrFields = {
      leave_type_id: hrResultCached.leave_type_id,
      days_counted: hrResultCached.overflow.needed ? hrResultCached.overflow.mainDays : hrResultCached.days_counted,
      balance_year: hrResultCached.balance_year,
      uses_cf_days: hrResultCached.uses_cf_days,
      cf_days_used: hrResultCached.cf_days_used,
    }
  }

  const { error, data: insertedLeave } = await supabase
    .from("leaves")
    .insert({ ...leave, ...hrFields, organisation_id: orgId })
    .select("id")
    .single() as { error: { message: string } | null; data: { id: string } | null }

  if (error) return { error: error.message }

  if (insertedLeave && hrResultCached?.overflow.needed && hrResultCached.overflow.overflowTypeId) {
    await createOverflowEntry({
      orgId,
      staffId: leave.staff_id,
      parentLeaveId: insertedLeave.id,
      overflowTypeId: hrResultCached.overflow.overflowTypeId,
      startDate: leave.start_date,
      endDate: leave.end_date,
      overflowDays: hrResultCached.overflow.overflowDays,
      balanceYear: hrResultCached.balance_year ?? new Date().getFullYear(),
      notes: `Overflow from ${leave.type}`,
    })
  }

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
  revalidatePath("/leaves")
  revalidatePath("/") // clearRotaAssignmentsForLeave modifies the schedule
  return { success: true }
}

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

  let hrFields: Partial<Pick<Leave, 'leave_type_id' | 'days_counted' | 'balance_year' | 'uses_cf_days' | 'cf_days_used'>> = {}
  let hrResultCached: Awaited<ReturnType<typeof computeHrLeaveFields>> | null = null
  if (params.leaveTypeId && await isHrModuleActive(orgId)) {
    hrResultCached = await computeHrLeaveFields({
      orgId,
      staffId: params.staffId,
      leaveTypeId: params.leaveTypeId,
      startDate: params.startDate,
      endDate: params.endDate,
    })
    hrFields = {
      leave_type_id: hrResultCached.leave_type_id,
      days_counted: hrResultCached.overflow.needed ? hrResultCached.overflow.mainDays : hrResultCached.days_counted,
      balance_year: hrResultCached.balance_year,
      uses_cf_days: hrResultCached.uses_cf_days,
      cf_days_used: hrResultCached.cf_days_used,
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

  if (insertedLeave && hrResultCached?.overflow.needed && hrResultCached.overflow.overflowTypeId) {
    await createOverflowEntry({
      orgId,
      staffId: params.staffId,
      parentLeaveId: insertedLeave.id,
      overflowTypeId: hrResultCached.overflow.overflowTypeId,
      startDate: params.startDate,
      endDate: params.endDate,
      overflowDays: hrResultCached.overflow.overflowDays,
      balanceYear: hrResultCached.balance_year ?? new Date().getFullYear(),
      notes: `Overflow from ${params.type}`,
    })
  }

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
