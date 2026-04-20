"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { typedQuery } from "@/lib/supabase/typed-query"
import { getCachedOrgId } from "@/lib/auth-cache"
import { RECENT_ASSIGNMENTS_LOOKBACK_DAYS } from "@/lib/constants"
import { runRotaEngineV2 } from "@/lib/rota-engine-v2"
import { getWeekDates } from "@/lib/engine-helpers"
import { getMondayOf, toISODate } from "@/lib/format-date"
import { logAuditEvent } from "@/lib/audit"
import { captureSnapshot } from "@/lib/rota-snapshots"
import type {
  RotaStatus,
  StaffWithSkills,
  Leave,
  RotaAssignment,
  RotaRule,
  SkillName,
  ShiftType,
  StaffRole,
  ShiftTypeDefinition,
  Tecnica,
  LabConfig,
  ShiftCoverageByDay,
  ShiftCoverageEntry,
} from "@/lib/types/database"
import type { RotaTemplate, RotaTemplateAssignment } from "@/lib/types/database"

export async function saveAsTemplate(weekStart: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  const dates = getWeekDates(weekStart)
  const { data: assignments } = await typedQuery<{ staff_id: string; date: string; shift_type: string; function_label: string | null }[]>(
    supabase
      .from("rota_assignments")
      .select("staff_id, date, shift_type, function_label")
      .gte("date", dates[0])
      .lte("date", dates[6]))

  if (!assignments || assignments.length === 0) return { error: "No shifts to save." }

  const templateAssignments: RotaTemplateAssignment[] = assignments.map((a) => {
    const dayIndex = dates.indexOf(a.date)
    return {
      staff_id: a.staff_id,
      day_offset: dayIndex >= 0 ? dayIndex : 0,
      shift_type: a.shift_type,
      function_label: a.function_label ?? null,
    }
  })

  const { error } = await (supabase
    .from("rota_templates") as ReturnType<typeof supabase.from>)
    .insert({ organisation_id: orgId, name, assignments: templateAssignments })
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

export async function getTemplates(): Promise<RotaTemplate[]> {
  const supabase = await createClient()
  const { data } = await typedQuery<RotaTemplate[]>(
    supabase
      .from("rota_templates")
      .select("id, name, assignments, created_at")
      .order("created_at", { ascending: false }))
  return data ?? []
}

export async function applyTemplate(templateId: string, weekStart: string, strict = true): Promise<{ error?: string; skipped?: string[] }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Fetch template
  const { data: template } = await typedQuery<RotaTemplate>(
    supabase
      .from("rota_templates")
      .select("id, name, assignments")
      .eq("id", templateId)
      .single())
  if (!template) return { error: "Template not found." }

  const dates = getWeekDates(weekStart)

  // Upsert rota record
  const { data: rota } = await typedQuery<{ id: string }>(
    supabase
      .from("rotas")
      .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id, week_start" })
      .select("id")
      .single())
  if (!rota) return { error: "Error creating rota." }

  // Best-effort: set generation_type
  await supabase.from("rotas").update({ generation_type: strict ? "strict_template" : "flexible_template" }).eq("id", rota.id)

  // Fetch leaves for this week
  const { data: leaves } = await typedQuery<{ staff_id: string; start_date: string; end_date: string }[]>(
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date")
      .lte("start_date", dates[6])
      .gte("end_date", dates[0])
      .eq("status", "approved"))

  const onLeave: Record<string, Set<string>> = {}
  for (const l of leaves ?? []) {
    const s = new Date(l.start_date + "T12:00:00")
    const e = new Date(l.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = toISODate(d)
      if (!onLeave[iso]) onLeave[iso] = new Set()
      onLeave[iso].add(l.staff_id)
    }
  }

  // Fetch active staff
  const { data: activeStaff } = await typedQuery<{ id: string }[]>(
    supabase
      .from("staff")
      .select("id, onboarding_status")
      .eq("onboarding_status", "active"))
  const activeIds = new Set((activeStaff ?? []).map((s) => s.id))

  // Delete existing non-override assignments
  await supabase
    .from("rota_assignments")
    .delete()
    .eq("rota_id", rota.id)
    .eq("is_manual_override", false)

  // Insert template assignments, skipping leave/inactive
  const skipped: string[] = []
  const toInsert: { organisation_id: string; rota_id: string; staff_id: string; date: string; shift_type: string; is_manual_override: boolean; function_label: string }[] = []

  for (const a of template.assignments) {
    const date = dates[a.day_offset]
    if (!date) continue
    if (!activeIds.has(a.staff_id)) { skipped.push(a.staff_id); continue }
    if (onLeave[date]?.has(a.staff_id)) { skipped.push(a.staff_id); continue }
    toInsert.push({
      organisation_id: orgId,
      rota_id: rota.id,
      staff_id: a.staff_id,
      date,
      shift_type: a.shift_type,
      is_manual_override: false,
      function_label: a.function_label ?? "",
    })
  }

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  revalidatePath("/schedule")
  return { skipped: [...new Set(skipped)] }
}

export async function renameTemplate(id: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase.from("rota_templates").update({ name }).eq("id", id).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}

export async function deleteTemplate(id: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { error } = await supabase.from("rota_templates").delete().eq("id", id).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/lab")
  return {}
}
