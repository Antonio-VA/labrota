"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { ShiftTypeDefinition } from "@/lib/types/database"
import { getOrgId } from "@/lib/get-org-id"

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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  if (types.length > 0) {
    const rows = types.map((t, i) => ({
      organisation_id: orgId,
      code: t.code,
      name_es: t.name_es,
      name_en: t.name_en,
      start_time: t.start_time,
      end_time: t.end_time,
      sort_order: i,
      active: t.active ?? true,
      ...(t.active_days ? { active_days: t.active_days } : {}),
    }))

    // Delete all existing, then insert new ones
    const { error: delError } = await supabase
      .from("shift_types")
      .delete()
      .eq("organisation_id", orgId)

    if (delError) return { error: delError.message }

    const { error: insError } = await supabase
      .from("shift_types")
      .insert(rows as never)

    if (insError) {
      // If active_days column doesn't exist yet, retry without it
      if (insError.message?.includes("active_days")) {
        const rowsWithout = rows.map(({ active_days, ...rest }) => rest)
        const { error: retryError } = await supabase
          .from("shift_types")
          .insert(rowsWithout as never)
        if (retryError) return { error: retryError.message }
      } else {
        return { error: insError.message }
      }
    }
  } else {
    await supabase.from("shift_types").delete().eq("organisation_id", orgId)
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
