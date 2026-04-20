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

/** Log an audit event. Fire-and-forget — never throws. */
export async function logAuditEvent(event: AuditEvent): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from("audit_logs").insert({
      organisation_id: event.orgId,
      user_id: event.userId ?? null,
      user_email: event.userEmail ?? null,
      action: event.action,
      entity_type: event.entityType ?? null,
      entity_id: event.entityId ?? null,
      changes: event.changes ?? null,
      metadata: event.metadata ?? null,
    })
  } catch (e) {
    console.error("[audit] Failed to log event:", e)
  }
}
