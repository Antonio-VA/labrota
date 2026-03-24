"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function switchOrg(orgId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const admin = createAdminClient()

  // Verify the user is actually a member of this org
  const { data: member } = await admin
    .from("organisation_members")
    .select("id")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single()

  if (!member) return { error: "Not a member of this organisation" }

  const { error } = await admin
    .from("profiles")
    .update({ organisation_id: orgId } as never)
    .eq("id", user.id)

  if (error) return { error: error.message }

  revalidatePath("/")
  return {}
}

export async function setDefaultOrg(orgId: string | null): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated" }

  const admin = createAdminClient()

  // If setting a default, verify membership
  if (orgId) {
    const { data: member } = await admin
      .from("organisation_members")
      .select("id")
      .eq("user_id", user.id)
      .eq("organisation_id", orgId)
      .single()
    if (!member) return { error: "Not a member of this organisation" }
  }

  const { error } = await admin
    .from("profiles")
    .update({ default_organisation_id: orgId } as never)
    .eq("id", user.id)

  if (error) return { error: error.message }
  return {}
}
