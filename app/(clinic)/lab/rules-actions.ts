"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { RotaRuleInsert, RotaRuleUpdate } from "@/lib/types/database"

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
}

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
    .single()
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return { rule: rule as import("@/lib/types/database").RotaRule }
}

export async function updateRule(
  id: string,
  data: RotaRuleUpdate
): Promise<{ error?: string; rule?: import("@/lib/types/database").RotaRule }> {
  const supabase = await createClient()
  const { data: rule, error } = await supabase
    .from("rota_rules")
    .update(data as never)
    .eq("id", id)
    .select()
    .single()
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return { rule: rule as import("@/lib/types/database").RotaRule }
}

export async function deleteRule(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_rules")
    .delete()
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

export async function toggleRule(
  id: string,
  enabled: boolean
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from("rota_rules")
    .update({ enabled } as never)
    .eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}
