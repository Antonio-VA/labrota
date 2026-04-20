import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { getAuthUser } from "@/lib/auth-cache"

/**
 * Returns a service-role Supabase client — callers bypass RLS. Use only in
 * actions that need to touch multiple org-scoped tables with admin checks
 * already enforced by the membership lookup below.
 */
export async function requireOrgEditor() {
  const [user, orgId] = await Promise.all([getAuthUser(), getOrgId()])
  if (!user) throw new Error("Not authenticated")
  if (!orgId) throw new Error("No organisation")

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single() as { data: { role: string } | null }

  if (!membership || membership.role === "viewer") {
    throw new Error("Not authorised")
  }

  return { user, orgId, admin }
}
