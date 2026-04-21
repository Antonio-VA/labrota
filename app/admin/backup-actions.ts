"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { typedQuery } from "@/lib/supabase/typed-query"

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "super_admin") {
    throw new Error("Unauthorised")
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface BackupEntry {
  id: string
  organisation_id: string
  created_at: string
  created_by: string | null
  created_by_name?: string | null
  type: "auto" | "manual"
  label: string | null
  config_summary: string
  rota_summary: string
}

interface BackupConfig {
  departments: unknown[]
  shifts: unknown[]
  tasks: unknown[]
  rules: unknown[]
  coverageMinimums: unknown
  teamMembers: unknown[]
  preferences: unknown
  tenantSettings: unknown
}

interface BackupRota {
  weekStart: string
  status: "draft" | "published"
  assignments: unknown[]
  lastModifiedAt: string | null
  lastModifiedBy: string | null
}

// ── Snapshot helpers ─────────────────────────────────────────────────────────

async function captureConfig(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<BackupConfig> {
  const [depts, shifts, tasks, rules, staff, config] = await Promise.all([
    admin.from("departments").select("*").eq("organisation_id", orgId).order("sort_order"),
    admin.from("shift_types").select("*").eq("organisation_id", orgId).order("sort_order"),
    admin.from("tecnicas").select("*").eq("organisation_id", orgId).order("orden"),
    admin.from("rota_rules").select("*").eq("organisation_id", orgId),
    admin.from("staff").select("*, staff_skills(*)").eq("organisation_id", orgId).order("last_name"),
    admin.from("lab_config").select("*").eq("organisation_id", orgId).maybeSingle(),
  ])

  return {
    departments: depts.data ?? [],
    shifts: shifts.data ?? [],
    tasks: tasks.data ?? [],
    rules: rules.data ?? [],
    coverageMinimums: (config.data as { coverage_by_day?: unknown } | null)?.coverage_by_day ?? null,
    teamMembers: staff.data ?? [],
    preferences: {
      task_coverage_enabled: (config.data as { task_coverage_enabled?: boolean } | null)?.task_coverage_enabled,
      task_coverage_by_day: (config.data as { task_coverage_by_day?: unknown } | null)?.task_coverage_by_day,
      shift_coverage_enabled: (config.data as { shift_coverage_enabled?: boolean } | null)?.shift_coverage_enabled,
      shift_coverage_by_day: (config.data as { shift_coverage_by_day?: unknown } | null)?.shift_coverage_by_day,
      shift_rotation: (config.data as { shift_rotation?: unknown } | null)?.shift_rotation,
    },
    tenantSettings: config.data ?? {},
  }
}

async function captureRotas(admin: ReturnType<typeof createAdminClient>, orgId: string): Promise<BackupRota[]> {
  const { data: rotas } = await typedQuery<{ id: string; week_start: string; status: string; updated_at: string }[]>(
    admin
      .from("rotas")
      .select("id, week_start, status, updated_at")
      .eq("organisation_id", orgId)
      .order("week_start", { ascending: false })
      .limit(52)
  )

  if (!rotas?.length) return []

  const result: BackupRota[] = []
  for (const rota of rotas) {
    const { data: assignments } = await typedQuery<unknown[]>(
      admin
        .from("rota_assignments")
        .select("*")
        .eq("rota_id", rota.id)
    )

    result.push({
      weekStart: rota.week_start,
      status: rota.status as "draft" | "published",
      assignments: assignments ?? [],
      lastModifiedAt: rota.updated_at,
      lastModifiedBy: null,
    })
  }
  return result
}

// ── Actions ──────────────────────────────────────────────────────────────────

export async function createBackup(
  orgId: string,
  type: "auto" | "manual",
  label?: string
): Promise<{ error?: string; id?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  // For auto backups, enforce max 30 per tenant
  if (type === "auto") {
    const { data: existing } = await typedQuery<{ id: string }[]>(
      admin
        .from("backups")
        .select("id")
        .eq("organisation_id", orgId)
        .eq("type", "auto")
        .order("created_at", { ascending: false })
    )

    if (existing && existing.length >= 30) {
      // Delete oldest auto backups beyond 30
      const toDelete = existing.slice(29).map((b) => b.id)
      if (toDelete.length > 0) {
        await admin.from("backups").delete().in("id", toDelete)
      }
    }
  }

  const config = await captureConfig(admin, orgId)
  const rotas = await captureRotas(admin, orgId)

  const { data, error } = await typedQuery<{ id: string }>(
    admin
      .from("backups")
      .insert({
        organisation_id: orgId,
        type,
        label: label || (type === "manual" ? "Copia manual" : null),
        config,
        rotas,
      } as never)
      .select("id")
      .single()
  )

  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { id: data?.id }
}

export async function getBackups(orgId: string): Promise<BackupEntry[]> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { data } = await typedQuery<{ id: string; organisation_id: string; created_at: string; created_by: string | null; type: "auto" | "manual"; label: string | null; config: BackupConfig; rotas: BackupRota[] }[]>(
    admin
      .from("backups")
      .select("id, organisation_id, created_at, created_by, type, label, config, rotas")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100)
  )

  if (!data?.length) return []

  // Resolve user names
  const userIds = [...new Set(data.map((b) => b.created_by).filter((id): id is string => id != null))]
  const nameMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const { data: profiles } = await typedQuery<{ id: string; full_name: string | null; email: string }[]>(
      admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
    )
    for (const p of profiles ?? []) {
      nameMap[p.id] = p.full_name || p.email
    }
  }

  return data.map((b) => {
    const config = b.config as BackupConfig
    const rotas = (b.rotas ?? []) as BackupRota[]
    const configItems = [
      config.departments?.length && `${config.departments.length} depts`,
      config.shifts?.length && `${config.shifts.length} turnos`,
      config.tasks?.length && `${config.tasks.length} tareas`,
      config.teamMembers?.length && `${config.teamMembers.length} personas`,
    ].filter(Boolean).join(", ")

    let rotaSummary = "Sin rotas"
    if (rotas.length > 0) {
      const weeks = rotas.map((r) => r.weekStart).sort()
      const hasDrafts = rotas.some((r) => r.status === "draft")
      rotaSummary = `${rotas.length} semanas: ${weeks[0]} – ${weeks[weeks.length - 1]}${hasDrafts ? " (incl. borradores)" : ""}`
    }

    return {
      id: b.id,
      organisation_id: b.organisation_id,
      created_at: b.created_at,
      created_by: b.created_by,
      created_by_name: b.created_by ? nameMap[b.created_by] ?? null : null,
      type: b.type,
      label: b.label,
      config_summary: configItems || "Config vacía",
      rota_summary: rotaSummary,
    }
  })
}

