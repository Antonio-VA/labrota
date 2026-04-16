import "server-only"
import { createClient } from "@supabase/supabase-js"
import type { Database } from "@/lib/types/database"

/**
 * Service-role Supabase client — bypasses RLS entirely.
 * Typed with Database interface so `.from()` / `.insert()` / `.update()`
 * have proper inference — no more `as never` casts needed.
 *
 * Use ONLY in server-side code (Server Components, Server Actions, Route Handlers).
 * NEVER import in client components.
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}
