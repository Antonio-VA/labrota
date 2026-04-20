"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { HolidayBalance, HolidayConfig } from "@/lib/types/database"
import { requireOrgEditor } from "./_shared"

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

  const { error } = await admin.from("holiday_balance").upsert(
    {
      organisation_id: orgId,
      staff_id: params.staff_id,
      leave_type_id: params.leave_type_id,
      year: params.year,
      entitlement: params.entitlement,
      carried_forward: params.carried_forward ?? 0,
      cf_expiry_date: params.cf_expiry_date ?? null,
      manual_adjustment: params.manual_adjustment ?? 0,
      manual_adjustment_notes: params.manual_adjustment_notes ?? null,
    },
    { onConflict: "organisation_id,staff_id,leave_type_id,year" }
  )
  if (error) return { error: error.message }

  revalidatePath("/settings")
  revalidatePath("/staff")
  return {}
}

export async function generateBalancesForYear(year: number): Promise<{ created: number; skipped: number; error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  const [staffRes, typesRes, existingRes] = await Promise.all([
    admin.from("staff").select("id").eq("organisation_id", orgId).neq("onboarding_status", "inactive") as unknown as Promise<{ data: Array<{ id: string }> | null }>,
    admin.from("company_leave_types").select("id, default_days").eq("organisation_id", orgId).eq("has_balance", true).eq("is_archived", false) as unknown as Promise<{ data: Array<{ id: string; default_days: number | null }> | null }>,
    admin.from("holiday_balance").select("staff_id, leave_type_id").eq("organisation_id", orgId).eq("year", year) as unknown as Promise<{ data: Array<{ staff_id: string; leave_type_id: string }> | null }>,
  ])

  const staffList = staffRes.data
  const leaveTypes = typesRes.data
  const existingBalances = existingRes.data

  if (!staffList?.length) return { created: 0, skipped: 0 }
  if (!leaveTypes?.length) return { created: 0, skipped: 0 }

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
    carried_forward: number
    cf_expiry_date: string | null
    manual_adjustment: number
    manual_adjustment_notes: string | null
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
        carried_forward: 0,
        cf_expiry_date: null,
        manual_adjustment: 0,
        manual_adjustment_notes: null,
      })
      created++
    }
  }

  if (inserts.length > 0) {
    const batches: typeof inserts[] = []
    for (let i = 0; i < inserts.length; i += 100) {
      batches.push(inserts.slice(i, i + 100))
    }
    const results = await Promise.all(batches.map((b) => admin.from("holiday_balance").insert(b)))
    const firstError = results.find((r) => r.error)
    if (firstError?.error) return { created: 0, skipped: 0, error: firstError.error.message }
  }

  revalidatePath("/settings")
  return { created, skipped }
}

export async function rollOverCarryForward(fromYear: number): Promise<{ processed: number; error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  const toYear = fromYear + 1

  const { data: config } = await admin
    .from("holiday_config")
    .select("*")
    .eq("organisation_id", orgId)
    .single() as { data: HolidayConfig | null }

  if (!config || !config.carry_forward_allowed) {
    return { processed: 0, error: "Carry forward is not enabled" }
  }

  const { data: cfTypes } = await admin
    .from("company_leave_types")
    .select("id, default_days")
    .eq("organisation_id", orgId)
    .eq("allows_carry_forward", true)
    .eq("is_archived", false) as { data: Array<{ id: string; default_days: number | null }> | null }

  if (!cfTypes?.length) return { processed: 0 }
  const cfTypeIds = cfTypes.map((t) => t.id)

  const [fromBalancesRes, leaveEntriesRes, toBalancesRes] = await Promise.all([
    admin.from("holiday_balance").select("*").eq("organisation_id", orgId).eq("year", fromYear).in("leave_type_id", cfTypeIds) as unknown as Promise<{ data: HolidayBalance[] | null }>,
    admin.from("leaves").select("staff_id, leave_type_id, days_counted").eq("organisation_id", orgId).eq("balance_year", fromYear).in("status", ["approved", "pending"]).in("leave_type_id", cfTypeIds) as unknown as Promise<{ data: Array<{ staff_id: string; leave_type_id: string; days_counted: number | null }> | null }>,
    admin.from("holiday_balance").select("id, staff_id, leave_type_id").eq("organisation_id", orgId).eq("year", toYear).in("leave_type_id", cfTypeIds) as unknown as Promise<{ data: Array<{ id: string; staff_id: string; leave_type_id: string }> | null }>,
  ])

  const fromBalances = fromBalancesRes.data
  const leaveEntries = leaveEntriesRes.data
  const toBalances = toBalancesRes.data

  if (!fromBalances?.length) return { processed: 0 }

  const usageMap = new Map<string, number>()
  for (const entry of leaveEntries ?? []) {
    const key = `${entry.staff_id}:${entry.leave_type_id}`
    usageMap.set(key, (usageMap.get(key) ?? 0) + (entry.days_counted ?? 0))
  }

  const toBalanceMap = new Map<string, string>()
  for (const tb of toBalances ?? []) {
    toBalanceMap.set(`${tb.staff_id}:${tb.leave_type_id}`, tb.id)
  }

  const cfExpiryDate = `${toYear}-${String(config.carry_forward_expiry_month).padStart(2, "0")}-${String(config.carry_forward_expiry_day).padStart(2, "0")}`

  const updates: { id: string; cfDays: number }[] = []
  const inserts: Array<{
    organisation_id: string
    staff_id: string
    leave_type_id: string
    year: number
    entitlement: number
    carried_forward: number
    cf_expiry_date: string
    manual_adjustment: number
    manual_adjustment_notes: string | null
  }> = []

  for (const balance of fromBalances) {
    const key = `${balance.staff_id}:${balance.leave_type_id}`
    const used = usageMap.get(key) ?? 0
    const remaining = balance.entitlement + balance.carried_forward + balance.manual_adjustment - used
    const cfDays = Math.min(Math.max(remaining, 0), config.max_carry_forward_days)

    if (cfDays <= 0) continue

    const existingId = toBalanceMap.get(key)
    if (existingId) {
      updates.push({ id: existingId, cfDays })
    } else {
      const leaveType = cfTypes.find((t) => t.id === balance.leave_type_id)
      inserts.push({
        organisation_id: orgId,
        staff_id: balance.staff_id,
        leave_type_id: balance.leave_type_id,
        year: toYear,
        entitlement: leaveType?.default_days ?? 0,
        carried_forward: cfDays,
        cf_expiry_date: cfExpiryDate,
        manual_adjustment: 0,
        manual_adjustment_notes: null,
      })
    }
  }

  await Promise.all([
    ...updates.map((u) =>
      admin.from("holiday_balance").update({ carried_forward: u.cfDays, cf_expiry_date: cfExpiryDate }).eq("id", u.id)
    ),
    ...(inserts.length > 0 ? [admin.from("holiday_balance").insert(inserts)] : []),
  ])

  revalidatePath("/settings")
  return { processed: updates.length + inserts.length }
}
