"use server"

import { withOrgId } from "@/lib/with-org-id"

export interface AuditLogEntry {
  id: string
  user_email: string | null
  action: string
  entity_type: string | null
  changes: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface AuditLogPage {
  entries: AuditLogEntry[]
  total: number
}

export async function getAuditLogs(filters?: {
  from?: string
  to?: string
  action?: string
  userEmail?: string
  /** Number of rows to return (default 25). */
  limit?: number
  /** Zero-based row offset for server-side pagination (default 0). */
  offset?: number
}): Promise<AuditLogPage | { error: string }> {
  return withOrgId(async (orgId, supabase) => {
    const limit = filters?.limit ?? 25
    const offset = filters?.offset ?? 0

    let query = supabase
      .from("audit_logs")
      .select("id, user_email, action, entity_type, changes, metadata, created_at", { count: "exact" })
      .eq("organisation_id", orgId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (filters?.from) query = query.gte("created_at", filters.from)
    if (filters?.to) query = query.lte("created_at", filters.to + "T23:59:59")
    if (filters?.action) query = query.eq("action", filters.action)
    if (filters?.userEmail) query = query.ilike("user_email", `%${filters.userEmail}%`)

    const { data, count } = await query as { data: AuditLogEntry[] | null; count: number | null }
    return { entries: data ?? [], total: count ?? 0 }
  })
}

/** Distinct non-null user emails for the action filter dropdown. */
export async function getAuditLogUsers(): Promise<string[] | { error: string }> {
  return withOrgId(async (orgId, supabase) => {
    const { data } = await supabase
      .from("audit_logs")
      .select("user_email")
      .eq("organisation_id", orgId)
      .not("user_email", "is", null)
      .order("user_email")
      .limit(500) as { data: Array<{ user_email: string | null }> | null }
    const seen = new Set<string>()
    for (const row of data ?? []) {
      if (row.user_email) seen.add(row.user_email)
    }
    return [...seen]
  })
}
