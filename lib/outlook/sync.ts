import { createAdminClient } from "@/lib/supabase/admin"
import { getValidAccessToken, fetchOOFEvents, type OOFEvent } from "./graph-client"
import { formatDateRange, formatDateWithYear, getMondayOf, toISODate } from "@/lib/format-date"
import type { LeaveType } from "@/lib/types/database"

function formatLeaveRange(start: string, end: string): string {
  const s = start + "T00:00:00"
  const e = end + "T00:00:00"
  return start === end ? formatDateWithYear(s, "en") : formatDateRange(s, e, "en")
}

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

  // Org isolation: the admin client bypasses RLS, so we must verify that
  // staffId actually belongs to orgId before touching any tables.
  const { data: staffRow } = await admin
    .from("staff")
    .select("id")
    .eq("id", staffId)
    .eq("organisation_id", orgId)
    .maybeSingle()
  if (!staffRow) {
    result.errors.push("Staff does not belong to this organisation.")
    return result
  }

  let accessToken: string
  try {
    accessToken = await getValidAccessToken(staffId)
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "Failed to get access token")
    return result
  }

  const today = toISODate()
  const futureDate = toISODate(Date.now() + 90 * 24 * 60 * 60 * 1000)

  let oofEvents: OOFEvent[]
  try {
    oofEvents = await fetchOOFEvents(accessToken, today, futureDate)
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : "Failed to fetch calendar events")
    return result
  }

  const { data: existingLeaves } = await admin
    .from("leaves")
    .select("id, outlook_event_id, start_date, end_date, type")
    .eq("staff_id", staffId)
    .eq("organisation_id", orgId)
    .eq("source", "outlook")
    .gte("end_date", today) as { data: Array<{
      id: string; outlook_event_id: string | null
      start_date: string; end_date: string; type: string
    }> | null }

  const existingMap = new Map(
    (existingLeaves ?? [])
      .filter((l) => l.outlook_event_id)
      .map((l) => [l.outlook_event_id!, l])
  )

  // ── Classify events into create / update / delete buckets ─────────────────
  const processedEventIds = new Set<string>()
  const toCreate: OOFEvent[] = []
  const toUpdate: Array<{ id: string; event: OOFEvent }> = []

  for (const event of oofEvents) {
    processedEventIds.add(event.eventId)
    const existing = existingMap.get(event.eventId)
    if (existing) {
      if (existing.start_date !== event.startDate || existing.end_date !== event.endDate) {
        toUpdate.push({ id: existing.id, event })
      }
    } else {
      toCreate.push(event)
    }
  }

  const toDelete = [...existingMap.values()].filter(
    (l) => !processedEventIds.has(l.outlook_event_id!) && l.end_date >= today
  )

  // ── Bulk insert new leaves ─────────────────────────────────────────────────
  const createdRanges: { start: string; end: string }[] = []
  if (toCreate.length > 0) {
    const rows = toCreate.map((event) => ({
      organisation_id: orgId,
      staff_id: staffId,
      type: guessLeaveType(event.subject),
      start_date: event.startDate,
      end_date: event.endDate,
      status: "approved",
      source: "outlook",
      outlook_event_id: event.eventId,
      notes: `Outlook: ${event.subject}`,
    }))
    const { error } = await admin.from("leaves").insert(rows as never)
    if (error) {
      result.errors.push(`Insert failed: ${error.message}`)
    } else {
      result.created += toCreate.length
      for (const e of toCreate) createdRanges.push({ start: e.startDate, end: e.endDate })
    }
  }

  // ── Concurrent updates ─────────────────────────────────────────────────────
  if (toUpdate.length > 0) {
    const updateResults = await Promise.all(
      toUpdate.map(({ id, event }) =>
        (admin
          .from("leaves")
          .update({ start_date: event.startDate, end_date: event.endDate, type: guessLeaveType(event.subject) })
          .eq("id", id) as unknown) as Promise<{ error: { message: string } | null }>
      )
    )
    for (const r of updateResults) {
      if (r.error) result.errors.push(`Update failed: ${r.error.message}`)
      else result.updated++
    }
  }

  // ── Bulk delete stale leaves ───────────────────────────────────────────────
  const deletedRanges: { start: string; end: string }[] = []
  if (toDelete.length > 0) {
    const idsToDelete = toDelete.map((l) => l.id)
    const { error } = await admin.from("leaves").delete().in("id", idsToDelete) as { error: { message: string } | null }
    if (error) {
      result.errors.push(`Delete failed: ${error.message}`)
    } else {
      result.deleted += toDelete.length
      for (const l of toDelete) deletedRanges.push({ start: l.start_date, end: l.end_date })
    }
  }

  // ── Concurrent rota_assignments cleanup for all affected date ranges ───────
  const allCleanupRanges = [...createdRanges, ...deletedRanges]
  if (allCleanupRanges.length > 0) {
    await Promise.all(
      allCleanupRanges.map(({ start, end }) =>
        admin
          .from("rota_assignments")
          .delete()
          .eq("staff_id", staffId)
          .eq("organisation_id", orgId)
          .gte("date", start)
          .lte("date", end)
      )
    )
  }

  // Update last_synced_at
  await admin
    .from("outlook_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("staff_id", staffId)

  // Notify managers if leaves were created or deleted
  if (result.created > 0 || result.deleted > 0) {
    try {
      const { data: staffData } = await admin
        .from("staff")
        .select("first_name, last_name")
        .eq("id", staffId)
        .single() as { data: { first_name: string; last_name: string } | null }
      const staffName = staffData ? `${staffData.first_name} ${staffData.last_name}` : "Staff"

      const parts: string[] = []
      if (result.created > 0) {
        const dates = createdRanges.slice(0, 2).map(r => formatLeaveRange(r.start, r.end)).join("; ")
        parts.push(`${result.created} added (${dates})`)
      }
      if (result.deleted > 0) {
        const dates = deletedRanges.slice(0, 2).map(r => formatLeaveRange(r.start, r.end)).join("; ")
        parts.push(`${result.deleted} removed (${dates})`)
      }

      const allStartDates = [...createdRanges, ...deletedRanges].map(r => r.start).sort()
      const affectedWeeks = allStartDates.length > 0 ? [getMondayOf(allStartDates[0])] : []

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
          message: `${parts.join(", ")} from ${staffName}'s Outlook calendar.`,
          data: { staffId, created: result.created, deleted: result.deleted, affectedWeeks },
        }))
        await admin.from("notifications").insert(notifications)
      }
    } catch { /* notification failure is non-blocking */ }
  }

  return result
}

