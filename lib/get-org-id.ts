import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"

/** Get the authenticated user's organisation_id.
 *  Reads from cookie first (per-browser session), falls back to DB profile.
 *  This prevents cross-device org mixing when the same user is logged in on two computers. */
export async function getOrgId(): Promise<string | null> {
  // 1. Try cookie (set by switchOrg, per-browser)
  const cookieStore = await cookies()
  const cookieOrgId = cookieStore.get("labrota_active_org")?.value
  if (cookieOrgId) return cookieOrgId

  // 2. Fall back to DB profile
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
}
