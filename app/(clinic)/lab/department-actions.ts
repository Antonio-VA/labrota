"use server"

import { revalidatePath } from "next/cache"
import { withOrgId } from "@/lib/with-org-id"

export async function saveDepartments(
  departments: {
    id?: string; code: string; name: string; name_en: string
    abbreviation: string; colour: string; is_default: boolean; sort_order: number
    parent_id?: string | null
  }[],
  deleteIds: string[] = []
): Promise<{ error?: string }> {
  return withOrgId(async (orgId, supabase) => {
    // Delete removed departments
    for (const id of deleteIds) {
      await supabase.from("departments").delete().eq("id", id).eq("organisation_id", orgId)
    }

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
            parent_id: dept.parent_id ?? null,
          })
          .eq("id", dept.id)
          .eq("organisation_id", orgId)
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
            parent_id: dept.parent_id ?? null,
          })
        if (error) return { error: error.message }
      }
    }

    revalidatePath("/lab")
    revalidatePath("/")
    return {}
  })
}

export async function seedDefaultDepartments(): Promise<{ seeded: boolean; error?: string } | { error: string }> {
  return withOrgId(async (orgId, supabase) => {
    // Delete existing departments for this org
    await supabase.from("departments").delete().eq("organisation_id", orgId)

    const defaults = [
      { code: "lab",       name: "Embriología",     name_en: "Embryology",     abbreviation: "EM", colour: "#60A5FA", is_default: true, sort_order: 0 },
      { code: "andrology", name: "Andrología",       name_en: "Andrology",      abbreviation: "AN", colour: "#34D399", is_default: true, sort_order: 1 },
      { code: "admin",     name: "Administración",   name_en: "Administration", abbreviation: "AD", colour: "#94A3B8", is_default: true, sort_order: 2 },
    ]

    const { error } = await supabase
      .from("departments")
      .insert(defaults.map((d) => ({ ...d, organisation_id: orgId })))

    if (error) return { seeded: false, error: error.message }
    revalidatePath("/lab")
    revalidatePath("/")
    return { seeded: true }
  })
}
