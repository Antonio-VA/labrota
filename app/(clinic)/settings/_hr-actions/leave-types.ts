"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { CompanyLeaveType, LeaveType } from "@/lib/types/database"
import { requireOrgEditor } from "./_shared"

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

  const { data: maxSort } = await admin
    .from("company_leave_types")
    .select("sort_order")
    .eq("organisation_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1) as { data: Array<{ sort_order: number }> | null }

  const sortOrder = (maxSort?.[0]?.sort_order ?? -1) + 1

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

export async function mapLegacyLeaveType(
  legacyType: string,
  companyLeaveTypeId: string
): Promise<{ updated: number; error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  const { data, error } = await admin
    .from("leaves")
    .update({ leave_type_id: companyLeaveTypeId })
    .eq("organisation_id", orgId)
    .eq("type", legacyType as LeaveType)
    .is("leave_type_id", null)
    .select("id") as { data: Array<{ id: string }> | null; error: { message: string } | null }

  if (error) return { updated: 0, error: error.message }
  revalidatePath("/leaves")
  return { updated: data?.length ?? 0 }
}
