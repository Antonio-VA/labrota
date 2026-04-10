"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { getAuthUser } from "@/lib/auth-cache"
import { DEFAULT_LEAVE_TYPES } from "@/lib/hr-balance-engine"
import type {
  HrModule,
  CompanyLeaveType,
  HolidayConfig,
  HolidayBalance,
} from "@/lib/types/database"

// ── Auth helper ──────────────────────────────────────────────────────────────

async function requireOrgEditor() {
  const [user, orgId] = await Promise.all([getAuthUser(), getOrgId()])
  if (!user) throw new Error("Not authenticated")
  if (!orgId) throw new Error("No organisation")

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single() as { data: { role: string } | null }

  if (!membership || membership.role === "viewer") {
    throw new Error("Not authorised")
  }

  return { user, orgId, admin }
}

// ── HR Module Status ─────────────────────────────────────────────────────────

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

// ── Install HR Module ────────────────────────────────────────────────────────

export async function installHrModule(): Promise<{ error?: string }> {
  const { user, orgId, admin } = await requireOrgEditor()

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

  // First install — create hr_module record
  const { error: insertError } = await admin.from("hr_module").insert({
    organisation_id: orgId,
    status: "active",
    installed_by: user.id,
  })
  if (insertError) return { error: insertError.message }

  // Create holiday_config with defaults
  const { error: configError } = await admin.from("holiday_config").insert({
    organisation_id: orgId,
  })
  if (configError) return { error: configError.message }

  // Seed default leave types
  const leaveTypeInserts = DEFAULT_LEAVE_TYPES.map((lt) => ({
    organisation_id: orgId,
    name: lt.name,
    name_en: lt.name_en,
    has_balance: lt.has_balance,
    default_days: lt.default_days,
    allows_carry_forward: lt.allows_carry_forward,
    is_paid: lt.is_paid,
    color: lt.color,
    sort_order: lt.sort_order,
    overflow_to_type_id: null as string | null, // will link after insert
  }))

  const { data: insertedTypes, error: typesError } = await admin
    .from("company_leave_types")
    .insert(leaveTypeInserts)
    .select("id, name") as { data: Array<{ id: string; name: string }> | null; error: { message: string } | null }

  if (typesError) return { error: typesError.message }

  // Link overflow types (Sick Leave → Unpaid Sick Leave)
  if (insertedTypes) {
    const sickType = insertedTypes.find((t) => t.name === "Baja por enfermedad")
    const unpaidSickType = insertedTypes.find((t) => t.name === "Baja por enfermedad no remunerada")
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

// ── Remove HR Module ─────────────────────────────────────────────────────────

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

// ── Delete All HR Data ───────────────────────────────────────────────────────

export async function deleteAllHrData(): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  // Verify module is inactive
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

// ── Get Company Leave Types ──────────────────────────────────────────────────

export async function getCompanyLeaveTypes(): Promise<CompanyLeaveType[]> {
  const orgId = await getOrgId()
  if (!orgId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from("company_leave_types")
    .select("*")
    .eq("organisation_id", orgId)
    .order("sort_order") as { data: CompanyLeaveType[] | null }

  return data ?? []
}

// ── CRUD for Company Leave Types ─────────────────────────────────────────────

export async function createCompanyLeaveType(params: {
  name: string
  name_en?: string
  has_balance: boolean
  default_days: number | null
  allows_carry_forward: boolean
  overflow_to_type_id: string | null
  is_paid: boolean
  color: string
}): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  // Get next sort order
  const { data: maxSort } = await admin
    .from("company_leave_types")
    .select("sort_order")
    .eq("organisation_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1) as { data: Array<{ sort_order: number }> | null }

  const sortOrder = (maxSort?.[0]?.sort_order ?? -1) + 1

  const { error } = await admin.from("company_leave_types").insert({
    organisation_id: orgId,
    ...params,
    sort_order: sortOrder,
  })

  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}

export async function updateCompanyLeaveType(
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
    sort_order: number
  }>
): Promise<{ error?: string }> {
  const { admin } = await requireOrgEditor()

  const { error } = await admin
    .from("company_leave_types")
    .update(params)
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}

export async function archiveCompanyLeaveType(id: string): Promise<{ error?: string }> {
  return updateCompanyLeaveType(id, { is_archived: true })
}

export async function restoreCompanyLeaveType(id: string): Promise<{ error?: string }> {
  return updateCompanyLeaveType(id, { is_archived: false })
}

// ── Holiday Config ───────────────────────────────────────────────────────────

export async function getHolidayConfig(): Promise<HolidayConfig | null> {
  const orgId = await getOrgId()
  if (!orgId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from("holiday_config")
    .select("*")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: HolidayConfig | null }

  return data
}

export async function updateHolidayConfig(
  params: Partial<Omit<HolidayConfig, "id" | "organisation_id" | "created_at" | "updated_at">>
): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  const { error } = await admin
    .from("holiday_config")
    .update(params)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}

// ── Holiday Balances ─────────────────────────────────────────────────────────

export async function getStaffBalances(
  staffId: string,
  year: number
): Promise<HolidayBalance[]> {
  const orgId = await getOrgId()
  if (!orgId) return []

  const supabase = await createClient()
  const { data } = await supabase
    .from("holiday_balance")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("staff_id", staffId)
    .eq("year", year) as { data: HolidayBalance[] | null }

  return data ?? []
}

export async function upsertHolidayBalance(params: {
  staff_id: string
  leave_type_id: string
  year: number
  entitlement: number
  carried_forward?: number
  cf_expiry_date?: string | null
  manual_adjustment?: number
  manual_adjustment_notes?: string | null
}): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  // Check if record exists
  const { data: existing } = await admin
    .from("holiday_balance")
    .select("id")
    .eq("organisation_id", orgId)
    .eq("staff_id", params.staff_id)
    .eq("leave_type_id", params.leave_type_id)
    .eq("year", params.year)
    .maybeSingle() as { data: { id: string } | null }

  if (existing) {
    const { error } = await admin
      .from("holiday_balance")
      .update({
        entitlement: params.entitlement,
        carried_forward: params.carried_forward ?? 0,
        cf_expiry_date: params.cf_expiry_date ?? null,
        manual_adjustment: params.manual_adjustment ?? 0,
        manual_adjustment_notes: params.manual_adjustment_notes ?? null,
      })
      .eq("id", existing.id)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin.from("holiday_balance").insert({
      organisation_id: orgId,
      ...params,
      carried_forward: params.carried_forward ?? 0,
      cf_expiry_date: params.cf_expiry_date ?? null,
      manual_adjustment: params.manual_adjustment ?? 0,
      manual_adjustment_notes: params.manual_adjustment_notes ?? null,
    })
    if (error) return { error: error.message }
  }

  revalidatePath("/settings")
  revalidatePath("/staff")
  return {}
}

