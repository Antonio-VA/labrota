"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

async function assertSuperAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "super_admin") throw new Error("Unauthorised")
}

export async function updateMemberRole(
  userId: string,
  orgId: string,
  role: "admin" | "manager" | "viewer"
): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisation_members")
    .update({ role } as never)
    .eq("user_id", userId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/admin/users")
  return {}
}

export async function removeMember(
  userId: string,
  orgId: string
): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisation_members")
    .delete()
    .eq("user_id", userId)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/admin/users")
  return {}
}
