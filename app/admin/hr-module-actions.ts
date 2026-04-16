"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser } from "@/lib/auth-cache"
import { DEFAULT_LEAVE_TYPES } from "@/lib/hr-balance-engine"
import type { HrModule, CompanyLeaveType, HolidayConfig, HolidayBalance } from "@/lib/types/database"

// ── HR Module Status ─────────────────────────────────────────────────────────

export async function getAdminHrModuleStatus(orgId: string): Promise<{
  installed: boolean
  active: boolean
  installedAt: string | null
  record: HrModule | null
}> {
  const admin = createAdminClient()
  const { data } = await admin
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

// ── Install HR Module ────────────────────────────────────────────────────────

export async function adminInstallHrModule(orgId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: "Not authenticated" }

  const admin = createAdminClient()

  // Check if already exists
  const { data: existing } = await admin
    .from("hr_module")
    .select("id, status")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { id: string; status: string } | null }

  if (existing && existing.status === "active") {
    return { error: "HR module already active" }
  }

  // Reactivate if previously removed
  if (existing && existing.status === "inactive") {
    await admin.from("hr_module").update({ status: "active", removed_at: null, removed_by: null }).eq("id", existing.id)
    revalidatePath(`/orgs/${orgId}`)
    return {}
  }

  // First install
  const { error: insertError } = await admin.from("hr_module").insert({
    organisation_id: orgId,
    status: "active",
    installed_by: user.id,
  })
  if (insertError) return { error: insertError.message }

  // Create holiday_config with defaults
  await admin.from("holiday_config").insert({ organisation_id: orgId })

  // Auto-enable leave requests
  await admin.from("lab_config").update({ enable_leave_requests: true }).eq("organisation_id", orgId)

  // Seed default leave types
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

  const { data: insertedTypes } = await admin
    .from("company_leave_types")
    .insert(leaveTypeInserts)
    .select("id, name") as { data: Array<{ id: string; name: string }> | null }

  // Link overflow types
  if (insertedTypes) {
    const sickType = insertedTypes.find((t) => t.name === "Baja por enfermedad")
    const unpaidSickType = insertedTypes.find((t) => t.name === "Baja no remunerada")
    if (sickType && unpaidSickType) {
      await admin.from("company_leave_types").update({ overflow_to_type_id: unpaidSickType.id }).eq("id", sickType.id)
    }
  }

  revalidatePath(`/orgs/${orgId}`)
  return {}
}

// ── Remove HR Module ─────────────────────────────────────────────────────────

export async function adminRemoveHrModule(orgId: string): Promise<{ error?: string }> {
  const user = await getAuthUser()
  if (!user) return { error: "Not authenticated" }

  const admin = createAdminClient()
  const { error } = await admin
    .from("hr_module")
    .update({ status: "inactive", removed_at: new Date().toISOString(), removed_by: user.id })
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }
  revalidatePath(`/orgs/${orgId}`)
  return {}
}

// ── Delete All HR Data ───────────────────────────────────────────────────────

export async function adminDeleteAllHrData(orgId: string): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { data: mod } = await admin
    .from("hr_module")
    .select("status")
    .eq("organisation_id", orgId)
    .single() as { data: { status: string } | null }

  if (mod?.status === "active") {
    return { error: "Remove the HR module before deleting data" }
  }

  // Clear HR fields from leaves
  await admin
    .from("leaves")
    .update({ leave_type_id: null, days_counted: null, balance_year: null, uses_cf_days: false, cf_days_used: 0, parent_leave_id: null })
    .eq("organisation_id", orgId)
    .not("leave_type_id", "is", null)

  // Delete in FK order
  await admin.from("holiday_balance").delete().eq("organisation_id", orgId)
  await admin.from("holiday_config").delete().eq("organisation_id", orgId)
  await admin.from("company_leave_types").delete().eq("organisation_id", orgId)
  await admin.from("hr_module").delete().eq("organisation_id", orgId)

  revalidatePath(`/orgs/${orgId}`)
  return {}
}

// ── Get Company Leave Types ──────────────────────────────────────────────────

