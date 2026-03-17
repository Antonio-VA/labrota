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

// ── createOrgUser ─────────────────────────────────────────────────────────────
export async function createOrgUser(formData: FormData) {
  await assertSuperAdmin()

  const orgId    = (formData.get("orgId")    as string).trim()
  const email    = (formData.get("email")    as string).trim().toLowerCase()
  const fullName = (formData.get("fullName") as string).trim()

  if (!orgId || !email) return { error: "Organisation and email are required." }

  const admin = createAdminClient()

  // Create the auth user — email already confirmed, they'll sign in via magic link
  const { data, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: fullName || undefined },
  })

  if (createError) {
    if (createError.message.includes("already been registered")) {
      return { error: "A user with that email already exists." }
    }
    return { error: createError.message }
  }

  // Assign to organisation — the trigger already created the profile row
  const { error: profileError } = await admin
    .from("profiles")
    .update({ organisation_id: orgId, full_name: fullName || null } as never)
    .eq("id", data.user.id)

  if (profileError) return { error: profileError.message }

  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}
