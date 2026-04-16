"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { Tecnica } from "@/lib/types/database"
import { getOrgId } from "@/lib/get-org-id"

export async function getTecnicas(): Promise<Tecnica[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("tecnicas")
    .select("*")
    .order("orden")
    .order("created_at") as { data: Tecnica[] | null }
  return data ?? []
}

export async function saveTecnica(
  tecnica: Partial<Tecnica> & { nombre_es: string; nombre_en: string; codigo: string; color: string }
): Promise<{ id: string } | { error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  if (tecnica.id) {
    const { error } = await supabase
      .from("tecnicas")
      .update({
        nombre_es:      tecnica.nombre_es,
        nombre_en:      tecnica.nombre_en,
        codigo:         tecnica.codigo.toUpperCase().slice(0, 3),
        color:          tecnica.color,
        required_skill: tecnica.required_skill ?? null,
        department:     tecnica.department ?? "lab",
        typical_shifts: tecnica.typical_shifts ?? [],
        avoid_shifts:   tecnica.avoid_shifts ?? [],
        activa:         tecnica.activa ?? true,
        orden:          tecnica.orden ?? 0,
      })
      .eq("id", tecnica.id)
      .eq("organisation_id", orgId)
    if (error) return { error: error.message }
    revalidatePath("/lab")
    return { id: tecnica.id }
  }

  const { data, error } = await supabase
    .from("tecnicas")
    .insert({
      organisation_id: orgId,
      nombre_es:       tecnica.nombre_es,
      nombre_en:       tecnica.nombre_en,
      codigo:          tecnica.codigo.toUpperCase().slice(0, 3),
      color:           tecnica.color,
      required_skill:  tecnica.required_skill ?? null,
      department:      tecnica.department ?? "lab",
      typical_shifts:  tecnica.typical_shifts ?? [],
      avoid_shifts:    tecnica.avoid_shifts ?? [],
      activa:          tecnica.activa ?? true,
      orden:           tecnica.orden ?? 0,
    })
    .select("id")
    .single()

  if (error || !data) return { error: error?.message ?? "Failed to create técnica." }
  revalidatePath("/lab")
  return { id: (data as { id: string }).id }
}

export async function deleteTecnica(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  // Get the code before deleting so we can clean up staff_skills
  const { data: tec } = await supabase.from("tecnicas").select("codigo, organisation_id").eq("id", id).eq("organisation_id", orgId).single() as unknown as { data: { codigo: string; organisation_id: string } | null }
  const { error } = await supabase.from("tecnicas").delete().eq("id", id).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  // Clean up orphaned staff_skills referencing the deleted técnica code
  if (tec) {
    await supabase.from("staff_skills").delete().eq("skill", tec.codigo).eq("organisation_id", tec.organisation_id)
  }
  revalidatePath("/lab")
  revalidatePath("/staff")
  return {}
}

export async function reorderTecnicas(orderedIds: string[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Unauthorized" }
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("tecnicas").update({ orden: i }).eq("id", id).eq("organisation_id", orgId)
    )
  )
  revalidatePath("/lab")
  return {}
}

