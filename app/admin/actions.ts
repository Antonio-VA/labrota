"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { generateSlug } from "@/lib/utils"

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

// ── Coverage presets for new organisations ────────────────────────────────────
const COVERAGE_PRESETS: Record<string, object> = {
  standard: {
    mon: { lab: 3, andrology: 1, admin: 1 }, tue: { lab: 3, andrology: 1, admin: 1 },
    wed: { lab: 3, andrology: 1, admin: 1 }, thu: { lab: 3, andrology: 1, admin: 1 },
    fri: { lab: 3, andrology: 1, admin: 1 }, sat: { lab: 1, andrology: 0, admin: 0 },
    sun: { lab: 0, andrology: 0, admin: 0 },
  },
  minimal: {
    mon: { lab: 2, andrology: 1, admin: 1 }, tue: { lab: 2, andrology: 1, admin: 1 },
    wed: { lab: 2, andrology: 1, admin: 1 }, thu: { lab: 2, andrology: 1, admin: 1 },
    fri: { lab: 2, andrology: 1, admin: 1 }, sat: { lab: 1, andrology: 0, admin: 0 },
    sun: { lab: 0, andrology: 0, admin: 0 },
  },
  andrology: {
    mon: { lab: 3, andrology: 2, admin: 1 }, tue: { lab: 3, andrology: 2, admin: 1 },
    wed: { lab: 3, andrology: 2, admin: 1 }, thu: { lab: 3, andrology: 2, admin: 1 },
    fri: { lab: 3, andrology: 2, admin: 1 }, sat: { lab: 1, andrology: 1, admin: 0 },
    sun: { lab: 0, andrology: 0, admin: 0 },
  },
}

const DEFAULT_PUNCTIONS_BY_DAY = { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 2, sun: 0 }

// ── createOrganisation ────────────────────────────────────────────────────────
export async function createOrganisation(formData: FormData) {
  await assertSuperAdmin()

  const name = (formData.get("name") as string).trim()
  const slug = (formData.get("slug") as string).trim()

  if (!name || !slug) return { error: "Name and slug are required." }

  // Setup configuration (with sensible defaults if not provided)
  const coveragePreset = (formData.get("coverage_preset") as string) || "standard"
  const rotaDisplayModeRaw = (formData.get("rota_display_mode") as string) || "by_shift"
  const rotaDisplayMode = rotaDisplayModeRaw === "by_task" ? "by_task" : "by_shift"
  const country = ((formData.get("country") as string) || "").trim()
  const authMethod = (formData.get("auth_method") as string) === "password" ? "password" : "otp"
  const firstUserEmail = ((formData.get("first_user_email") as string) || "").trim()
  const firstUserName = ((formData.get("first_user_name") as string) || "").trim()

  const admin = createAdminClient()

  // Create org with key settings applied upfront
  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({
      name,
      slug,
      is_active: true,
      rota_display_mode: rotaDisplayMode,
      auth_method: authMethod,
    } as never)
    .select()
    .single()

  if (orgError) {
    if (orgError.code === "23505") return { error: "Slug already taken. Choose another." }
    return { error: orgError.message }
  }

  const orgId = (org as { id: string }).id

  // Seed lab_config row with coverage defaults + regional config
  const coverageByDay = COVERAGE_PRESETS[coveragePreset] ?? COVERAGE_PRESETS.standard
  await admin.from("lab_config").insert({
    organisation_id: orgId,
    coverage_by_day: coverageByDay,
    punctions_by_day: DEFAULT_PUNCTIONS_BY_DAY,
    country,
  } as never)

  // Seed default shift types (T1–T4)
  await admin.from("shift_types").insert([
    { organisation_id: orgId, code: "T1", name_es: "Mañana",      name_en: "Morning",         start_time: "07:30", end_time: "15:30", sort_order: 0 },
    { organisation_id: orgId, code: "T2", name_es: "Tarde",       name_en: "Afternoon",        start_time: "08:30", end_time: "16:30", sort_order: 1 },
    { organisation_id: orgId, code: "T3", name_es: "Tarde-tarde", name_en: "Late afternoon",   start_time: "09:00", end_time: "17:00", sort_order: 2 },
    { organisation_id: orgId, code: "T4", name_es: "Noche",       name_en: "Evening",          start_time: "09:30", end_time: "17:30", sort_order: 3 },
  ] as never[])

  // Optionally invite first admin user
  if (firstUserEmail) {
    const redirectTo = authMethod === "password"
      ? "https://www.labrota.app/auth/callback?next=/set-password"
      : "https://www.labrota.app/auth/callback"
    const { data: userData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(firstUserEmail, {
      data: { full_name: firstUserName || undefined },
      redirectTo,
    })
    if (!inviteError && userData?.user) {
      const userId = userData.user.id
      await admin.from("organisation_members").insert({
        organisation_id: orgId, user_id: userId, role: "admin",
      })
      await admin.from("profiles").update({ organisation_id: orgId, full_name: firstUserName || null }).eq("id", userId)
    }
  }

  revalidatePath("/admin")
  return { success: true, orgId }
}

// ── renameOrganisation ────────────────────────────────────────────────────────
export async function renameOrganisation(orgId: string, newName: string) {
  await assertSuperAdmin()

  const name = newName.trim()
  if (!name) return { error: "Name cannot be empty." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ name, slug: generateSlug(name) })
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

  // Delete child tables first (FK-safe: assignments depend on rotas, skills on staff)
  await admin.from("rota_assignments").delete().eq("organisation_id", orgId)
  await Promise.all([
    admin.from("rotas").delete().eq("organisation_id", orgId),
    admin.from("staff_skills").delete().eq("organisation_id", orgId),
    admin.from("leaves").delete().eq("organisation_id", orgId),
  ])
  await Promise.all([
    admin.from("staff").delete().eq("organisation_id", orgId),
    admin.from("lab_config").delete().eq("organisation_id", orgId),
    admin.from("organisation_members").delete().eq("organisation_id", orgId),
    admin.from("profiles").update({ organisation_id: null }).eq("organisation_id", orgId),
    admin.from("profiles").update({ default_organisation_id: null } as never).eq("default_organisation_id", orgId),
  ])

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
    .update({ is_active: !currentStatus })
    .eq("id", orgId)

  if (error) throw new Error(error.message)
  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
}