export async function deleteBackup(backupId: string, orgId: string): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin.from("backups").delete().eq("id", backupId).eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return {}
}

export async function restoreBackup(
  backupId: string,
  orgId: string,
  options: { config: boolean; rotas: boolean; includeDrafts: boolean }
): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  const { data: backup } = await typedQuery<{ config: BackupConfig; rotas: BackupRota[] }>(
    admin
      .from("backups")
      .select("config, rotas")
      .eq("id", backupId)
      .single()
  )

  if (!backup) return { error: "Backup not found" }

  if (options.config) {
    // NOTE: the `as never` casts below restore historical JSON snapshots whose
    // shape may not match the current generated Supabase Insert type (columns
    // get added/renamed over the life of the schema). They are intentional —
    // do not replace with typed inserts without also migrating old backups.

    // Clear existing config
    await admin.from("staff_skills").delete().eq("organisation_id", orgId)
    await admin.from("leaves").delete().eq("organisation_id", orgId)
    await admin.from("staff").delete().eq("organisation_id", orgId)
    await admin.from("tecnicas").delete().eq("organisation_id", orgId)
    await admin.from("shift_types").delete().eq("organisation_id", orgId)
    await admin.from("departments").delete().eq("organisation_id", orgId)
    await admin.from("rota_rules").delete().eq("organisation_id", orgId)

    // Restore departments
    for (const d of backup.config.departments as Record<string, unknown>[]) {
      const { id: _, created_at: __, ...rest } = d
      await admin.from("departments").insert({ ...rest, organisation_id: orgId } as never)
    }
    // Restore shifts
    for (const s of backup.config.shifts as Record<string, unknown>[]) {
      const { id: _, created_at: __, ...rest } = s
      await admin.from("shift_types").insert({ ...rest, organisation_id: orgId } as never)
    }
    // Restore tasks
    for (const t of backup.config.tasks as Record<string, unknown>[]) {
      const { id: _, created_at: __, ...rest } = t
      await admin.from("tecnicas").insert({ ...rest, organisation_id: orgId } as never)
    }
    // Restore rules
    for (const r of backup.config.rules as Record<string, unknown>[]) {
      const { id: _, created_at: __, updated_at: ___, ...rest } = r
      await admin.from("rota_rules").insert({ ...rest, organisation_id: orgId } as never)
    }
    // Restore staff + skills
    for (const s of backup.config.teamMembers as Record<string, unknown>[]) {
      const { id: _oldId, staff_skills: skills, created_at: __, updated_at: ___, ...rest } = s
      const { data: ns } = await admin.from("staff").insert({ ...rest, organisation_id: orgId } as never).select("id").single()
      if (ns && (skills as unknown[] | undefined)?.length) {
        for (const sk of skills as Record<string, unknown>[]) {
          const { id: _, staff_id: __, ...skRest } = sk
          await admin.from("staff_skills").insert({ ...skRest, staff_id: (ns as { id: string }).id, organisation_id: orgId } as never)
        }
      }
    }
    // Restore lab_config settings
    if (backup.config.tenantSettings) {
      const { id: _, organisation_id: __, created_at: ___, updated_at: ____, ...cfgRest } = backup.config.tenantSettings as Record<string, unknown>
      await admin.from("lab_config").update(cfgRest as never).eq("organisation_id", orgId)
    }
  }

  if (options.rotas) {
    // Clear existing rotas
    await admin.from("rota_assignments").delete().eq("organisation_id", orgId)
    await admin.from("rotas").delete().eq("organisation_id", orgId)

    const rotasToRestore = options.includeDrafts
      ? backup.rotas
      : backup.rotas.filter((r) => r.status === "published")

    for (const rota of rotasToRestore) {
      const { data: newRota } = await typedQuery<{ id: string }>(
        admin
          .from("rotas")
          .insert({ organisation_id: orgId, week_start: rota.weekStart, status: rota.status } as never)
          .select("id")
          .single()
      )

      if (newRota && rota.assignments.length > 0) {
        // Insert assignments in chunks
        const assignments = (rota.assignments as Record<string, unknown>[]).map((a) => ({
          ...a,
          id: undefined,
          rota_id: newRota.id,
          organisation_id: orgId,
        }))
        for (let i = 0; i < assignments.length; i += 100) {
          const chunk = assignments.slice(i, i + 100)
          await admin.from("rota_assignments").insert(chunk as never)
        }
      }
    }
  }

  revalidatePath(`/admin/orgs/${orgId}`)
  return {}
}

