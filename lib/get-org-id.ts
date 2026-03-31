import { createClient } from "@/lib/supabase/server"

/** Get the authenticated user's organisation_id.
 *  Reads from the profiles table — the same source as the RLS
 *  auth_organisation_id() function — to guarantee they always match. */
export async function getOrgId(): Promise<string | null> {
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
