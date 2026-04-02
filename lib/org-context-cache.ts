import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import type { LabConfig, ShiftTypeDefinition, Department, Tecnica, EngineConfig } from "@/lib/types/database"

/**
 * Cache tag for org-level static data. Invalidate whenever lab config, shift
 * types, departments, técnicas, rota rules, org settings, or staff change.
 */
export const orgStaticTag = (orgId: string) => `org-static-${orgId}`

export interface OrgContext {
  labConfig: LabConfig | null
  shiftTypes: ShiftTypeDefinition[]
  departments: Department[]
  tecnicas: Tecnica[]
  rules: { type: string; enabled: boolean; staff_ids: string[]; params: Record<string, unknown>; expires_at: string | null }[]
  orgDisplayMode: string
  engineConfig: EngineConfig
  staff: { id: string; first_name: string; last_name: string; role: string; onboarding_status: string; contract_type: string | null; onboarding_end_date: string | null; days_per_week: number; working_pattern: string[]; preferred_days: string[] | null; preferred_shift: string | null; start_date: string; email: string | null; notes: string | null }[]
  staffSkills: { staff_id: string; skill: string; level: string }[]
}

/**
 * Returns org-level static context, cached per-org in the Next.js data cache.
 *
 * Cached for 5 minutes as a safety net; mutations explicitly invalidate via
 * revalidateTag(orgStaticTag(orgId)) so data is fresh immediately after any
 * config, staff, or rule change.
 */
export function getCachedOrgContext(orgId: string): Promise<OrgContext> {
  return unstable_cache(
    async (): Promise<OrgContext> => {
      const admin = createAdminClient()
      const [
        labConfigRes,
        shiftTypesRes,
        departmentsRes,
        tecnicasRes,
        rulesRes,
        orgRes,
        staffRes,
        skillsRes,
      ] = await Promise.all([
        admin.from("lab_config").select("*").eq("organisation_id", orgId).maybeSingle(),
        admin.from("shift_types")
          .select("code, name_es, name_en, start_time, end_time, sort_order, active, active_days")
          .eq("organisation_id", orgId)
          .order("sort_order"),
        admin.from("departments").select("*").eq("organisation_id", orgId).order("sort_order"),
        admin.from("tecnicas").select("*").eq("organisation_id", orgId).order("orden").order("created_at"),
        admin.from("rota_rules")
          .select("type, enabled, staff_ids, params, expires_at")
          .eq("organisation_id", orgId)
          .eq("enabled", true)
          .in("type", ["restriccion_dia_tecnica", "supervisor_requerido"]),
        admin.from("organisations")
          .select("rota_display_mode, ai_optimal_version, engine_hybrid_enabled, engine_reasoning_enabled, task_optimal_version, task_hybrid_enabled, task_reasoning_enabled")
          .eq("id", orgId)
          .maybeSingle(),
        admin.from("staff")
          .select("id, first_name, last_name, role, onboarding_status, contract_type, onboarding_end_date, days_per_week, working_pattern, preferred_days, preferred_shift, start_date, email, notes")
          .eq("organisation_id", orgId),
        admin.from("staff_skills")
          .select("staff_id, skill, level")
          .eq("organisation_id", orgId),
      ])

      const orgRow = orgRes.data as Record<string, unknown> | null

      return {
        labConfig: labConfigRes.data as LabConfig | null,
        shiftTypes: (shiftTypesRes.data ?? []) as ShiftTypeDefinition[],
        departments: (departmentsRes.data ?? []) as Department[],
        tecnicas: (tecnicasRes.data ?? []) as Tecnica[],
        rules: (rulesRes.data ?? []) as { type: string; enabled: boolean; staff_ids: string[]; params: Record<string, unknown>; expires_at: string | null }[],
        orgDisplayMode: (orgRow?.rota_display_mode as string | undefined) ?? "by_shift",
        engineConfig: {
          aiOptimalVersion:     (orgRow?.ai_optimal_version     as string  | undefined) ?? "v2",
          hybridEnabled:        (orgRow?.engine_hybrid_enabled  as boolean | undefined) ?? true,
          reasoningEnabled:     (orgRow?.engine_reasoning_enabled as boolean | undefined) ?? false,
          taskOptimalVersion:   (orgRow?.task_optimal_version   as string  | undefined) ?? "v1",
          taskHybridEnabled:    (orgRow?.task_hybrid_enabled    as boolean | undefined) ?? false,
          taskReasoningEnabled: (orgRow?.task_reasoning_enabled as boolean | undefined) ?? false,
        },
        staff: (staffRes.data ?? []) as { id: string; first_name: string; last_name: string; role: string; onboarding_status: string; contract_type: string | null; onboarding_end_date: string | null; days_per_week: number; working_pattern: string[]; preferred_days: string[] | null; preferred_shift: string | null; start_date: string; email: string | null; notes: string | null }[],
        staffSkills: (skillsRes.data ?? []) as { staff_id: string; skill: string; level: string }[],
      }
    },
    [`org-static-${orgId}`],
    { tags: [orgStaticTag(orgId)], revalidate: 300 }
  )()
}
