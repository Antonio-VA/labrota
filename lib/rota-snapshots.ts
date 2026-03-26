"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
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

/** Capture a snapshot of current assignments for a given day. Fire-and-forget. */
export async function captureSnapshot(rotaId: string, date: string, weekStart: string): Promise<void> {
  try {
    const supabase = await createClient()
    const orgId = await getOrgId()
    if (!orgId) return

    const { data: { user } } = await supabase.auth.getUser()

    // Read current assignments for this day
    const { data: assignments } = await supabase
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
    const { data: latest } = await supabase
      .from("rota_snapshots")
      .select("assignments")
      .eq("organisation_id", orgId)
      .eq("date", date)
      .eq("week_start", weekStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: { assignments: unknown } | null }

    if (latest && JSON.stringify(latest.assignments) === JSON.stringify(payload)) return

    await supabase.from("rota_snapshots").insert({
      organisation_id: orgId,
      rota_id: rotaId,
      date,
      week_start: weekStart,
      assignments: payload,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
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

/** Purge old snapshots: outside current week or older than 1 month. */
export async function purgeStaleSnapshots(): Promise<void> {
  try {
    const admin = createAdminClient()
    const orgId = await getOrgId()
    if (!orgId) return

    // Current week Monday
    const now = new Date()
    const dow = now.getDay()
    const mondayOffset = dow === 0 ? -6 : 1 - dow
    const monday = new Date(now)
    monday.setDate(monday.getDate() + mondayOffset)
    const currentWeekStart = monday.toISOString().split("T")[0]

    // 1 month ago
    const oneMonthAgo = new Date()
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    const cutoff = oneMonthAgo.toISOString()

    // Delete old snapshots
    await admin
      .from("rota_snapshots")
      .delete()
      .eq("organisation_id", orgId)
      .lt("created_at", cutoff)

    // Note: we keep all snapshots for the current week regardless of age
  } catch (e) {
    console.error("[snapshot] Purge failed:", e)
  }
}
