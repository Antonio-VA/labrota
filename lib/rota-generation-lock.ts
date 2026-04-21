import type { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

// 3 minutes — safely under Vercel's max function duration on all plans.
// A function killed on timeout won't run finally blocks, so we need this
// short enough that the next attempt can take over without waiting long.
const STALE_LOCK_MS = 3 * 60 * 1000

export const ROTA_GENERATION_LOCK_ERROR =
  "Another rota generation is already in progress for this week. Please wait a moment and retry."

/**
 * Atomically claim the generation lock on a rota row.
 *
 * The underlying UPDATE only flips `generating_at` if it is currently
 * null or older than STALE_LOCK_MS, so two concurrent callers can never
 * both acquire — the second's `.select().maybeSingle()` returns null
 * because Postgres sees no matching row after the WHERE clause.
 *
 * Stale locks (>3 min old) are silently taken over, so a crashed or
 * timed-out generator never permanently wedges a week.
 */
export async function acquireRotaGenerationLock(
  supabase: SupabaseServerClient,
  rotaId: string,
): Promise<boolean> {
  const staleCutoff = new Date(Date.now() - STALE_LOCK_MS).toISOString()
  const { data } = await supabase
    .from("rotas")
    .update({ generating_at: new Date().toISOString() })
    .eq("id", rotaId)
    .or(`generating_at.is.null,generating_at.lt.${staleCutoff}`)
    .select("id")
    .maybeSingle()
  return data !== null
}

/**
 * Release the generation lock. Uses the admin client so the release always
 * succeeds even if the user session has expired (e.g. in a finally block
 * after a long-running generation).
 */
export async function releaseRotaGenerationLock(
  _supabase: SupabaseServerClient,
  rotaId: string,
): Promise<void> {
  const admin = createAdminClient()
  await admin.from("rotas").update({ generating_at: null }).eq("id", rotaId)
}