/** Bulk save: delete removed, upsert all, reorder — single server action call. */
export async function bulkSaveTecnicas(
  tecnicas: Array<Partial<Tecnica> & { nombre_es: string; nombre_en: string; codigo: string; color: string }>,
  deleteIds: string[]
): Promise<{ ids: string[]; error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { ids: [], error: "No organisation found." }

  // 1. Delete removed técnicas
  for (const id of deleteIds) {
    const { data: tec } = await supabase.from("tecnicas").select("codigo, organisation_id").eq("id", id).eq("organisation_id", orgId).single() as unknown as { data: { codigo: string; organisation_id: string } | null }
    await supabase.from("tecnicas").delete().eq("id", id).eq("organisation_id", orgId)
    if (tec) await supabase.from("staff_skills").delete().eq("skill", tec.codigo).eq("organisation_id", tec.organisation_id)
  }

  // 2. Upsert all técnicas
  const resultIds: string[] = []
  for (let i = 0; i < tecnicas.length; i++) {
    const t = tecnicas[i]
    const row = {
      nombre_es:      t.nombre_es,
      nombre_en:      t.nombre_en,
      codigo:         t.codigo.toUpperCase().slice(0, 3),
      color:          t.color,
      required_skill: t.required_skill ?? null,
      department:     t.department ?? "lab",
      typical_shifts: t.typical_shifts ?? [],
      avoid_shifts:   t.avoid_shifts ?? [],
      activa:         t.activa ?? true,
      orden:          i,
    }

    if (t.id) {
      await supabase.from("tecnicas").update(row).eq("id", t.id).eq("organisation_id", orgId)
      resultIds.push(t.id)
    } else {
      const { data, error } = await supabase
        .from("tecnicas")
        .insert({ ...row, organisation_id: orgId })
        .select("id")
        .single()
      if (error || !data) return { ids: [], error: error?.message ?? "Failed to create técnica." }
      resultIds.push((data as { id: string }).id)
    }
  }

  revalidatePath("/lab")
  revalidatePath("/staff")
  return { ids: resultIds }
}

// Seed canonical defaults — skips if org already has técnicas
export async function seedDefaultTecnicas(): Promise<{ seeded: boolean; error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { seeded: false, error: "No organisation found." }

  const { count } = await supabase
    .from("tecnicas")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", orgId)

  if (count && count > 0) return { seeded: false }

  const defaults: Array<{
    nombre_es: string; nombre_en: string; codigo: string; color: string
    department: string; activa: boolean; orden: number
  }> = [
    // Embriología
    { nombre_es: "ICSI",                         nombre_en: "ICSI",               codigo: "ICS", color: "blue",   department: "lab",       activa: true, orden: 0 },
    { nombre_es: "Biopsia",                      nombre_en: "Biopsy",             codigo: "BX",  color: "purple", department: "lab",       activa: true, orden: 1 },
    { nombre_es: "Punción folicular",            nombre_en: "Egg collection",     codigo: "OPU", color: "amber",  department: "lab",       activa: true, orden: 2 },
    { nombre_es: "Transferencia",                nombre_en: "Embryo transfer",    codigo: "ET",  color: "green",  department: "lab",       activa: true, orden: 3 },
    { nombre_es: "Denudación",                   nombre_en: "Denudation",         codigo: "DEN", color: "teal",   department: "lab",       activa: true, orden: 4 },
    { nombre_es: "Vitrificación",                nombre_en: "Vitrification",      codigo: "VIT", color: "blue",   department: "lab",       activa: true, orden: 5 },
    // Andrología
    { nombre_es: "Congelación",                  nombre_en: "Sperm freezing",     codigo: "CNG", color: "slate",  department: "andrology", activa: true, orden: 6 },
    { nombre_es: "Análisis seminal",             nombre_en: "Semen analysis",     codigo: "SEM", color: "purple", department: "andrology", activa: true, orden: 7 },
    // Embriología (continued)
    { nombre_es: "Tubing",                       nombre_en: "Tubing",             codigo: "TUB", color: "teal",   department: "lab",       activa: true, orden: 8 },
    { nombre_es: "Preparación",                  nombre_en: "Sperm preparation",  codigo: "PRE", color: "blue",   department: "andrology", activa: true, orden: 9 },
    { nombre_es: "Descongelación",               nombre_en: "Thawing",            codigo: "TW",  color: "slate",  department: "lab",       activa: true, orden: 10 },
    { nombre_es: "Control de calidad",           nombre_en: "Morning check list", codigo: "QC",  color: "green",  department: "lab",       activa: true, orden: 11 },
    { nombre_es: "Preparación medios de cultivo", nombre_en: "Media preparation", codigo: "MP",  color: "blue",   department: "lab",       activa: true, orden: 12 },
  ]

  const { error } = await supabase
    .from("tecnicas")
    .insert(defaults.map((d) => ({ ...d, organisation_id: orgId })))

  if (error) return { seeded: false, error: error.message }
  revalidatePath("/lab")
  return { seeded: true }
}
