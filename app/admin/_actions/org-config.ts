"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertSuperAdmin } from "./_shared"

// ── updateOrgAuthMethod ───────────────────────────────────────────────────
const VALID_AUTH_METHODS = new Set(["otp", "password"])
const VALID_DISPLAY_MODES = new Set(["by_shift", "by_task"])

export async function updateOrgAuthMethod(orgId: string, method: "otp" | "password") {
  await assertSuperAdmin()
  if (!VALID_AUTH_METHODS.has(method)) {
    return { error: "Invalid auth method." }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ auth_method: method } as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── updateOrgRegional ──────────────────────────────────────────────────────
export async function updateOrgRegional(orgId: string, country: string, region: string, annualLeaveDays?: number, reduceBudgetOnHolidays?: boolean, defaultDaysPerWeek?: number, partTimeWeight?: number, internWeight?: number) {
  await assertSuperAdmin()

  const admin = createAdminClient()

  // Ensure lab_config exists
  const { data: existing } = await admin
    .from("lab_config")
    .select("organisation_id")
    .eq("organisation_id", orgId)
    .maybeSingle()

  const payload: Record<string, unknown> = { country, region, autonomous_community: region || null }
  if (annualLeaveDays !== undefined) payload.annual_leave_days = annualLeaveDays
  if (defaultDaysPerWeek !== undefined) payload.default_days_per_week = defaultDaysPerWeek
  if (reduceBudgetOnHolidays !== undefined) payload.public_holiday_reduce_budget = reduceBudgetOnHolidays
  if (partTimeWeight !== undefined) payload.part_time_weight = partTimeWeight
  if (internWeight !== undefined) payload.intern_weight = internWeight

  if (!existing) {
    payload.organisation_id = orgId
    const { error } = await admin
      .from("lab_config")
      .insert(payload as never)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from("lab_config")
      .update(payload as never)
      .eq("organisation_id", orgId)
    if (error) return { error: error.message }
  }

  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── updateOrgDisplayMode ──────────────────────────────────────────────────
export async function updateOrgDisplayMode(orgId: string, mode: "by_shift" | "by_task") {
  await assertSuperAdmin()
  if (!VALID_DISPLAY_MODES.has(mode)) {
    return { error: "Invalid display mode." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ rota_display_mode: mode } as never)
    .eq("id", orgId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}
export async function updateOrgBilling(orgId: string, data: { billing_start: string | null; billing_end: string | null; billing_fee: number | null }) {
  await assertSuperAdmin()
  if (data.billing_fee !== null && (!Number.isFinite(data.billing_fee) || data.billing_fee < 0)) {
    return { error: "Billing fee must be a non-negative number." }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update(data as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}
export async function resetOrgImplementation(orgId: string) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  // Full reset: wipe everything except the org record itself
  await admin.from("rota_assignments").delete().eq("organisation_id", orgId)
  await admin.from("rota_snapshots").delete().eq("organisation_id", orgId)
  await admin.from("rotas").delete().eq("organisation_id", orgId)
  await admin.from("staff_skills").delete().eq("organisation_id", orgId)
  await admin.from("leaves").delete().eq("organisation_id", orgId)
  await admin.from("staff").delete().eq("organisation_id", orgId)
  await admin.from("tecnicas").delete().eq("organisation_id", orgId)
  await admin.from("shift_types").delete().eq("organisation_id", orgId)
  await admin.from("departments").delete().eq("organisation_id", orgId)
  await admin.from("rota_rules").delete().eq("organisation_id", orgId)
  await admin.from("lab_config").update({ country: "", region: "", autonomous_community: null }).eq("organisation_id", orgId)
  await admin.from("implementation_steps").delete().eq("organisation_id", orgId)
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}
export async function updateOrgEngineConfig(orgId: string, config: {
  ai_optimal_version: string
  engine_hybrid_enabled: boolean
  engine_reasoning_enabled: boolean
  task_optimal_version: string
  task_hybrid_enabled: boolean
  task_reasoning_enabled: boolean
  daily_hybrid_limit: number
}) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update(config as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}
export async function updateOrgMaxStaff(orgId: string, maxStaff: number) {
  await assertSuperAdmin()
  if (!Number.isInteger(maxStaff) || maxStaff < 1 || maxStaff > 10000) {
    return { error: "Max staff must be an integer between 1 and 10000." }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ max_staff: maxStaff } as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}
