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
    .update({ role })
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

export async function suspendUser(userId: string): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876600h", // ~100 years — effectively permanent
  })
  if (error) return { error: error.message }
  revalidatePath("/admin/users")
  return {}
}

export async function unsuspendUser(userId: string): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  })
  if (error) return { error: error.message }
  revalidatePath("/admin/users")
  return {}
}

export async function deleteUser(userId: string): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) return { error: error.message }
  revalidatePath("/admin/users")
  return {}
}

// authMethod: "password" sends a recovery/reset link; "otp" sends a magic link
export async function resendAccess(
  email: string,
  authMethod: "password" | "otp"
): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const type = authMethod === "password" ? "recovery" : "magiclink"
  const { error } = await admin.auth.admin.generateLink({
    type,
    email,
    options: { redirectTo: "https://www.labrota.app/auth/callback" },
  })
  if (error) return { error: error.message }
  return {}
}

