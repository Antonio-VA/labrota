import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { UserPreferences } from "@/app/(clinic)/account-actions"

/**
 * Cached auth user — deduplicated within a single server request.
 * Multiple calls to getAuthUser() in the same request only hit Supabase once.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

type CachedProfile = { organisation_id: string | null; preferences: UserPreferences }

/**
 * Cached profile (organisation_id + preferences) — deduplicated within a
 * single server request. One query serves both the org scope and the user's
 * override preferences, so callers that need either can co-read without a
 * second round-trip.
 */
export const getCachedProfile = cache(async (): Promise<CachedProfile> => {
  const user = await getAuthUser()
  if (!user) return { organisation_id: null, preferences: {} }

  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id, preferences")
    .eq("id", user.id)
    .single() as { data: { organisation_id: string | null; preferences: UserPreferences | null } | null }
  return { organisation_id: data?.organisation_id ?? null, preferences: data?.preferences ?? {} }
})

export async function getCachedOrgId(): Promise<string | null> {
  return (await getCachedProfile()).organisation_id
}

export async function getCachedUserPreferences(): Promise<UserPreferences> {
  return (await getCachedProfile()).preferences
}
