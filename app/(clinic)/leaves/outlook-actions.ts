"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { syncStaffOutlook } from "@/lib/outlook/sync"
import type { OutlookConnection, Staff } from "@/lib/types/database"

export type OutlookStaffStatus = {
  staffId: string
  staffName: string
  connected: boolean
  email: string | null
  lastSyncedAt: string | null
  syncEnabled: boolean
}

export async function getOutlookSyncStatus(): Promise<{
  enabled: boolean
  staff: OutlookStaffStatus[]
}> {
  const orgId = await getOrgId()
  if (!orgId) return { enabled: false, staff: [] }

  const admin = createAdminClient()

  const [{ data: config }, { data: staffList }, { data: connections }] = await Promise.all([
    admin
      .from("lab_config")
      .select("enable_outlook_sync")
      .eq("organisation_id", orgId)
      .maybeSingle() as unknown as Promise<{ data: { enable_outlook_sync: boolean } | null }>,
    admin
      .from("staff")
      .select("id, first_name, last_name, email")
      .eq("organisation_id", orgId)
      .eq("onboarding_status", "active")
      .order("last_name") as unknown as Promise<{ data: Pick<Staff, "id" | "first_name" | "last_name" | "email">[] | null }>,
    admin
      .from("outlook_connections")
      .select("staff_id, email, last_synced_at, sync_enabled")
      .eq("organisation_id", orgId) as unknown as Promise<{ data: Pick<OutlookConnection, "staff_id" | "email" | "last_synced_at" | "sync_enabled">[] | null }>,
  ])

  const connMap = new Map(
    (connections ?? []).map((c) => [c.staff_id, c])
  )

  return {
    enabled: config?.enable_outlook_sync ?? false,
    staff: (staffList ?? []).map((s) => {
      const conn = connMap.get(s.id)
      return {
        staffId: s.id,
        staffName: `${s.first_name} ${s.last_name}`,
        connected: !!conn,
        email: conn?.email ?? null,
        lastSyncedAt: conn?.last_synced_at ?? null,
        syncEnabled: conn?.sync_enabled ?? false,
      }
    }),
  }
}

export async function syncOutlookForStaff(staffId: string): Promise<{
  created: number
  updated: number
  deleted: number
  errors: string[]
}> {
  const orgId = await getOrgId()
  if (!orgId) return { created: 0, updated: 0, deleted: 0, errors: ["No organisation found"] }

  const result = await syncStaffOutlook(staffId, orgId)
  revalidatePath("/leaves")
  return result
}

export async function syncOutlookAll(): Promise<{
  created: number
  updated: number
  deleted: number
  errors: string[]
}> {
  const orgId = await getOrgId()
  if (!orgId) return { created: 0, updated: 0, deleted: 0, errors: ["No organisation found"] }

  const admin = createAdminClient()
  const { data: connections } = await admin
    .from("outlook_connections")
    .select("staff_id")
    .eq("organisation_id", orgId)
    .eq("sync_enabled", true) as { data: Array<{ staff_id: string }> | null }

  const totals = { created: 0, updated: 0, deleted: 0, errors: [] as string[] }
  for (const conn of connections ?? []) {
    const r = await syncStaffOutlook(conn.staff_id, orgId)
    totals.created += r.created
    totals.updated += r.updated
    totals.deleted += r.deleted
    totals.errors.push(...r.errors)
  }

  revalidatePath("/leaves")
  return totals
}

export async function disconnectOutlook(
  staffId: string,
  keepLeaves: boolean
): Promise<{ error?: string }> {
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found" }

  const admin = createAdminClient()

  // Delete the connection
  const { error: delError } = await admin
    .from("outlook_connections")
    .delete()
    .eq("staff_id", staffId)
    .eq("organisation_id", orgId)
  if (delError) return { error: delError.message }

  if (keepLeaves) {
    // Convert synced leaves to manual
    await admin
      .from("leaves")
      .update({ source: "manual", outlook_event_id: null } as never)
      .eq("staff_id", staffId)
      .eq("organisation_id", orgId)
      .eq("source", "outlook")
  } else {
    // Delete future Outlook-synced leaves
    const today = new Date().toISOString().split("T")[0]
    await admin
      .from("leaves")
      .delete()
      .eq("staff_id", staffId)
      .eq("organisation_id", orgId)
      .eq("source", "outlook")
      .gte("start_date", today)
    // Convert past ones to manual
    await admin
      .from("leaves")
      .update({ source: "manual", outlook_event_id: null } as never)
      .eq("staff_id", staffId)
      .eq("organisation_id", orgId)
      .eq("source", "outlook")
  }

  revalidatePath("/leaves")
  return {}
}

export async function toggleOutlookSync(enabled: boolean): Promise<{ error?: string }> {
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found" }

  const admin = createAdminClient()
  const { error } = await admin
    .from("lab_config")
    .update({ enable_outlook_sync: enabled } as never)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }

  revalidatePath("/settings")
  return {}
}
