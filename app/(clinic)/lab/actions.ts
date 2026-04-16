"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { logAuditEvent } from "@/lib/audit"
import type { LabConfigUpdate } from "@/lib/types/database"

export async function updateLabConfig(data: LabConfigUpdate) {
  const supabase = await createClient()

  // Get authenticated user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  // Get org
  const { data: profile } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
    .single() as { data: { organisation_id: string | null } | null }

  if (!profile?.organisation_id) {
    return { error: "No organisation found." }
  }

  // Check role — only admin/manager can update lab config
  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organisation_id", profile.organisation_id)
    .single() as { data: { role: string } | null }

  if (!membership || membership.role === "viewer") {
    return { error: "Permission denied." }
  }

  const { error } = await supabase
    .from("lab_config")
    .update(data)
    .eq("organisation_id", profile.organisation_id)

  if (error) return { error: error.message }

  logAuditEvent({
    orgId: profile.organisation_id, userId: user.id, userEmail: user.email,
    action: "config_change", entityType: "lab_config",
    changes: data as Record<string, unknown>,
  })

  revalidatePath("/lab")
  return { success: true }
}
