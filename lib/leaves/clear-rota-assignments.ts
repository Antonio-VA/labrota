import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/types/database"
import { logAuditEvent } from "@/lib/audit"
import { captureWeekSnapshot } from "@/lib/rota-snapshots"

/**
 * Removes rota assignments that overlap a leave and audits the side effect.
 *
 * Leave approval deletes rows from `rota_assignments` even when the rota is
 * already published — that's intentional, but without a trail there's no way
 * to reconstruct what the schedule looked like before the approval. Emit a
 * `rota_assignments_cleared_by_leave` audit entry with the affected count so
 * managers can see the impact after the fact.
 */
export async function clearRotaAssignmentsForLeave(params: {
  client: SupabaseClient<Database>
  orgId: string
  staffId: string
  startDate: string
  endDate: string
  leaveId: string
  userId?: string | null
  trigger: "leave_created" | "leave_updated" | "leave_approved"
}): Promise<void> {
  const { client, orgId, staffId, startDate, endDate, leaveId, userId, trigger } = params

  // Snapshot every affected week before deletion so the schedule can be recovered.
  // captureWeekSnapshot uses its own admin client and is safe to call from any context.
  const weekStarts: string[] = []
  const cur = new Date(startDate + "T12:00:00")
  const end = new Date(endDate + "T12:00:00")
  cur.setDate(cur.getDate() - ((cur.getDay() + 6) % 7)) // rewind to Monday
  while (cur <= end) {
    weekStarts.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 7)
  }
  const { data: affectedRotas } = await client
    .from("rotas")
    .select("id, week_start")
    .eq("organisation_id", orgId)
    .in("week_start", weekStarts) as { data: { id: string; week_start: string }[] | null }
  if (affectedRotas?.length) {
    await Promise.all(affectedRotas.map((r) => captureWeekSnapshot(r.id, r.week_start)))
  }

  const { data } = await client
    .from("rota_assignments")
    .delete()
    .eq("staff_id", staffId)
    .eq("organisation_id", orgId)
    .gte("date", startDate)
    .lte("date", endDate)
    .select("id") as { data: { id: string }[] | null }

  const count = data?.length ?? 0
  if (count === 0) return

  await logAuditEvent({
    orgId,
    userId,
    action: "rota_assignments_cleared_by_leave",
    entityType: "leave",
    entityId: leaveId,
    metadata: { staff_id: staffId, start_date: startDate, end_date: endDate, count, trigger },
  })
}
