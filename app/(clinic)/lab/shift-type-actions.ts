"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ShiftTypeDefinition } from "@/lib/types/database"

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
}

export async function getShiftTypes(): Promise<ShiftTypeDefinition[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("shift_types")
    .select("*")
    .order("sort_order")
  return (data ?? []) as ShiftTypeDefinition[]
}

export async function saveShiftTypes(
  types: Omit<ShiftTypeDefinition, 'id' | 'created_at' | 'organisation_id'>[]
): Promise<{ error?: string }> {
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }
  const supabase = await createClient()

  // Delete all existing shift types for this org and re-insert in order
  const { error: delError } = await supabase
    .from("shift_types")
    .delete()
    .eq("organisation_id", orgId)
  if (delError) return { error: delError.message }

  if (types.length > 0) {
    const rows = types.map((t, i) => ({
      ...t,
      organisation_id: orgId,
      sort_order: i,
    }))
    const { error: insError } = await supabase
      .from("shift_types")
      .insert(rows as never)
    if (insError) return { error: insError.message }
  }

  revalidatePath("/lab")
  revalidatePath("/")
  return {}
}

export async function countAssignmentsForShift(code: string): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from("rota_assignments")
    .select("*", { count: "exact", head: true })
    .eq("shift_type", code) as { count: number | null }
  return count ?? 0
}
