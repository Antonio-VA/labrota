import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Call at the top of any server page that requires edit access.
 * Redirects viewers to the calendar.
 */
export async function requireEditor() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return

  const { data: profile } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
    .single() as { data: { organisation_id: string | null } | null }

  if (!profile?.organisation_id) return

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organisation_id", profile.organisation_id)
    .single() as { data: { role: string } | null }

  if (membership?.role === "viewer") {
    redirect("/")
  }
}
