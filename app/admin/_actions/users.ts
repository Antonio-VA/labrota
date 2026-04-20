"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertSuperAdmin } from "./_shared"

// ── renameOrgUser ─────────────────────────────────────────────────────────────
// Sets the org-specific display_name in organisation_members.
// Passing an empty string clears it (falls back to profiles.full_name globally).
export async function renameOrgUser(userId: string, orgId: string, newName: string) {
  await assertSuperAdmin()

  const display_name = newName.trim() || null
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisation_members")
    .update({ display_name })
    .eq("user_id", userId)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }
  return { success: true }
}

// ── updateOrgUserRole ─────────────────────────────────────────────────────────
const VALID_MEMBER_ROLES = new Set(["admin", "manager", "viewer"])

export async function updateOrgUserRole(userId: string, orgId: string, newRole: string) {
  await assertSuperAdmin()

  if (!VALID_MEMBER_ROLES.has(newRole)) {
    return { error: "Invalid role." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisation_members")
    .update({ role: newRole })
    .eq("user_id", userId)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── removeOrgUser ─────────────────────────────────────────────────────────────
export async function removeOrgUser(userId: string, orgId: string) {
  await assertSuperAdmin()

  const admin = createAdminClient()

  // Remove from organisation_members
  const { error } = await admin
    .from("organisation_members")
    .delete()
    .eq("user_id", userId)
    .eq("organisation_id", orgId)

  if (error) throw new Error(error.message)

  // If this was their active org, clear it (or switch to another they belong to)
  const { data: profile } = await admin
    .from("profiles")
    .select("organisation_id")
    .eq("id", userId)
    .single() as { data: { organisation_id: string | null } | null }

  if (profile?.organisation_id === orgId) {
    // Find another org they're still in
    const { data: otherMember } = await admin
      .from("organisation_members")
      .select("organisation_id")
      .eq("user_id", userId)
      .neq("organisation_id", orgId)
      .limit(1)
      .single() as { data: { organisation_id: string } | null }

    await admin
      .from("profiles")
      .update({ organisation_id: otherMember?.organisation_id ?? null })
      .eq("id", userId)
  }

  revalidatePath(`/admin/orgs/${orgId}`)
}

// ── adminLinkUserToStaff ──────────────────────────────────────────────────────
export async function adminLinkUserToStaff(userId: string, orgId: string, staffId: string | null): Promise<{ error?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()

  if (staffId) {
    const { data: staff } = await admin
      .from("staff")
      .select("id")
      .eq("id", staffId)
      .eq("organisation_id", orgId)
      .maybeSingle()
    if (!staff) return { error: "Staff member not found in this organisation." }
  }

  const { error } = await admin
    .from("organisation_members")
    .update({ linked_staff_id: staffId } as never)
    .eq("organisation_id", orgId)
    .eq("user_id", userId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return {}
}

// ── createOrgUser ─────────────────────────────────────────────────────────────
export async function createOrgUser(formData: FormData) {
  await assertSuperAdmin()

  const orgId    = (formData.get("orgId")    as string).trim()
  const email    = (formData.get("email")    as string).trim().toLowerCase()
  const fullName = (formData.get("fullName") as string).trim()
  const appRole  = (formData.get("appRole")  as string | null)?.trim() ?? "admin"

  if (!orgId || !email) return { error: "Organisation and email are required." }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Invalid email format." }

  const admin = createAdminClient()

  // Check if auth user already exists via profiles table
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle() as { data: { id: string } | null }
  const existingUser = existingProfile ? { id: existingProfile.id } : null

  let userId: string

  if (existingUser) {
    userId = existingUser.id
  } else {
    // Determine redirect based on org auth method
    const { data: orgData } = await admin
      .from("organisations")
      .select("auth_method")
      .eq("id", orgId)
      .single() as { data: { auth_method: string } | null }
    const redirectTo = orgData?.auth_method === "password"
      ? "https://www.labrota.app/auth/callback?next=/set-password"
      : "https://www.labrota.app/auth/callback"

    // New user — invite them
    const { data, error: createError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName || undefined, app_role: appRole },
      redirectTo,
    })
    if (createError) return { error: createError.message }
    userId = data.user.id
  }

  // Determine display_name: set only when the entered name differs from the user's global name
  let display_name: string | null = null
  if (fullName && existingUser) {
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single() as { data: { full_name: string | null } | null }
    if (fullName !== (existingProfile?.full_name ?? "")) {
      display_name = fullName
    }
  }

  // Add to organisation_members
  const { error: memberError } = await admin
    .from("organisation_members")
    .upsert({ organisation_id: orgId, user_id: userId, role: appRole, display_name }, {
      onConflict: "organisation_id,user_id",
    })

  if (memberError) return { error: memberError.message }

  // If this is their first org (profile has no active org), set it as active
  const { data: profile } = await admin
    .from("profiles")
    .select("organisation_id")
    .eq("id", userId)
    .single() as { data: { organisation_id: string | null } | null }

  if (!profile?.organisation_id) {
    await admin
      .from("profiles")
      .update({ organisation_id: orgId, full_name: fullName || null })
      .eq("id", userId)
  }

  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