/**
 * Nightly cleanup: retention tiers + auto backup purge
 */
export async function runBackupCleanup(orgId: string): Promise<{ error?: string; cleaned: number }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  let cleaned = 0

  // 1. Auto backups: keep last 30
  const { data: autos } = await typedQuery<{ id: string }[]>(
    admin
      .from("backups")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("type", "auto")
      .order("created_at", { ascending: false })
  )

  if (autos && autos.length > 30) {
    const toDelete = autos.slice(30).map((b) => b.id)
    await admin.from("backups").delete().in("id", toDelete)
    cleaned += toDelete.length
  }

  // 2. Rota retention tiers within backups
  const now = new Date()
  const { data: allBackups } = await typedQuery<{ id: string; created_at: string; rotas: BackupRota[] }[]>(
    admin
      .from("backups")
      .select("id, created_at, rotas")
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
  )

  for (const backup of allBackups ?? []) {
    const age = (now.getTime() - new Date(backup.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000) // weeks
    let modified = false
    let rotas = backup.rotas ?? []

    if (age > 52) {
      // > 52 weeks: strip all rota data
      if (rotas.length > 0) { rotas = []; modified = true }
    } else if (age > 12) {
      // 12-52 weeks: keep published only
      const filtered = rotas.filter((r) => r.status === "published")
      if (filtered.length !== rotas.length) { rotas = filtered; modified = true }
    }

    if (modified) {
      await admin.from("backups").update({ rotas } as never).eq("id", backup.id)
      cleaned++
    }
  }

  return { cleaned }
}
