import { createAdminClient } from "@/lib/supabase/admin"

export type AuditAction =
  | "login" | "logout"
  | "config_change"
  | "rota_generated" | "rota_published" | "rota_deleted"
  | "assignment_changed"
  | "rota_assignments_cleared_by_leave"
  | "staff_created" | "staff_updated"
  | "leave_created" | "leave_updated" | "leave_deleted"
  | "skill_updated"
  | "day_regenerated"
  | "user_invited" | "user_role_changed" | "user_removed"

interface AuditEvent {
  orgId: string
  userId?: string | null
  userEmail?: string | null
  action: AuditAction
  entityType?: string
  entityId?: string
  changes?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

/** Log an audit event. Fire-and-forget — never throws. Retries once on failure. */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  const row = {
    organisation_id: event.orgId,
    user_id: event.userId ?? null,
    user_email: event.userEmail ?? null,
    action: event.action,
    entity_type: event.entityType ?? null,
    entity_id: event.entityId ?? null,
    changes: event.changes ?? null,
    metadata: event.metadata ?? null,
  }
  const admin = createAdminClient()
  const { error } = await admin.from("audit_logs").insert(row)
  if (!error) return
  // Retry once after a short delay — transient DB errors shouldn't silently drop audit entries
  await new Promise((r) => setTimeout(r, 500))
  const { error: retryError } = await admin.from("audit_logs").insert(row)
  if (retryError) console.error("[audit] Failed to log event after retry:", retryError)
}
