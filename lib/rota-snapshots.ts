"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import { revalidatePath } from "next/cache"

export interface RotaSnapshot {
  id: string
  date: string
  week_start: string
  assignments: SnapshotAssignment[]
  user_email: string | null
  created_at: string
}

export interface SnapshotAssignment {
  id: string
  staff_id: string
  shift_type: string
  function_label: string | null
  is_manual_override: boolean
  staff: { first_name: string; last_name: string; role: string }
}

/** Capture a snapshot of current assignments for a given day. Fire-and-forget. Uses admin client to avoid RLS/context issues. */
export async function captureSnapshot(rotaId: string, date: string, weekStart: string): Promise<void> {
  try {
    const admin = createAdminClient()

    // Get org ID from the rota
    const { data: rota } = await admin
      .from("rotas")
      .select("organisation_id")
      .eq("id", rotaId)
      .single() as { data: { organisation_id: string } | null }
    if (!rota) return
    const orgId = rota.organisation_id

    // Read current assignments for this day
    const { data: assignments } = await admin
      .from("rota_assignments")
      .select("id, staff_id, shift_type, function_label, is_manual_override, staff:staff_id(first_name, last_name, role)")
      .eq("rota_id", rotaId)
      .eq("date", date) as { data: { id: string; staff_id: string; shift_type: string; function_label: string | null; is_manual_override: boolean; staff: { first_name: string; last_name: string; role: string } | null }[] | null }

    const payload = (assignments ?? []).map((a) => ({
      id: a.id,
      staff_id: a.staff_id,
      shift_type: a.shift_type,
      function_label: a.function_label,
      is_manual_override: a.is_manual_override,
      staff: a.staff ? { first_name: a.staff.first_name, last_name: a.staff.last_name, role: a.staff.role } : { first_name: "?", last_name: "?", role: "lab" },
    }))

    // Deduplicate: skip if identical to most recent snapshot
    const { data: latest } = await admin
      .from("rota_snapshots")
      .select("assignments")
      .eq("organisation_id", orgId)
      .eq("date", date)
      .eq("week_start", weekStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { assignments: unknown } | null }

    if (latest && JSON.stringify(latest.assignments) === JSON.stringify(payload)) return

    await admin.from("rota_snapshots").insert({
      organisation_id: orgId,
      rota_id: rotaId,
      date,
      week_start: weekStart,
      assignments: payload,
    } as never)
  } catch (e) {
    console.error("[snapshot] Failed to capture:", e)
  }
}

/** Get snapshots for a week, optionally filtered by day. */
export async function getSnapshots(weekStart: string, date?: string): Promise<RotaSnapshot[]> {
  const supabase = await createClient()

  let query = supabase
    .from("rota_snapshots")
    .select("id, date, week_start, assignments, user_email, created_at")
    .eq("week_start", weekStart)
    .order("created_at", { ascending: false })
    .limit(50)

  if (date) {
    query = query.eq("date", date)
  }

  const { data } = await query as { data: RotaSnapshot[] | null }
  return data ?? []
}

/** Restore a snapshot: delete current assignments for that day, re-insert from snapshot. */
export async function restoreSnapshot(snapshotId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Fetch snapshot
  const { data: snapshot } = await supabase
    .from("rota_snapshots")
    .select("rota_id, date, week_start, assignments")
    .eq("id", snapshotId)
    .single() as { data: { rota_id: string; date: string; week_start: string; assignments: SnapshotAssignment[] } | null }

  if (!snapshot) return { error: "Snapshot not found." }

  // Capture current state before restoring
  await captureSnapshot(snapshot.rota_id, snapshot.date, snapshot.week_start)

  // Delete current assignments for this day
  await supabase
    .from("rota_assignments")
    .delete()
    .eq("rota_id", snapshot.rota_id)
    .eq("date", snapshot.date)

  // Re-insert from snapshot
  if (snapshot.assignments.length > 0) {
    const rows = snapshot.assignments.map((a) => ({
      rota_id: snapshot.rota_id,
      organisation_id: orgId,
      staff_id: a.staff_id,
      date: snapshot.date,
      shift_type: a.shift_type,
      function_label: a.function_label ?? "",
      is_manual_override: true,
    }))
    const { error } = await supabase.from("rota_assignments").insert(rows as never)
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return {}
}

/** Purge old snapshots: older than 1 month. */
export async function purgeStaleSnapshots(): Promise<void> {
  try {
    const admin = createAdminClient()
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    await admin
      .from("rota_snapshots")
      .delete()
      .lt("created_at", oneMonthAgo.toISOString())
  } catch (e) {
    console.error("[snapshot] Purge failed:", e)
  }
}
