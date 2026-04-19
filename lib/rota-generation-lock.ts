import type { createClient } from "@/lib/supabase/server"

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>

const STALE_LOCK_MS = 10 * 60 * 1000

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
 * Stale locks (>10 min old) are silently taken over, so a crashed
 * generator never permanently wedges a week.
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

export async function releaseRotaGenerationLock(
  supabase: SupabaseServerClient,
  rotaId: string,
): Promise<void> {
  await supabase.from("rotas").update({ generating_at: null }).eq("id", rotaId)
}
