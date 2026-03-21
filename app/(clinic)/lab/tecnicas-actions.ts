"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { Tecnica, SkillName } from "@/lib/types/database"

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
}

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
        activa:         tecnica.activa ?? true,
        orden:          tecnica.orden ?? 0,
      } as never)
      .eq("id", tecnica.id)
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
      activa:          tecnica.activa ?? true,
      orden:           tecnica.orden ?? 0,
    } as never)
    .select("id")
    .single()

  if (error || !data) return { error: error?.message ?? "Failed to create técnica." }
  revalidatePath("/lab")
  return { id: (data as { id: string }).id }
}

export async function deleteTecnica(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from("tecnicas").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

export async function reorderTecnicas(orderedIds: string[]): Promise<{ error?: string }> {
  const supabase = await createClient()
  await Promise.all(
    orderedIds.map((id, i) =>
      supabase.from("tecnicas").update({ orden: i } as never).eq("id", id)
    )
  )
  revalidatePath("/lab")
  return {}
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
    required_skill: SkillName | null; activa: boolean; orden: number
  }> = [
    { nombre_es: "Punción folicular", nombre_en: "Egg collection",  codigo: "OPU", color: "amber",  required_skill: "egg_collection",  activa: true, orden: 0 },
    { nombre_es: "ICSI",              nombre_en: "ICSI",            codigo: "ICS", color: "blue",   required_skill: "icsi",            activa: true, orden: 1 },
    { nombre_es: "Transferencia",     nombre_en: "Embryo transfer", codigo: "ET",  color: "green",  required_skill: "embryo_transfer", activa: true, orden: 2 },
    { nombre_es: "Biopsia",           nombre_en: "Biopsy",          codigo: "BX",  color: "purple", required_skill: "biopsy",          activa: true, orden: 3 },
    { nombre_es: "Denudación",        nombre_en: "Denudation",      codigo: "DEN", color: "teal",   required_skill: "denudation",      activa: true, orden: 4 },
    { nombre_es: "Andrología",        nombre_en: "Andrology",       codigo: "AND", color: "coral",  required_skill: null,              activa: true, orden: 5 },
  ]

  const { error } = await supabase
    .from("tecnicas")
    .insert(defaults.map((d) => ({ ...d, organisation_id: orgId })) as never)

  if (error) return { seeded: false, error: error.message }
  revalidatePath("/lab")
  return { seeded: true }
}
