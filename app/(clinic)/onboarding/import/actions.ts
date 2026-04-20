"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import { createBackup } from "@/app/admin/backup-actions"
import type { ExtractedData, ImportResult } from "@/lib/types/import"
import type { RotaRuleType } from "@/lib/types/database"
import { toISODate } from "@/lib/format-date"

const PASTEL_COLORS = [
  "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
  "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  "#E9D5FF", "#FEF08A", "#CCFBF1", "#FFE4E6",
  "#93C5FD", "#86EFAC", "#FCA5A5", "#FCD34D", "#C4B5FD", "#F9A8D4",
  "#6EE7B7", "#FDBA74", "#A5B4FC", "#FDA4AF", "#7DD3FC", "#BEF264",
  "#D8B4FE", "#FDE047", "#99F6E4", "#E0E7FF",
  "#E2E8F0", "#CBD5E1", "#D1D5DB", "#B0B8C4",
  "#E8D5C4", "#D4B896", "#C9B8A8", "#DEC9B0",
]

const VALID_RULE_TYPES: RotaRuleType[] = [
  "no_coincidir", "supervisor_requerido", "max_dias_consecutivos",
  "distribucion_fines_semana", "descanso_fin_de_semana",
  "no_misma_tarea", "no_librar_mismo_dia", "restriccion_dia_tecnica",
]

