"use server"

import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// ── adminSwitchToOrg — switch super admin's active org context ────────────────
export async function adminSwitchToOrg(orgId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "super_admin") throw new Error("Unauthorised")

  const admin = createAdminClient()

  // Ensure super admin is a member of this org (add as admin if not)
  const { data: existing } = await admin
    .from("organisation_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .maybeSingle()

  if (!existing) {
    await admin.from("organisation_members").insert({
      user_id: user.id,
      organisation_id: orgId,
      role: "admin",
    })
  }

  // Set active org in profile + cookie
  await admin.from("profiles").update({ organisation_id: orgId }).eq("id", user.id)
  const cookieStore = await cookies()
  cookieStore.set("labrota_active_org", orgId, { path: "/", maxAge: 365 * 86400, sameSite: "lax" })

  return { success: true }
}

