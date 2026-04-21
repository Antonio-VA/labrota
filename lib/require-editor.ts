import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser, getCachedOrgId } from "@/lib/auth-cache"

/**
 * Call at the top of any server page that requires edit access.
 * Redirects viewers to the calendar.
 * Uses cached auth helpers to avoid redundant queries.
 *
 * Defense in depth: the clinic layout already redirects unauthenticated
 * users and users with no org membership, so in normal routing these
 * branches are unreachable — but we redirect here too to close the gap
 * if this guard is ever called from a context that bypasses the layout.
 */
export async function requireEditor() {
  const [user, orgId] = await Promise.all([
    getAuthUser(),
    getCachedOrgId(),
  ])
  if (!user) redirect("/login")
  if (!orgId) redirect("/login?error=no_access")

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single() as { data: { role: string } | null }

  if (membership?.role === "viewer") {
    redirect("/")
  }
}