export async function adminGetCompanyLeaveTypes(orgId: string): Promise<CompanyLeaveType[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("company_leave_types")
    .select("*")
    .eq("organisation_id", orgId)
    .order("sort_order") as { data: CompanyLeaveType[] | null }
  return data ?? []
}

// ── Holiday Config ───────────────────────────────────────────────────────────

export async function adminGetHolidayConfig(orgId: string): Promise<HolidayConfig | null> {
  const admin = createAdminClient()
  const { data } = await admin
    .from("holiday_config")
    .select("*")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: HolidayConfig | null }
  return data
}

export async function adminUpdateHolidayConfig(
  orgId: string,
  params: Partial<Omit<HolidayConfig, "id" | "organisation_id" | "created_at" | "updated_at">>
): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin.from("holiday_config").update(params).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/orgs/${orgId}`)
  return {}
}

// ── CRUD Company Leave Types ─────────────────────────────────────────────────

export async function adminCreateCompanyLeaveType(orgId: string, params: {
  name: string
  name_en?: string
  has_balance: boolean
  default_days: number | null
  allows_carry_forward: boolean
  overflow_to_type_id: string | null
  is_paid: boolean
  color: string
}): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { data: maxSort } = await admin
    .from("company_leave_types")
    .select("sort_order")
    .eq("organisation_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1) as { data: Array<{ sort_order: number }> | null }

  const { error } = await admin.from("company_leave_types").insert({
    organisation_id: orgId,
    name: params.name,
    name_en: params.name_en ?? null,
    has_balance: params.has_balance,
    default_days: params.default_days,
    allows_carry_forward: params.allows_carry_forward,
    overflow_to_type_id: params.overflow_to_type_id,
    is_paid: params.is_paid,
    color: params.color,
    is_archived: false,
    sort_order: (maxSort?.[0]?.sort_order ?? -1) + 1,
  })

  if (error) return { error: error.message }
  revalidatePath(`/orgs/${orgId}`)
  return {}
}

export async function adminUpdateCompanyLeaveType(
  id: string,
  params: Partial<{
    name: string
    name_en: string
    has_balance: boolean
    default_days: number | null
    allows_carry_forward: boolean
    overflow_to_type_id: string | null
    is_paid: boolean
    color: string
    is_archived: boolean
  }>
): Promise<{ error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin.from("company_leave_types").update(params).eq("id", id)
  if (error) return { error: error.message }
  return {}
}

// ── Generate Balances ────────────────────────────────────────────────────────

export async function adminGenerateBalancesForYear(orgId: string, year: number): Promise<{ created: number; updated: number; error?: string }> {
  const admin = createAdminClient()

  const { data: staffList } = await admin
    .from("staff").select("id").eq("organisation_id", orgId).neq("onboarding_status", "inactive") as { data: Array<{ id: string }> | null }
  if (!staffList?.length) return { created: 0, updated: 0 }

  const { data: leaveTypes } = await admin
    .from("company_leave_types").select("id, default_days").eq("organisation_id", orgId).eq("has_balance", true).eq("is_archived", false) as { data: Array<{ id: string; default_days: number | null }> | null }
  if (!leaveTypes?.length) return { created: 0, updated: 0 }

  const { data: existing } = await admin
    .from("holiday_balance").select("id, staff_id, leave_type_id").eq("organisation_id", orgId).eq("year", year) as { data: Array<{ id: string; staff_id: string; leave_type_id: string }> | null }

  const existingMap = new Map((existing ?? []).map((b) => [`${b.staff_id}:${b.leave_type_id}`, b.id]))

  let created = 0, updated = 0
  const inserts: Array<{ organisation_id: string; staff_id: string; leave_type_id: string; year: number; entitlement: number; carried_forward: number; cf_expiry_date: string | null; manual_adjustment: number; manual_adjustment_notes: string | null }> = []
  const updatePromises: PromiseLike<unknown>[] = []

  for (const staff of staffList) {
    for (const lt of leaveTypes) {
      const key = `${staff.id}:${lt.id}`
      const existingId = existingMap.get(key)
      const entitlement = lt.default_days ?? 0
      if (existingId) {
        updatePromises.push(
          admin.from("holiday_balance").update({ entitlement }).eq("id", existingId).then()
        )
        updated++
      } else {
        inserts.push({ organisation_id: orgId, staff_id: staff.id, leave_type_id: lt.id, year, entitlement, carried_forward: 0, cf_expiry_date: null, manual_adjustment: 0, manual_adjustment_notes: null })
        created++
      }
    }
  }

  // Run updates in parallel, inserts in batches
  const results = await Promise.all(updatePromises)
  const updateError = (results as Array<{ error?: { message: string } | null }>).find((r) => r.error)?.error
  if (updateError) return { created: 0, updated: 0, error: updateError.message }

  for (let i = 0; i < inserts.length; i += 100) {
    const { error } = await admin.from("holiday_balance").insert(inserts.slice(i, i + 100))
    if (error) return { created, updated: 0, error: error.message }
  }

  revalidatePath(`/orgs/${orgId}`)
  return { created, updated }
}

// ── Roll Over Carry-Forward ──────────────────────────────────────────────────

export async function adminRollOverCarryForward(orgId: string, fromYear: number): Promise<{ processed: number; error?: string }> {
  const admin = createAdminClient()
  const toYear = fromYear + 1

  const { data: config } = await admin
    .from("holiday_config").select("*").eq("organisation_id", orgId).single() as { data: HolidayConfig | null }

  if (!config?.carry_forward_allowed) return { processed: 0, error: "Carry forward is not enabled" }

  const { data: cfTypes } = await admin
    .from("company_leave_types").select("id, default_days").eq("organisation_id", orgId).eq("allows_carry_forward", true).eq("is_archived", false) as { data: Array<{ id: string; default_days: number | null }> | null }
  if (!cfTypes?.length) return { processed: 0 }

  const { data: fromBalances } = await admin
    .from("holiday_balance").select("*").eq("organisation_id", orgId).eq("year", fromYear).in("leave_type_id", cfTypes.map((t) => t.id)) as { data: HolidayBalance[] | null }
  if (!fromBalances?.length) return { processed: 0 }

  const { data: leaveEntries } = await admin
    .from("leaves").select("staff_id, leave_type_id, days_counted").eq("organisation_id", orgId).eq("balance_year", fromYear).in("status", ["approved", "pending"]).in("leave_type_id", cfTypes.map((t) => t.id)) as { data: Array<{ staff_id: string; leave_type_id: string; days_counted: number | null }> | null }

  const usageMap = new Map<string, number>()
  for (const e of leaveEntries ?? []) {
    const k = `${e.staff_id}:${e.leave_type_id}`
    usageMap.set(k, (usageMap.get(k) ?? 0) + (e.days_counted ?? 0))
  }

  const cfExpiryDate = `${toYear}-${String(config.carry_forward_expiry_month).padStart(2, "0")}-${String(config.carry_forward_expiry_day).padStart(2, "0")}`

  let processed = 0
  for (const bal of fromBalances) {
    const used = usageMap.get(`${bal.staff_id}:${bal.leave_type_id}`) ?? 0
    const remaining = bal.entitlement + bal.carried_forward + bal.manual_adjustment - used
    const cfDays = Math.min(Math.max(remaining, 0), config.max_carry_forward_days)
    if (cfDays <= 0) continue

    const { data: toBalance } = await admin
      .from("holiday_balance").select("id").eq("organisation_id", orgId).eq("staff_id", bal.staff_id).eq("leave_type_id", bal.leave_type_id).eq("year", toYear).maybeSingle() as { data: { id: string } | null }

    if (toBalance) {
      await admin.from("holiday_balance").update({ carried_forward: cfDays, cf_expiry_date: cfExpiryDate }).eq("id", toBalance.id)
    } else {
      const lt = cfTypes.find((t) => t.id === bal.leave_type_id)
      await admin.from("holiday_balance").insert({ organisation_id: orgId, staff_id: bal.staff_id, leave_type_id: bal.leave_type_id, year: toYear, entitlement: lt?.default_days ?? 0, carried_forward: cfDays, cf_expiry_date: cfExpiryDate, manual_adjustment: 0, manual_adjustment_notes: null })
    }
    processed++
  }

  revalidatePath(`/orgs/${orgId}`)
  return { processed }
}
