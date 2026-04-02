import { cache } from "react"
import { createClient } from "@/lib/supabase/server"

/**
 * Cached auth user — deduplicated within a single server request.
 * Multiple calls to getAuthUser() in the same request only hit Supabase once.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * Cached organisation_id — deduplicated within a single server request.
 * Reads from profiles table (same source as RLS auth_organisation_id()).
 */
export const getCachedOrgId = cache(async (): Promise<string | null> => {
  const user = await getAuthUser()
  if (!user) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
})
