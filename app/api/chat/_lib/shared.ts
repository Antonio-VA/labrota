import type { createClient } from "@/lib/supabase/server"

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>
export type StaffRef = { id: string; first_name: string; last_name: string }

export const SKILL_LABEL: Record<string, string> = {
  icsi: "ICSI", iui: "IUI", vitrification: "Vitrification", thawing: "Thawing",
  biopsy: "Biopsy", semen_analysis: "Semen Analysis", sperm_prep: "Sperm Prep",
  witnessing: "Witnessing", other: "Other",
}

export const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: "Vacaciones", sick: "Baja médica", personal: "Personal",
  training: "Formación", maternity: "Maternidad/Paternidad", other: "Otro",
}

export const RULE_TYPE_LABEL: Record<string, string> = {
  no_coincidir: "Cannot work together",
  supervisor_requerido: "Supervisor required",
  max_dias_consecutivos: "Max consecutive days",
  distribucion_fines_semana: "Weekend distribution",
  descanso_fin_de_semana: "Weekend rest",
  no_misma_tarea: "No same task",
  no_librar_mismo_dia: "Cannot have same day off",
  restriccion_dia_tecnica: "Day/technique restriction",
  asignacion_fija: "Fixed assignment",
  tecnicas_juntas: "Techniques together",
  tarea_multidepartamento: "Multi-department task",
  equipo_completo: "Whole team",
}

/**
 * Resolve a staff member from a free-form name ("John Smith", "Smith", "J. Smith").
 * Tries first+last when 2+ words are supplied, falls back to last-name only.
 */
export async function resolveStaffByName(
  supabase: SupabaseClient,
  orgId: string,
  name: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<StaffRef | null> {
  const parts = name.trim().split(/\s+/)
  const last = parts[parts.length - 1]

  const base = () => {
    const q = supabase.from("staff").select("id, first_name, last_name").eq("organisation_id", orgId)
    return activeOnly ? q.neq("onboarding_status", "inactive") : q
  }

  if (parts.length >= 2) {
    const { data } = await base()
      .ilike("first_name", `%${parts[0]}%`)
      .ilike("last_name", `%${last}%`)
      .limit(1) as { data: StaffRef[] | null }
    if (data?.[0]) return data[0]
  }

  const { data } = await base()
    .ilike("last_name", `%${last}%`)
    .limit(1) as { data: StaffRef[] | null }
  return data?.[0] ?? null
}
