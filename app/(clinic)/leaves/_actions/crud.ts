"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { z } from "zod"
import { notifyLeaveImpact } from "@/app/(clinic)/notification-actions"
import { isHrModuleActive, computeHrLeaveFields, createOverflowEntry } from "@/lib/hr-leave-integration"
import type { LeaveStatus, Leave } from "@/lib/types/database"
import { getOrgId } from "@/lib/get-org-id"
import { clearRotaAssignmentsForLeave } from "@/lib/leaves/clear-rota-assignments"

async function resolveHrFields(
  orgId: string,
  staffId: string,
  leaveTypeId: string | null,
  startDate: string,
  endDate: string,
): Promise<{
  hrFields: Partial<Pick<Leave, "leave_type_id" | "days_counted" | "balance_year" | "uses_cf_days" | "cf_days_used">>
  hrResult: Awaited<ReturnType<typeof computeHrLeaveFields>> | null
}> {
  if (!leaveTypeId || !(await isHrModuleActive(orgId))) return { hrFields: {}, hrResult: null }
  const hrResult = await computeHrLeaveFields({ orgId, staffId, leaveTypeId, startDate, endDate })
  return {
    hrFields: {
      leave_type_id: hrResult.leave_type_id,
      days_counted: hrResult.overflow.needed ? hrResult.overflow.mainDays : hrResult.days_counted,
      balance_year: hrResult.balance_year,
      uses_cf_days: hrResult.uses_cf_days,
      cf_days_used: hrResult.cf_days_used,
    },
    hrResult,
  }
}

const leaveFormSchema = z.object({
  staff_id:   z.string().min(1),
  type:       z.enum(["annual", "sick", "personal", "training", "maternity", "other"]),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes:      z.string().optional().transform((v) => v?.trim() || null),
})

function parseLeaveForm(formData: FormData) {
  const raw = {
    staff_id:   formData.get("staff_id"),
    type:       formData.get("type"),
    start_date: formData.get("start_date"),
    end_date:   formData.get("end_date"),
    notes:      formData.get("notes") ?? undefined,
  }
  const parsed = leaveFormSchema.parse(raw)
  return { ...parsed, status: "approved" as LeaveStatus }
}

export async function createLeave(_prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const leave = parseLeaveForm(formData)

  if (!leave.staff_id) return { error: "Staff member is required." }
  if (leave.end_date < leave.start_date) return { error: "End date must be on or after start date." }

  const leaveTypeId = formData.get("leave_type_id") as string | null
  const { hrFields, hrResult: hrResultCached } = await resolveHrFields(
    orgId, leave.staff_id, leaveTypeId, leave.start_date, leave.end_date,
  )

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
  revalidatePath("/schedule")

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

  const leaveTypeId = formData.get("leave_type_id") as string | null
  const { hrFields } = await resolveHrFields(
    orgId, leave.staff_id, leaveTypeId, leave.start_date, leave.end_date,
  )

  const { error } = await supabase
    .from("leaves")
    .update({ ...leave, ...hrFields })
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
  revalidatePath("/schedule") // clearRotaAssignmentsForLeave modifies the schedule
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

  const { hrFields, hrResult: hrResultCached } = await resolveHrFields(
    orgId, params.staffId, params.leaveTypeId ?? null, params.startDate, params.endDate,
  )

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

  revalidatePath("/schedule")
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
  revalidatePath("/schedule")
  return {}
}
