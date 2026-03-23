"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

// ── Guard: ensure caller is super admin ───────────────────────────────────────
async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "super_admin") {
    throw new Error("Unauthorised")
  }
}

// ── createOrganisation ────────────────────────────────────────────────────────
export async function createOrganisation(formData: FormData) {
  await assertSuperAdmin()

  const name = (formData.get("name") as string).trim()
  const slug = (formData.get("slug") as string).trim()

  if (!name || !slug) return { error: "Name and slug are required." }

  const admin = createAdminClient()

  // Create org
  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({ name, slug, is_active: true } as never)
    .select()
    .single()

  if (orgError) {
    if (orgError.code === "23505") return { error: "Slug already taken. Choose another." }
    return { error: orgError.message }
  }

  const orgId = (org as { id: string }).id

  // Seed lab_config row for the new org
  await admin.from("lab_config").insert({ organisation_id: orgId } as never)

  revalidatePath("/admin")
  redirect("/")
}

// ── renameOrganisation ────────────────────────────────────────────────────────
export async function renameOrganisation(orgId: string, newName: string) {
  await assertSuperAdmin()

  const name = newName.trim()
  if (!name) return { error: "Name cannot be empty." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ name } as never)
    .eq("id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── deleteOrganisation ────────────────────────────────────────────────────────
export async function deleteOrganisation(orgId: string) {
  await assertSuperAdmin()

  const admin = createAdminClient()

  // Delete in FK-safe order (no assumed CASCADE)
  await admin.from("rota_assignments").delete().eq("organisation_id", orgId)
  await admin.from("rotas").delete().eq("organisation_id", orgId)
  await admin.from("staff_skills").delete().eq("organisation_id", orgId)
  await admin.from("leaves").delete().eq("organisation_id", orgId)
  await admin.from("staff").delete().eq("organisation_id", orgId)
  await admin.from("lab_config").delete().eq("organisation_id", orgId)

  // Remove from organisation_members
  await admin.from("organisation_members").delete().eq("organisation_id", orgId)

  // Detach profiles (keep auth users — they may be re-invited elsewhere)
  await admin
    .from("profiles")
    .update({ organisation_id: null } as never)
    .eq("organisation_id", orgId)

  const { error } = await admin
    .from("organisations")
    .delete()
    .eq("id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/admin")
  return { success: true }
}

// ── toggleOrgStatus ───────────────────────────────────────────────────────────
export async function toggleOrgStatus(orgId: string, currentStatus: boolean) {
  await assertSuperAdmin()

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ is_active: !currentStatus } as never)
    .eq("id", orgId)

  if (error) throw new Error(error.message)
  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
}

// ── updateOrgLogo ─────────────────────────────────────────────────────────────
export async function updateOrgLogo(orgId: string, logoUrl: string | null) {
  await assertSuperAdmin()

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ logo_url: logoUrl } as never)
    .eq("id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── renameOrgUser ─────────────────────────────────────────────────────────────
// Sets the org-specific display_name in organisation_members.
// Passing an empty string clears it (falls back to profiles.full_name globally).
export async function renameOrgUser(userId: string, orgId: string, newName: string) {
  await assertSuperAdmin()

  const display_name = newName.trim() || null
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisation_members")
    .update({ display_name } as never)
    .eq("user_id", userId)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }
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
      .update({ organisation_id: otherMember?.organisation_id ?? null } as never)
      .eq("id", userId)
  }

  revalidatePath(`/admin/orgs/${orgId}`)
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

  // Check if auth user already exists with this email
  const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existingUser = existingUsers?.users.find((u) => u.email === email)

  let userId: string

  if (existingUser) {
    userId = existingUser.id
  } else {
    // New user — invite them
    const { data, error: createError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName || undefined, app_role: appRole },
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
    .upsert({ organisation_id: orgId, user_id: userId, role: appRole, display_name } as never, {
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
      .update({ organisation_id: orgId, full_name: fullName || null } as never)
      .eq("id", userId)
  }

  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── updateOrgRegional ──────────────────────────────────────────────────────
export async function updateOrgRegional(orgId: string, country: string, region: string) {
  await assertSuperAdmin()

  const admin = createAdminClient()
  const { error } = await admin
    .from("lab_config")
    .update({ country, region, autonomous_community: region || null } as never)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}
