import "server-only"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/types/database"

type ActionResult<T> = T | { error: string }

/**
 * Wraps a server action with org-id auth boilerplate.
 * Creates a Supabase client, resolves the org ID, and returns
 * `{ error: "Not authenticated." }` if no org is found.
 */
export async function withOrgId<T>(
  fn: (orgId: string, supabase: SupabaseClient<Database>) => Promise<T>
): Promise<ActionResult<T>> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  return fn(orgId, supabase)
}
