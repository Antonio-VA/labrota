import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser } from "@/lib/auth-cache"

/**
 * Verifies that the current session user is allowed to connect/disconnect
 * Outlook sync for the given staff record. A user may only act on the staff
 * row they are linked to in organisation_members — OAuth consent cannot be
 * given on behalf of another Microsoft account.
 *
 * Returns null on success, or a short machine-readable reason on failure.
 */
export async function authorizeOutlookConnection(
  staffId: string,
  orgId: string,
): Promise<"unauthenticated" | "not_a_member" | "staff_mismatch" | null> {
  const user = await getAuthUser()
  if (!user) return "unauthenticated"

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("organisation_members")
    .select("linked_staff_id")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { linked_staff_id: string | null } | null }

  if (!membership) return "not_a_member"
  if (membership.linked_staff_id !== staffId) return "staff_mismatch"
  return null
}
