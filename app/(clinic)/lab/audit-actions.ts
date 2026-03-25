"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"

export interface AuditLogEntry {
  id: string
  user_email: string | null
  action: string
  entity_type: string | null
  changes: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export async function getAuditLogs(filters?: {
  from?: string
  to?: string
  action?: string
  limit?: number
}): Promise<AuditLogEntry[]> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return []

  let query = supabase
    .from("audit_logs")
    .select("id, user_email, action, entity_type, changes, metadata, created_at")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })
    .limit(filters?.limit ?? 100)

  if (filters?.from) query = query.gte("created_at", filters.from)
  if (filters?.to) query = query.lte("created_at", filters.to + "T23:59:59")
  if (filters?.action) query = query.eq("action", filters.action)

  const { data } = await query as { data: AuditLogEntry[] | null }
  return data ?? []
}
