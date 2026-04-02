"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { RotaRuleInsert, RotaRuleUpdate } from "@/lib/types/database"
import { getOrgId } from "@/lib/get-org-id"
import { orgStaticTag } from "@/lib/org-context-cache"

export async function createRule(
  data: Omit<RotaRuleInsert, "organisation_id">
): Promise<{ error?: string; rule?: import("@/lib/types/database").RotaRule }> {
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }
  const supabase = await createClient()
  const { data: rule, error } = await supabase
    .from("rota_rules")
    .insert({ ...data, organisation_id: orgId } as never)
    .select()
    .maybeSingle()
  if (error) return { error: error.message }
  if (!rule) return { error: "Rule was not created — check database permissions." }
  revalidateTag(orgStaticTag(orgId))
  revalidatePath("/lab")
  return { rule: rule as import("@/lib/types/database").RotaRule }
}

export async function updateRule(
  id: string,
  data: RotaRuleUpdate
): Promise<{ error?: string; rule?: import("@/lib/types/database").RotaRule }> {
  const [supabase, orgId] = await Promise.all([createClient(), getOrgId()])
  const { data: rule, error } = await supabase
    .from("rota_rules")
    .update(data as never)
    .eq("id", id)
    .select()
    .maybeSingle()
  if (error) return { error: error.message }
  if (!rule) return { error: "Rule not found or permission denied." }
  if (orgId) revalidateTag(orgStaticTag(orgId))
  revalidatePath("/lab")
  return { rule: rule as import("@/lib/types/database").RotaRule }
}

export async function deleteRule(id: string): Promise<{ error?: string }> {
  const [supabase, orgId] = await Promise.all([createClient(), getOrgId()])
  const { error } = await supabase
    .from("rota_rules")
    .delete()
    .eq("id", id)
  if (error) return { error: error.message }
  if (orgId) revalidateTag(orgStaticTag(orgId))
  revalidatePath("/lab")
  return {}
}

export async function toggleRule(
  id: string,
  enabled: boolean
): Promise<{ error?: string }> {
  const [supabase, orgId] = await Promise.all([createClient(), getOrgId()])
  const { error } = await supabase
    .from("rota_rules")
    .update({ enabled } as never)
    .eq("id", id)
  if (error) return { error: error.message }
  if (orgId) revalidateTag(orgStaticTag(orgId))
  revalidatePath("/lab")
  return {}
}