// ── Generate Balances for Year ───────────────────────────────────────────────

export async function generateBalancesForYear(year: number): Promise<{ created: number; skipped: number; error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  // Get all active staff
  const { data: staffList } = await admin
    .from("staff")
    .select("id")
    .eq("organisation_id", orgId)
    .neq("onboarding_status", "inactive") as { data: Array<{ id: string }> | null }

  if (!staffList?.length) return { created: 0, skipped: 0 }

  // Get leave types with balance tracking
  const { data: leaveTypes } = await admin
    .from("company_leave_types")
    .select("id, default_days")
    .eq("organisation_id", orgId)
    .eq("has_balance", true)
    .eq("is_archived", false) as { data: Array<{ id: string; default_days: number | null }> | null }

  if (!leaveTypes?.length) return { created: 0, skipped: 0 }

  // Get existing balances for this year
  const { data: existingBalances } = await admin
    .from("holiday_balance")
    .select("staff_id, leave_type_id")
    .eq("organisation_id", orgId)
    .eq("year", year) as { data: Array<{ staff_id: string; leave_type_id: string }> | null }

  const existingSet = new Set(
    (existingBalances ?? []).map((b) => `${b.staff_id}:${b.leave_type_id}`)
  )

  let created = 0
  let skipped = 0
  const inserts: Array<{
    organisation_id: string
    staff_id: string
    leave_type_id: string
    year: number
    entitlement: number
  }> = []

  for (const staff of staffList) {
    for (const lt of leaveTypes) {
      const key = `${staff.id}:${lt.id}`
      if (existingSet.has(key)) {
        skipped++
        continue
      }
      inserts.push({
        organisation_id: orgId,
        staff_id: staff.id,
        leave_type_id: lt.id,
        year,
        entitlement: lt.default_days ?? 0,
      })
      created++
    }
  }

  if (inserts.length > 0) {
    // Insert in batches of 100
    for (let i = 0; i < inserts.length; i += 100) {
      const batch = inserts.slice(i, i + 100)
      const { error } = await admin.from("holiday_balance").insert(batch)
      if (error) return { created: 0, skipped: 0, error: error.message }
    }
  }

  revalidatePath("/settings")
  return { created, skipped }
}

