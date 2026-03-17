import { createClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client — bypasses RLS entirely.
 * Uses plain (untyped) createClient; annotate query results
 * explicitly with types from @/lib/types/database where needed.
 *
 * Use ONLY in server-side code (Server Components, Server Actions, Route Handlers).
 * NEVER import in client components.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
    }
  )
}
