import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Call at the top of any server page that requires edit access.
 * Redirects viewers to the calendar.
 */
export async function requireEditor() {
  const supabase = await createClient()
  const admin = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  // Fetch profile + membership in parallel instead of sequentially
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase
      .from("profiles")
      .select("organisation_id")
      .eq("id", user.id)
      .single() as unknown as Promise<{ data: { organisation_id: string | null } | null }>,
    admin
      .from("organisation_members")
      .select("organisation_id, role")
      .eq("user_id", user.id) as unknown as Promise<{ data: Array<{ organisation_id: string; role: string }> | null }>,
  ])

  if (!profile?.organisation_id) return

  const membership = memberships?.find((m) => m.organisation_id === profile.organisation_id)
  if (membership?.role === "viewer") {
    redirect("/")
  }
}