// ── updateOrgLogo ─────────────────────────────────────────────────────────────
export async function updateOrgLogo(orgId: string, logoUrl: string | null) {
  if (logoUrl && !logoUrl.startsWith("https://")) return { error: "Logo URL must use HTTPS." }
  await assertSuperAdmin()

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ logo_url: logoUrl })
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

// ── updateOrgAuthMethod ───────────────────────────────────────────────────
const VALID_AUTH_METHODS = new Set(["otp", "password"])
const VALID_DISPLAY_MODES = new Set(["by_shift", "by_task"])

export async function updateOrgAuthMethod(orgId: string, method: "otp" | "password") {
  await assertSuperAdmin()
  if (!VALID_AUTH_METHODS.has(method)) {
    return { error: "Invalid auth method." }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ auth_method: method } as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── updateOrgRegional ──────────────────────────────────────────────────────
export async function updateOrgRegional(orgId: string, country: string, region: string, annualLeaveDays?: number, reduceBudgetOnHolidays?: boolean, defaultDaysPerWeek?: number, partTimeWeight?: number, internWeight?: number) {
  await assertSuperAdmin()

  const admin = createAdminClient()

  // Ensure lab_config exists
  const { data: existing } = await admin
    .from("lab_config")
    .select("organisation_id")
    .eq("organisation_id", orgId)
    .maybeSingle()

  const payload: Record<string, unknown> = { country, region, autonomous_community: region || null }
  if (annualLeaveDays !== undefined) payload.annual_leave_days = annualLeaveDays
  if (defaultDaysPerWeek !== undefined) payload.default_days_per_week = defaultDaysPerWeek
  if (reduceBudgetOnHolidays !== undefined) payload.public_holiday_reduce_budget = reduceBudgetOnHolidays
  if (partTimeWeight !== undefined) payload.part_time_weight = partTimeWeight
  if (internWeight !== undefined) payload.intern_weight = internWeight

  if (!existing) {
    payload.organisation_id = orgId
    const { error } = await admin
      .from("lab_config")
      .insert(payload as never)
    if (error) return { error: error.message }
  } else {
    const { error } = await admin
      .from("lab_config")
      .update(payload as never)
      .eq("organisation_id", orgId)
    if (error) return { error: error.message }
  }

  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── updateOrgDisplayMode ──────────────────────────────────────────────────
export async function updateOrgDisplayMode(orgId: string, mode: "by_shift" | "by_task") {
  await assertSuperAdmin()
  if (!VALID_DISPLAY_MODES.has(mode)) {
    return { error: "Invalid display mode." }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ rota_display_mode: mode } as never)
    .eq("id", orgId)

  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function updateOrgBilling(orgId: string, data: { billing_start: string | null; billing_end: string | null; billing_fee: number | null }) {
  await assertSuperAdmin()
  if (data.billing_fee !== null && (!Number.isFinite(data.billing_fee) || data.billing_fee < 0)) {
    return { error: "Billing fee must be a non-negative number." }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update(data as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function resetOrgImplementation(orgId: string) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  // Full reset: wipe everything except the org record itself
  await admin.from("rota_assignments").delete().eq("organisation_id", orgId)
  await admin.from("rota_snapshots").delete().eq("organisation_id", orgId)
  await admin.from("rotas").delete().eq("organisation_id", orgId)
  await admin.from("staff_skills").delete().eq("organisation_id", orgId)
  await admin.from("leaves").delete().eq("organisation_id", orgId)
  await admin.from("staff").delete().eq("organisation_id", orgId)
  await admin.from("tecnicas").delete().eq("organisation_id", orgId)
  await admin.from("shift_types").delete().eq("organisation_id", orgId)
  await admin.from("departments").delete().eq("organisation_id", orgId)
  await admin.from("rota_rules").delete().eq("organisation_id", orgId)
  await admin.from("lab_config").update({ country: "", region: "", autonomous_community: null }).eq("organisation_id", orgId)
  await admin.from("implementation_steps").delete().eq("organisation_id", orgId)
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function toggleOrgLeaveRequests(orgId: string, enabled: boolean) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("lab_config")
    .update({ enable_leave_requests: enabled })
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function toggleOrgTaskInShift(orgId: string, enabled: boolean) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("lab_config")
    .update({ enable_task_in_shift: enabled })
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function updateOrgEngineConfig(orgId: string, config: {
  ai_optimal_version: string
  engine_hybrid_enabled: boolean
  engine_reasoning_enabled: boolean
  task_optimal_version: string
  task_hybrid_enabled: boolean
  task_reasoning_enabled: boolean
  daily_hybrid_limit: number
}) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update(config as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function updateOrgMaxStaff(orgId: string, maxStaff: number) {
  await assertSuperAdmin()
  if (!Number.isInteger(maxStaff) || maxStaff < 1 || maxStaff > 10000) {
    return { error: "Max staff must be an integer between 1 and 10000." }
  }
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ max_staff: maxStaff } as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function toggleOrgNotes(orgId: string, enabled: boolean) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("lab_config")
    .update({ enable_notes: enabled })
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function toggleOrgSwapRequests(orgId: string, enabled: boolean) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("lab_config")
    .update({ enable_swap_requests: enabled } as never)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function toggleOrgOutlookSync(orgId: string, enabled: boolean) {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("lab_config")
    .update({ enable_outlook_sync: enabled })
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function copyOrganisation(
  sourceOrgId: string,
  newName: string,
  options: { departments?: boolean; shifts?: boolean; tasks?: boolean; rules?: boolean; staff?: boolean; users?: boolean; config?: boolean; rotas?: boolean }
): Promise<{ error?: string; orgId?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { data: source } = await admin.from("organisations").select("*").eq("id", sourceOrgId).single()
  if (!source) return { error: "Source organisation not found" }

  const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + `-${Date.now().toString(36)}`
  const { data: newOrg, error: createErr } = await admin
    .from("organisations")
    .insert({ name: newName, slug, is_active: true, rota_display_mode: (source as { rota_display_mode?: string }).rota_display_mode ?? "by_shift" })
    .select("id").single()
  if (createErr) return { error: createErr.message }
  const newOrgId = (newOrg as { id: string }).id

  // Lab config
  if (options.config !== false) {
    const { data: cfg } = await admin.from("lab_config").select("*").eq("organisation_id", sourceOrgId).maybeSingle()
    if (cfg) {
      const { id: _, organisation_id: __, created_at: ___, updated_at: ____, ...rest } = cfg as Record<string, unknown>
      await admin.from("lab_config").insert({ ...rest, organisation_id: newOrgId })
    } else {
      await admin.from("lab_config").insert({ organisation_id: newOrgId })
    }
  } else {
    await admin.from("lab_config").insert({ organisation_id: newOrgId })
  }

  // Copy config tables in parallel (no FK dependencies between them)
  const copyTasks: Promise<void>[] = []

  if (options.departments) {
    copyTasks.push((async () => {
      const { data } = await admin.from("departments").select("*").eq("organisation_id", sourceOrgId).order("sort_order")
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((d) => { const { id: _, organisation_id: __, created_at: ___, ...rest } = d; return { ...rest, organisation_id: newOrgId } })
        await admin.from("departments").insert(rows as never)
      }
    })())
  }
  if (options.shifts) {
    copyTasks.push((async () => {
      const { data } = await admin.from("shift_types").select("*").eq("organisation_id", sourceOrgId).order("sort_order")
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((s) => { const { id: _, organisation_id: __, created_at: ___, ...rest } = s; return { ...rest, organisation_id: newOrgId } })
        await admin.from("shift_types").insert(rows as never)
      }
    })())
  }
  if (options.tasks) {
    copyTasks.push((async () => {
      const { data } = await admin.from("tecnicas").select("*").eq("organisation_id", sourceOrgId).order("orden")
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((t) => { const { id: _, organisation_id: __, created_at: ___, ...rest } = t; return { ...rest, organisation_id: newOrgId } })
        await admin.from("tecnicas").insert(rows as never)
      }
    })())
  }
  if (options.rules) {
    copyTasks.push((async () => {
      const { data } = await admin.from("rota_rules").select("*").eq("organisation_id", sourceOrgId)
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((r) => { const { id: _, organisation_id: __, created_at: ___, updated_at: ____, ...rest } = r; return { ...rest, organisation_id: newOrgId, staff_ids: [] } })
        await admin.from("rota_rules").insert(rows as never)
      }
    })())
  }
  if (options.users) {
    copyTasks.push((async () => {
      const { data } = await admin.from("organisation_members").select("*").eq("organisation_id", sourceOrgId)
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((m) => { const { organisation_id: _, ...rest } = m; return { ...rest, organisation_id: newOrgId } })
        await admin.from("organisation_members").upsert(rows as never, { onConflict: "organisation_id,user_id" })
      }
    })())
  }

  await Promise.all(copyTasks)

  // Staff first: skill and rota-assignment inserts below need the old→new staff ID map.
  // Both multi-row inserts rely on PostgreSQL preserving input order in the RETURNING
  // clause, which Supabase passes through for .insert([...]).select().
  const staffIdMap = new Map<string, string>()
  if (options.staff) {
    const { data } = await admin.from("staff").select("*, staff_skills(*)").eq("organisation_id", sourceOrgId)
    const staffRows = (data ?? []) as Record<string, unknown>[]
    if (staffRows.length) {
      const staffInserts = staffRows.map((s) => {
        const { id: _, organisation_id: __, created_at: ___, updated_at: ____, staff_skills: _____, ...rest } = s
        return { ...rest, organisation_id: newOrgId }
      })
      const { data: inserted } = await admin.from("staff").insert(staffInserts as never).select("id")
      const insertedRows = (inserted ?? []) as { id: string }[]

      const allSkills: Record<string, unknown>[] = []
      for (let i = 0; i < staffRows.length; i++) {
        const newId = insertedRows[i]?.id
        if (!newId) continue
        staffIdMap.set(staffRows[i].id as string, newId)
        const skills = (staffRows[i].staff_skills as Record<string, unknown>[] | undefined) ?? []
        for (const sk of skills) {
          const { id: _, staff_id: __, organisation_id: ___, ...skRest } = sk
          allSkills.push({ ...skRest, staff_id: newId, organisation_id: newOrgId })
        }
      }
      if (allSkills.length) {
        await admin.from("staff_skills").insert(allSkills as never)
      }
    }
  }

  // Copy rotas and assignments (requires staff mapping)
  if (options.rotas) {
    const { data: rotas } = await admin.from("rotas").select("*").eq("organisation_id", sourceOrgId).order("week_start")
    const rotaRows = (rotas ?? []) as Record<string, unknown>[]
    if (rotaRows.length) {
      const rotaInserts = rotaRows.map((r) => {
        const { id: _, organisation_id: __, created_at: ___, updated_at: ____, ...rest } = r
        return { ...rest, organisation_id: newOrgId }
      })
      const { data: newRotas } = await admin.from("rotas").insert(rotaInserts as never).select("id")
      const newRotaRows = (newRotas ?? []) as { id: string }[]

      const rotaIdMap = new Map<string, string>()
      for (let i = 0; i < rotaRows.length; i++) {
        const newId = newRotaRows[i]?.id
        if (newId) rotaIdMap.set(rotaRows[i].id as string, newId)
      }

      if (rotaIdMap.size > 0) {
        const { data: assignments } = await admin
          .from("rota_assignments")
          .select("*")
          .in("rota_id", Array.from(rotaIdMap.keys()))
        const assignmentRows = ((assignments ?? []) as Record<string, unknown>[])
          .map((a) => {
            const { id: _, organisation_id: __, rota_id: oldRotaId, created_at: ____, updated_at: _____, ...aRest } = a
            const newRotaId = rotaIdMap.get(oldRotaId as string)
            const newStaffId = staffIdMap.get(a.staff_id as string)
            if (!newRotaId || !newStaffId) return null
            const newTraineeId = a.trainee_staff_id ? staffIdMap.get(a.trainee_staff_id as string) ?? null : null
            return { ...aRest, rota_id: newRotaId, organisation_id: newOrgId, staff_id: newStaffId, trainee_staff_id: newTraineeId }
          })
          .filter(Boolean)
        if (assignmentRows.length) {
          await admin.from("rota_assignments").insert(assignmentRows as never)
        }
      }
    }
  }

  revalidatePath("/admin")
  return { orgId: newOrgId }
}
