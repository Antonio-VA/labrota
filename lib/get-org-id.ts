import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

/** Get the authenticated user's organisation_id.
 *  Reads from app_metadata first (matches RLS policy), then cookie, then DB profile.
 *  This ensures the org ID always matches what auth_organisation_id() returns in RLS. */
export async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // 1. Prefer app_metadata — this is what RLS auth_organisation_id() checks
  const metaOrgId = user.app_metadata?.organisation_id as string | undefined
  if (metaOrgId) return metaOrgId

  // 2. Try cookie (set by switchOrg, per-browser)
  const cookieStore = await cookies()
  const cookieOrgId = cookieStore.get("labrota_active_org")?.value
  if (cookieOrgId) return cookieOrgId

  // 3. Fall back to DB profile
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
}