export async function importHistoricalGuardia(data: ExtractedData): Promise<ImportResult> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { success: false, error: "No active organisation" }

  const counts = { staff: 0, shifts: 0, techniques: 0, rules: 0, labSettings: false }

  try {
    // ── 0. Auto backup before import ──────────────────────────────────────
    await createBackup(orgId, "auto", "Pre-importación automática")

    // ── 1. Import Staff ─────────────────────────────────────────────────────
    const staffToInsert = data.staff.filter((s) => s.included)
    const staffIdMap: Record<string, string> = {} // name → id

    if (staffToInsert.length > 0) {
      const rows = staffToInsert.map((s, i) => {
        const nameParts = s.name.trim().split(/\s+/)
        const firstName = nameParts[0] ?? s.name
        const lastName = nameParts.slice(1).join(" ") || "-"
        return {
          organisation_id: orgId,
          first_name: firstName,
          last_name: lastName,
          role: ["lab", "andrology", "admin"].includes(s.department) ? s.department : "lab",
          working_pattern: (s.observed_days.length > 0 ? s.observed_days : ["mon", "tue", "wed", "thu", "fri"]) as import("@/lib/types/database").WorkingPattern,
          days_per_week: s.observed_days.length > 0 ? Math.min(s.observed_days.length, 7) : 5,
          preferred_shift: s.shift_preference || null,
          onboarding_status: "active" as const,
          color: PASTEL_COLORS[i % PASTEL_COLORS.length],
          contracted_hours: 40,
          start_date: toISODate(),
        }
      })

      const { data: inserted, error } = await supabase
        .from("staff")
        .insert(rows)
        .select("id") as unknown as { data: { id: string }[] | null; error: { message: string } | null }

      if (error) return { success: false, error: `Staff insert failed: ${error.message}` }

      // Build name → id map
      if (inserted) {
        staffToInsert.forEach((s, i) => {
          if (inserted[i]) staffIdMap[s.name] = inserted[i].id
        })
        counts.staff = inserted.length
      }
    }

    // ── 2. Import Shift Types ────────────────────────────────────────────────
    const shiftsToInsert = data.shifts.filter((s) => s.included)

    if (shiftsToInsert.length > 0) {
      const rows = shiftsToInsert.map((s, i) => ({
        organisation_id: orgId,
        code: s.code.toUpperCase().slice(0, 5),
        name_es: s.name || s.code,
        name_en: s.name || s.code,
        start_time: s.start || "08:00",
        end_time: s.end || "16:00",
        sort_order: i,
        active: true,
        active_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      }))

      const { data: inserted, error } = await supabase
        .from("shift_types")
        .insert(rows)
        .select("id") as unknown as { data: { id: string }[] | null; error: { message: string } | null }

      if (error) return { success: false, error: `Shift types insert failed: ${error.message}` }
      counts.shifts = inserted?.length ?? 0
    }

    // ── 3. Import Techniques ─────────────────────────────────────────────────
    const techsToInsert = data.techniques.filter((t) => t.included)

    if (techsToInsert.length > 0) {
      const TECH_COLORS = ["#F59E0B", "#3B82F6", "#10B981", "#8B5CF6", "#EF4444", "#14B8A6", "#64748B", "#EC4899"]
      const rows = techsToInsert.map((t, i) => ({
        organisation_id: orgId,
        nombre_es: t.name,
        nombre_en: t.name,
        codigo: t.code.toUpperCase().slice(0, 3),
        color: TECH_COLORS[i % TECH_COLORS.length],
        department: t.department === "andrology" ? "andrology" : "lab",
        activa: true,
        orden: i,
        typical_shifts: [],
      }))

      const { data: inserted, error } = await supabase
        .from("tecnicas")
        .insert(rows)
        .select("id") as unknown as { data: { id: string }[] | null; error: { message: string } | null }

      if (error) return { success: false, error: `Techniques insert failed: ${error.message}` }
      counts.techniques = inserted?.length ?? 0
    }

    // ── 4. Import Rules ──────────────────────────────────────────────────────
    const rulesToInsert = data.rules.filter((r) => r.accepted && r.confidence >= 0.5)

    if (rulesToInsert.length > 0) {
      const rows = rulesToInsert.map((r) => {
        // Map extracted type to valid RotaRuleType — skip unknown types
        if (!VALID_RULE_TYPES.includes(r.type as RotaRuleType)) {
          return null
        }
        const ruleType = r.type as RotaRuleType

        // Resolve staff names to IDs
        const staffIds = r.staff_involved
          .map((name) => staffIdMap[name])
          .filter(Boolean) as string[]

        // For supervisor_requerido, first staff is the supervisor
        const params: Record<string, unknown> = {
          confidence: r.confidence,
          observed: `${r.observed_count}/${r.total_weeks}`,
        }
        if (ruleType === "supervisor_requerido" && staffIds.length > 0) {
          params.supervisor_id = staffIds[0]
        }

        return {
          organisation_id: orgId,
          type: ruleType,
          is_hard: r.confidence >= 0.9,
          enabled: true,
          staff_ids: staffIds,
          params,
          notes: r.description,
        }
      }).filter((r): r is NonNullable<typeof r> =>
        r !== null && (r.staff_ids.length > 0 || r.type === "max_dias_consecutivos" || r.type === "distribucion_fines_semana" || r.type === "descanso_fin_de_semana")
      )

      if (rows.length > 0) {
        const { data: inserted, error } = await supabase
          .from("rota_rules")
          .insert(rows)
          .select("id") as unknown as { data: { id: string }[] | null; error: { message: string } | null }

        if (error) return { success: false, error: `Rules insert failed: ${error.message}` }
        counts.rules = inserted?.length ?? 0
      }
    }

    // ── 5. Set rota mode and task coverage if detected ─────────────────────
    if (data.rota_mode) {
      const updates: Record<string, unknown> = {
        rota_display_mode: data.rota_mode.type,
      }
      // If by_task and task coverage detected, configure task coverage
      if (data.rota_mode.type === "by_task" && data.task_coverage && data.task_coverage.length > 0) {
        const taskCov: Record<string, Record<string, number>> = {}
        for (const tc of data.task_coverage) {
          taskCov[tc.task_code] = {
            mon: tc.typical_staff_count, tue: tc.typical_staff_count,
            wed: tc.typical_staff_count, thu: tc.typical_staff_count,
            fri: tc.typical_staff_count, sat: tc.min_observed, sun: 0,
          }
        }
        updates.task_coverage_enabled = true
        updates.task_coverage_by_day = taskCov
      }
      await supabase.from("lab_config").update(updates).eq("organisation_id", orgId)
    }

    // ── 6. Apply lab settings if detected ─────────────────────────────────
    if (data.lab_settings) {
      const ls = data.lab_settings
      const updates: Record<string, unknown> = {}

      // Coverage — expand weekday/sat/sun into per-day structure
      if (ls.coverage_by_day) {
        updates.coverage_by_day = {
          mon: ls.coverage_by_day.weekday,
          tue: ls.coverage_by_day.weekday,
          wed: ls.coverage_by_day.weekday,
          thu: ls.coverage_by_day.weekday,
          fri: ls.coverage_by_day.weekday,
          sat: ls.coverage_by_day.saturday,
          sun: ls.coverage_by_day.sunday,
        }
        // Also set legacy flat fields for backward compat
        updates.min_lab_coverage = ls.coverage_by_day.weekday.lab
        updates.min_andrology_coverage = ls.coverage_by_day.weekday.andrology
        updates.min_weekend_lab_coverage = ls.coverage_by_day.saturday.lab
        updates.min_weekend_andrology = ls.coverage_by_day.saturday.andrology
      }

      // Punciones — expand into per-day
      if (ls.punctions_by_day) {
        updates.punctions_by_day = {
          mon: ls.punctions_by_day.weekday,
          tue: ls.punctions_by_day.weekday,
          wed: ls.punctions_by_day.weekday,
          thu: ls.punctions_by_day.weekday,
          fri: ls.punctions_by_day.weekday,
          sat: ls.punctions_by_day.saturday,
          sun: ls.punctions_by_day.sunday,
        }
      }

      if (ls.days_off_preference) updates.days_off_preference = ls.days_off_preference
      if (ls.shift_rotation) updates.shift_rotation = ls.shift_rotation
      if (ls.admin_on_weekends !== undefined) updates.admin_on_weekends = ls.admin_on_weekends

      if (Object.keys(updates).length > 0) {
        await supabase.from("lab_config").update(updates).eq("organisation_id", orgId)
        counts.labSettings = true
      }
    }

    revalidatePath("/staff")
    revalidatePath("/lab")
    revalidatePath("/settings")
    revalidatePath("/schedule")

    return { success: true, counts }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Import failed" }
  }
}
