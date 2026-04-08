import { createAdminClient } from "@/lib/supabase/admin"
import { getValidAccessToken, fetchOOFEvents, type OOFEvent } from "./graph-client"
import { notifyLeaveImpact } from "@/app/(clinic)/notification-actions"
import type { LeaveType } from "@/lib/types/database"

// Map Outlook event subject to leave type using keyword heuristics
function guessLeaveType(subject: string): LeaveType {
  const s = subject.toLowerCase()
  if (/vacation|vacaciones|holiday|festivo|descanso/.test(s)) return "annual"
  if (/sick|enferm|baja|médic|medic|illness/.test(s)) return "sick"
  if (/personal|asunto propio/.test(s)) return "personal"
  if (/training|formación|formacion|curso|congreso/.test(s)) return "training"
  if (/maternidad|paternidad|maternity|paternity/.test(s)) return "maternity"
  return "other"
}

export interface SyncResult {
  created: number
  updated: number
  deleted: number
  errors: string[]
}

export async function syncStaffOutlook(staffId: string, orgId: string): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] }
  const admin = createAdminClient()

  // Get valid access token (auto-refreshes if needed)
  let accessToken: string
  try {
    accessToken = await getValidAccessToken(staffId)
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "Failed to get access token")
    return result
  }

  // Fetch OOF events for the next 90 days
  const today = new Date().toISOString().split("T")[0]
  const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  let oofEvents: OOFEvent[]
  try {
    oofEvents = await fetchOOFEvents(accessToken, today, futureDate)
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "Failed to fetch calendar events")
    return result
  }

  // Load existing Outlook-synced leaves for this staff
  const { data: existingLeaves } = await admin
    .from("leaves")
    .select("id, outlook_event_id, start_date, end_date, type")
    .eq("staff_id", staffId)
    .eq("organisation_id", orgId)
    .eq("source", "outlook")
    .gte("start_date", today) as { data: Array<{
      id: string; outlook_event_id: string | null
      start_date: string; end_date: string; type: string
    }> | null }

  const existingMap = new Map(
    (existingLeaves ?? [])
      .filter((l) => l.outlook_event_id)
      .map((l) => [l.outlook_event_id!, l])
  )

  const processedEventIds = new Set<string>()
  const affectedLeaves: Array<{ startDate: string; endDate: string }> = []

  // Upsert OOF events
  for (const event of oofEvents) {
    processedEventIds.add(event.eventId)
    const existing = existingMap.get(event.eventId)

    if (existing) {
      // Check if dates changed
      if (existing.start_date !== event.startDate || existing.end_date !== event.endDate) {
        const { error } = await admin
          .from("leaves")
          .update({
            start_date: event.startDate,
            end_date: event.endDate,
            type: guessLeaveType(event.subject),
          } as never)
          .eq("id", existing.id)
        if (error) {
          result.errors.push(`Update failed for event ${event.eventId}: ${error.message}`)
        } else {
          result.updated++
          // Auto-remove conflicting rota assignments for updated date range
          await admin
            .from("rota_assignments")
            .delete()
            .eq("staff_id", staffId)
            .eq("organisation_id", orgId)
            .gte("date", event.startDate)
            .lte("date", event.endDate)
          affectedLeaves.push({ startDate: event.startDate, endDate: event.endDate })
        }
      }
    } else {
      // Create new leave
      const { error } = await admin
        .from("leaves")
        .insert({
          organisation_id: orgId,
          staff_id: staffId,
          type: guessLeaveType(event.subject),
          start_date: event.startDate,
          end_date: event.endDate,
          status: "approved",
          source: "outlook",
          outlook_event_id: event.eventId,
          notes: `Outlook: ${event.subject}`,
        } as never)
      if (error) {
        result.errors.push(`Insert failed for event ${event.eventId}: ${error.message}`)
      } else {
        result.created++
        // Auto-remove conflicting rota assignments
        await admin
          .from("rota_assignments")
          .delete()
          .eq("staff_id", staffId)
          .eq("organisation_id", orgId)
          .gte("date", event.startDate)
          .lte("date", event.endDate)
        affectedLeaves.push({ startDate: event.startDate, endDate: event.endDate })
      }
    }
  }

  // Delete future synced leaves whose Outlook events no longer exist
  for (const [eventId, leave] of existingMap) {
    if (!processedEventIds.has(eventId) && leave.start_date >= today) {
      // Also remove conflicting rota assignments
      await admin
        .from("rota_assignments")
        .delete()
        .eq("staff_id", staffId)
        .eq("organisation_id", orgId)
        .gte("date", leave.start_date)
        .lte("date", leave.end_date)

      const { error } = await admin
        .from("leaves")
        .delete()
        .eq("id", leave.id)
      if (error) result.errors.push(`Delete failed for event ${eventId}: ${error.message}`)
      else result.deleted++
    }
  }

  // Update last_synced_at
  await admin
    .from("outlook_connections")
    .update({ last_synced_at: new Date().toISOString() } as never)
    .eq("staff_id", staffId)

  // Notify managers if new leaves were created or updated
  if (result.created > 0 || result.updated > 0) {
    try {
      const { data: staffData } = await admin
        .from("staff")
        .select("first_name, last_name")
        .eq("id", staffId)
        .single() as { data: { first_name: string; last_name: string } | null }
      const staffName = staffData ? `${staffData.first_name} ${staffData.last_name}` : "Staff"

      // Generic sync notification for admins
      if (result.created > 0) {
        const { data: managers } = await admin
          .from("organisation_members")
          .select("user_id")
          .eq("organisation_id", orgId)
          .in("role", ["admin", "manager"]) as { data: Array<{ user_id: string }> | null }

        if (managers && managers.length > 0) {
          const notifications = managers.map(m => ({
            organisation_id: orgId,
            user_id: m.user_id,
            type: "outlook_sync",
            title: "Outlook leave synced",
            message: `${result.created} new leave(s) synced from ${staffName}'s Outlook calendar.`,
            data: { staffId, created: result.created },
          }))
          await admin.from("notifications").insert(notifications as never)
        }
      }

      // Leave impact notifications — alert admins that shifts were removed from rotas
      for (const leave of affectedLeaves) {
        await notifyLeaveImpact({
          orgId,
          staffName,
          startDate: leave.startDate,
          endDate: leave.endDate,
        }).catch((err) => console.error("[outlook-sync] notifyLeaveImpact failed:", err))
      }
    } catch { /* notification failure is non-blocking */ }
  }

  return result
}

// Sync all connected staff for an organisation
export async function syncAllForOrg(orgId: string): Promise<{ staffSynced: number; totalResult: SyncResult }> {
  const admin = createAdminClient()
  const { data: connections } = await admin
    .from("outlook_connections")
    .select("staff_id")
    .eq("organisation_id", orgId)
    .eq("sync_enabled", true) as { data: Array<{ staff_id: string }> | null }

  const totalResult: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] }

  for (const conn of connections ?? []) {
    const r = await syncStaffOutlook(conn.staff_id, orgId)
    totalResult.created += r.created
    totalResult.updated += r.updated
    totalResult.deleted += r.deleted
    totalResult.errors.push(...r.errors)
  }

  return { staffSynced: (connections ?? []).length, totalResult }
}
