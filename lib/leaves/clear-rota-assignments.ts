import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/types/database"
import { logAuditEvent } from "@/lib/audit"

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
