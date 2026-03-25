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
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }
  const supabase = await createClient()

  if (types.length > 0) {
    // Build rows — strip active_days if column might not exist yet
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

    // Try insert first to verify schema compatibility BEFORE deleting
    const testRow = { ...rows[0] }
    const { error: testError } = await supabase
      .from("shift_types")
      .insert(testRow as never)
      .select("id")
      .single()

    if (testError) {
      // If active_days column doesn't exist, retry without it
      if (testError.message?.includes("active_days")) {
        const rowsWithout = rows.map(({ active_days, ...rest }) => rest)
        // Safe to delete now — we know the insert will work
        await supabase.from("shift_types").delete().eq("organisation_id", orgId)
        const { error: insError } = await supabase.from("shift_types").insert(rowsWithout as never)
        if (insError) return { error: insError.message }
      } else {
        return { error: testError.message }
      }
    } else {
      // Test insert succeeded — delete all old ones and insert the rest
      // First delete the test row we just inserted
      await supabase.from("shift_types").delete().eq("organisation_id", orgId)
      const { error: insError } = await supabase.from("shift_types").insert(rows as never)
      if (insError) return { error: insError.message }
    }
  } else {
    // No types — just delete all
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