const SYNC_CONCURRENCY = 5

// Sync all connected staff for an organisation.
// Uses Promise.allSettled so one staff failure does not silently shortcut the
// whole org — each rejection is captured into totalResult.errors.
export async function syncAllForOrg(orgId: string): Promise<{
  staffSynced: number
  staffFailed: number
  totalResult: SyncResult
}> {
  const admin = createAdminClient()
  const { data: connections } = await admin
    .from("outlook_connections")
    .select("staff_id")
    .eq("organisation_id", orgId)
    .eq("sync_enabled", true) as { data: Array<{ staff_id: string }> | null }

  const totalResult: SyncResult = { created: 0, updated: 0, deleted: 0, errors: [] }
  const staffIds = (connections ?? []).map((c) => c.staff_id)
  let staffFailed = 0

  for (let i = 0; i < staffIds.length; i += SYNC_CONCURRENCY) {
    const batch = staffIds.slice(i, i + SYNC_CONCURRENCY)
    const settled = await Promise.allSettled(batch.map((id) => syncStaffOutlook(id, orgId)))
    for (let j = 0; j < settled.length; j++) {
      const s = settled[j]
      if (s.status === "fulfilled") {
        const r = s.value
        totalResult.created += r.created
        totalResult.updated += r.updated
        totalResult.deleted += r.deleted
        totalResult.errors.push(...r.errors)
      } else {
        staffFailed++
        const msg = s.reason instanceof Error ? s.reason.message : String(s.reason)
        console.error(`[outlook-sync] staff ${batch[j]} threw:`, msg)
        totalResult.errors.push(`staff ${batch[j]}: ${msg}`)
      }
    }
  }

  return { staffSynced: staffIds.length - staffFailed, staffFailed, totalResult }
}