// ── Roll Over Carry-Forward ──────────────────────────────────────────────────

export async function rollOverCarryForward(fromYear: number): Promise<{ processed: number; error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  const toYear = fromYear + 1

  // Get holiday config for CF settings
  const { data: config } = await admin
    .from("holiday_config")
    .select("*")
    .eq("organisation_id", orgId)
    .single() as { data: HolidayConfig | null }

  if (!config || !config.carry_forward_allowed) {
    return { processed: 0, error: "Carry forward is not enabled" }
  }

  // Get leave types that allow CF
  const { data: cfTypes } = await admin
    .from("company_leave_types")
    .select("id, default_days")
    .eq("organisation_id", orgId)
    .eq("allows_carry_forward", true)
    .eq("is_archived", false) as { data: Array<{ id: string; default_days: number | null }> | null }

  if (!cfTypes?.length) return { processed: 0 }

  // Get balances for fromYear
  const { data: fromBalances } = await admin
    .from("holiday_balance")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("year", fromYear)
    .in("leave_type_id", cfTypes.map((t) => t.id)) as { data: HolidayBalance[] | null }

  if (!fromBalances?.length) return { processed: 0 }

  // Get leave entries for fromYear to calculate usage
  const { data: leaveEntries } = await admin
    .from("leaves")
    .select("staff_id, leave_type_id, days_counted")
    .eq("organisation_id", orgId)
    .eq("balance_year", fromYear)
    .in("status", ["approved", "pending"])
    .in("leave_type_id", cfTypes.map((t) => t.id)) as { data: Array<{ staff_id: string; leave_type_id: string; days_counted: number | null }> | null }

  // Calculate usage per staff/type
  const usageMap = new Map<string, number>()
  for (const entry of leaveEntries ?? []) {
    const key = `${entry.staff_id}:${entry.leave_type_id}`
    usageMap.set(key, (usageMap.get(key) ?? 0) + (entry.days_counted ?? 0))
  }

  const cfExpiryDate = `${toYear}-${String(config.carry_forward_expiry_month).padStart(2, "0")}-${String(config.carry_forward_expiry_day).padStart(2, "0")}`

  let processed = 0

  for (const balance of fromBalances) {
    const key = `${balance.staff_id}:${balance.leave_type_id}`
    const used = usageMap.get(key) ?? 0
    const remaining = balance.entitlement + balance.carried_forward + balance.manual_adjustment - used
    const cfDays = Math.min(Math.max(remaining, 0), config.max_carry_forward_days)

    if (cfDays <= 0) continue

    // Check if toYear balance exists
    const { data: toBalance } = await admin
      .from("holiday_balance")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("staff_id", balance.staff_id)
      .eq("leave_type_id", balance.leave_type_id)
      .eq("year", toYear)
      .maybeSingle() as { data: { id: string } | null }

    if (toBalance) {
      await admin
        .from("holiday_balance")
        .update({ carried_forward: cfDays, cf_expiry_date: cfExpiryDate })
        .eq("id", toBalance.id)
    } else {
      const leaveType = cfTypes.find((t) => t.id === balance.leave_type_id)
      await admin.from("holiday_balance").insert({
        organisation_id: orgId,
        staff_id: balance.staff_id,
        leave_type_id: balance.leave_type_id,
        year: toYear,
        entitlement: leaveType?.default_days ?? 0,
        carried_forward: cfDays,
        cf_expiry_date: cfExpiryDate,
      })
    }

    processed++
  }

  revalidatePath("/settings")
  return { processed }
}

// ── Map Legacy Leave Types ───────────────────────────────────────────────────

export async function mapLegacyLeaveType(
  legacyType: string,
  companyLeaveTypeId: string
): Promise<{ updated: number; error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  const { data, error } = await admin
    .from("leaves")
    .update({ leave_type_id: companyLeaveTypeId })
    .eq("organisation_id", orgId)
    .eq("type", legacyType)
    .is("leave_type_id", null)
    .select("id") as { data: Array<{ id: string }> | null; error: { message: string } | null }

  if (error) return { updated: 0, error: error.message }
  revalidatePath("/leaves")
  return { updated: data?.length ?? 0 }
}

// Re-export getOrgId for convenience
export { getOrgId }
