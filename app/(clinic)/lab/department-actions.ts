"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"

export async function saveDepartments(
  departments: {
    id?: string; code: string; name: string; name_en: string
    abbreviation: string; colour: string; is_default: boolean; sort_order: number
  }[]
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  for (const dept of departments) {
    if (dept.id) {
      // Update existing
      const { error } = await supabase
        .from("departments")
        .update({
          name: dept.name,
          name_en: dept.name_en,
          abbreviation: dept.abbreviation,
          colour: dept.colour,
          sort_order: dept.sort_order,
        } as never)
        .eq("id", dept.id)
      if (error) return { error: error.message }
    } else {
      // Insert new
      const { error } = await supabase
        .from("departments")
        .insert({
          organisation_id: orgId,
          code: dept.code,
          name: dept.name,
          name_en: dept.name_en,
          abbreviation: dept.abbreviation,
          colour: dept.colour,
          is_default: false,
          sort_order: dept.sort_order,
        } as never)
      if (error) return { error: error.message }
    }
  }

  revalidatePath("/lab")
  revalidatePath("/")
  return {}
}
