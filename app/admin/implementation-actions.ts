"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/audit"

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "super_admin") {
    throw new Error("Unauthorised")
  }
}
import { ES_SHIFTS, ES_TECNICAS, ES_DEPARTMENTS } from "@/lib/defaults/es"
import { EN_SHIFTS, EN_TECNICAS, EN_DEPARTMENTS } from "@/lib/defaults/en"

const ALL_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

type Lang = "es" | "en"
type LoadMode = "overwrite" | "merge"

export interface ImplementationStatus {
  shifts: number
  tecnicas: number
  departments: number
  rules: number
  coverageConfigured: boolean
}

export async function getImplementationStatus(orgId: string): Promise<ImplementationStatus> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const [shiftsRes, tecnicasRes, deptsRes, rulesRes, configRes] = await Promise.all([
    admin.from("shift_types").select("id", { count: "exact", head: true }).eq("organisation_id", orgId),
    admin.from("tecnicas").select("id", { count: "exact", head: true }).eq("organisation_id", orgId),
    admin.from("departments").select("id", { count: "exact", head: true }).eq("organisation_id", orgId),
    admin.from("rota_rules").select("id", { count: "exact", head: true }).eq("organisation_id", orgId),
    admin.from("lab_config").select("min_lab_coverage").eq("organisation_id", orgId).maybeSingle(),
  ])
  return {
    shifts: (shiftsRes.count ?? 0),
    tecnicas: (tecnicasRes.count ?? 0),
    departments: (deptsRes.count ?? 0),
    rules: (rulesRes.count ?? 0),
    coverageConfigured: !!(configRes.data as { min_lab_coverage?: number } | null)?.min_lab_coverage,
  }
}

export async function loadDefaultShifts(orgId: string, lang: Lang, mode: LoadMode, userEmail?: string): Promise<{ error?: string; count?: number }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const defaults = lang === "es" ? ES_SHIFTS : EN_SHIFTS

  if (mode === "overwrite") {
    await admin.from("shift_types").delete().eq("organisation_id", orgId)
  }

  // Get existing codes to skip on merge
  const existingCodes = new Set<string>()
  if (mode === "merge") {
    const { data } = await admin.from("shift_types").select("code").eq("organisation_id", orgId) as { data: { code: string }[] | null }
    for (const r of data ?? []) existingCodes.add(r.code)
  }

  const rows = defaults
    .filter((s) => !existingCodes.has(s.code))
    .map((s, i) => ({
      organisation_id: orgId,
      code: s.code,
      name_es: s.name_es,
      name_en: s.name_en,
      start_time: s.start_time,
      end_time: s.end_time,
      sort_order: i,
      active: true,
      active_days: ALL_DAYS,
    }))

  if (rows.length > 0) {
    const { error } = await admin.from("shift_types").insert(rows as never)
    if (error) return { error: error.message }
  }

  logAuditEvent({ orgId, userEmail, action: "config_change", entityType: "shift_types", changes: { loaded: `${lang} defaults`, count: rows.length } })
  revalidatePath(`/admin/orgs/${orgId}`)
  return { count: rows.length }
}

export async function loadDefaultTecnicas(orgId: string, lang: Lang, mode: LoadMode, userEmail?: string): Promise<{ error?: string; count?: number }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const defaults = lang === "es" ? ES_TECNICAS : EN_TECNICAS

  if (mode === "overwrite") {
    await admin.from("tecnicas").delete().eq("organisation_id", orgId)
  }

  const existingCodes = new Set<string>()
  if (mode === "merge") {
    const { data } = await admin.from("tecnicas").select("codigo").eq("organisation_id", orgId) as { data: { codigo: string }[] | null }
    for (const r of data ?? []) existingCodes.add(r.codigo)
  }

  const rows = defaults
    .filter((t) => !existingCodes.has(t.codigo))
    .map((t, i) => ({
      organisation_id: orgId,
      codigo: t.codigo,
      nombre_es: t.nombre_es,
      nombre_en: t.nombre_en,
      department: t.department,
      color: t.color,
      activa: true,
      orden: i,
      typical_shifts: [] as string[],
    }))

  if (rows.length > 0) {
    const { error } = await admin.from("tecnicas").insert(rows as never)
    if (error) return { error: error.message }
  }

  logAuditEvent({ orgId, userEmail, action: "config_change", entityType: "tecnicas", changes: { loaded: `${lang} defaults`, count: rows.length } })
  revalidatePath(`/admin/orgs/${orgId}`)
  return { count: rows.length }
}

export async function loadDefaultDepartments(orgId: string, lang: Lang, mode: LoadMode, userEmail?: string): Promise<{ error?: string; count?: number }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const defaults = lang === "es" ? ES_DEPARTMENTS : EN_DEPARTMENTS

  if (mode === "overwrite") {
    await admin.from("departments").delete().eq("organisation_id", orgId)
  }

  const existingCodes = new Set<string>()
  if (mode === "merge") {
    const { data } = await admin.from("departments").select("code").eq("organisation_id", orgId) as { data: { code: string }[] | null }
    for (const r of data ?? []) existingCodes.add(r.code)
  }

  const rows = defaults
    .filter((d) => !existingCodes.has(d.code))
    .map((d, i) => ({
      organisation_id: orgId,
      code: d.code,
      name: d.name,
      name_en: d.name_en,
      abbreviation: d.abbreviation,
      colour: d.colour,
      is_default: true,
      sort_order: i,
    }))

  if (rows.length > 0) {
    const { error } = await admin.from("departments").insert(rows)
    if (error) return { error: error.message }
  }

  logAuditEvent({ orgId, userEmail, action: "config_change", entityType: "departments", changes: { loaded: `${lang} defaults`, count: rows.length } })
  revalidatePath(`/admin/orgs/${orgId}`)
  return { count: rows.length }
}

export async function loadAllDefaults(orgId: string, lang: Lang, mode: LoadMode, userEmail?: string): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const r1 = await loadDefaultShifts(orgId, lang, mode, userEmail)
  if (r1.error) return { error: `Shifts: ${r1.error}` }
  const r2 = await loadDefaultTecnicas(orgId, lang, mode, userEmail)
  if (r2.error) return { error: `Técnicas: ${r2.error}` }
  const r3 = await loadDefaultDepartments(orgId, lang, mode, userEmail)
  if (r3.error) return { error: `Departments: ${r3.error}` }

  logAuditEvent({
    orgId, userEmail,
    action: "config_change",
    entityType: "implementation",
    changes: { loaded: `${lang} all defaults`, shifts: r1.count, tecnicas: r2.count, departments: r3.count },
  })
  return {}
}
