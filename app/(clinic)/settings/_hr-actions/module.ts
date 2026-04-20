"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import { DEFAULT_LEAVE_TYPES } from "@/lib/hr-balance-engine"
import type { HrModule } from "@/lib/types/database"
import { requireOrgEditor } from "./_shared"

export async function getHrModuleStatus(): Promise<{
  installed: boolean
  active: boolean
  installedAt: string | null
  record: HrModule | null
}> {
  const orgId = await getOrgId()
  if (!orgId) return { installed: false, active: false, installedAt: null, record: null }

  const supabase = await createClient()
  const { data } = await supabase
    .from("hr_module")
    .select("*")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: HrModule | null }

  if (!data) return { installed: false, active: false, installedAt: null, record: null }

  return {
    installed: true,
    active: data.status === "active",
    installedAt: data.installed_at,
    record: data,
  }
}

export async function installHrModule(): Promise<{ error?: string }> {
  const { user, orgId, admin } = await requireOrgEditor()

  const { data: existing } = await admin
    .from("hr_module")
    .select("id, status")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { id: string; status: string } | null }

  if (existing && existing.status === "active") {
    return { error: "HR module already active" }
  }

  if (existing && existing.status === "inactive") {
    const { error } = await admin
      .from("hr_module")
      .update({
        status: "active",
        removed_at: null,
        removed_by: null,
      })
      .eq("id", existing.id)
    if (error) return { error: error.message }
    revalidatePath("/settings")
    return {}
  }

  const { error: insertError } = await admin.from("hr_module").insert({
    organisation_id: orgId,
    status: "active",
    installed_by: user.id,
  })
  if (insertError) return { error: insertError.message }

  const { error: configError } = await admin.from("holiday_config").insert({
    organisation_id: orgId,
  })
  if (configError) return { error: configError.message }

  await admin.from("lab_config").update({ enable_leave_requests: true }).eq("organisation_id", orgId)

  const leaveTypeInserts = DEFAULT_LEAVE_TYPES.map((lt) => ({
    organisation_id: orgId,
    name: lt.name,
    name_en: lt.name_en ?? null,
    has_balance: lt.has_balance,
    default_days: lt.default_days,
    allows_carry_forward: lt.allows_carry_forward,
    is_paid: lt.is_paid,
    color: lt.color,
    sort_order: lt.sort_order,
    is_archived: false,
    overflow_to_type_id: null as string | null,
  }))

  const { data: insertedTypes, error: typesError } = await admin
    .from("company_leave_types")
    .insert(leaveTypeInserts)
    .select("id, name") as { data: Array<{ id: string; name: string }> | null; error: { message: string } | null }

  if (typesError) return { error: typesError.message }

  if (insertedTypes) {
    const sickType = insertedTypes.find((t) => t.name === "Baja por enfermedad")
    const unpaidSickType = insertedTypes.find((t) => t.name === "Baja no remunerada")
    if (sickType && unpaidSickType) {
      await admin
        .from("company_leave_types")
        .update({ overflow_to_type_id: unpaidSickType.id })
        .eq("id", sickType.id)
    }
  }

  revalidatePath("/settings")
  return {}
}

export async function removeHrModule(): Promise<{ error?: string }> {
  const { user, orgId, admin } = await requireOrgEditor()

  const { error } = await admin
    .from("hr_module")
    .update({
      status: "inactive",
      removed_at: new Date().toISOString(),
      removed_by: user.id,
    })
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}

export async function deleteAllHrData(): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  const { data: mod } = await admin
    .from("hr_module")
    .select("status")
    .eq("organisation_id", orgId)
    .single() as { data: { status: string } | null }

  if (mod?.status === "active") {
    return { error: "Remove the HR module before deleting data" }
  }

  // Clear leave_type_id from leaves (don't delete leaves themselves)
  await admin
    .from("leaves")
    .update({
      leave_type_id: null,
      days_counted: null,
      balance_year: null,
      uses_cf_days: false,
      cf_days_used: 0,
      parent_leave_id: null,
    })
    .eq("organisation_id", orgId)
    .not("leave_type_id", "is", null)

  // Delete in FK order
  await admin.from("holiday_balance").delete().eq("organisation_id", orgId)
  await admin.from("holiday_config").delete().eq("organisation_id", orgId)
  await admin.from("company_leave_types").delete().eq("organisation_id", orgId)
  await admin.from("hr_module").delete().eq("organisation_id", orgId)

  revalidatePath("/settings")
  return {}
}
