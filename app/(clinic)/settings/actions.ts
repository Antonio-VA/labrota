"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { logAuditEvent } from "@/lib/audit"

async function requireOrgAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("Not authenticated")

  const orgId = await getOrgId()
  if (!orgId) throw new Error("No organisation")

  const admin = createAdminClient()
  const { data: membership } = await admin
    .from("organisation_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single() as { data: { role: string } | null }

  if (!membership || membership.role === "viewer") {
    throw new Error("Not authorised")
  }

  return { user, orgId, admin }
}

export interface OrgUser {
  userId: string
  email: string
  displayName: string | null
  role: string
  linkedStaffId: string | null
  lastLogin: string | null
}

export async function getOrgUsers(): Promise<OrgUser[]> {
  const { orgId, admin } = await requireOrgAdmin()

  // Try with linked_staff_id first, fall back without if column doesn't exist yet
  let members: Array<{ user_id: string; role: string; display_name: string | null; linked_staff_id: string | null }> | null = null
  const { data: membersData, error: membersError } = await admin
    .from("organisation_members")
    .select("user_id, role, display_name, linked_staff_id")
    .eq("organisation_id", orgId)
  if (membersError?.message?.includes("linked_staff_id")) {
    const { data: fallback } = await admin
      .from("organisation_members")
      .select("user_id, role, display_name")
      .eq("organisation_id", orgId) as { data: Array<{ user_id: string; role: string; display_name: string | null }> | null }
    members = (fallback ?? []).map((m) => ({ ...m, linked_staff_id: null }))
  } else {
    members = (membersData ?? []) as unknown as typeof members
  }

  if (!members?.length) return []

  const userIds = members.map((m) => m.user_id)
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds) as { data: Array<{ id: string; email: string; full_name: string | null }> | null }

  const profileMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))

  // Get last login from auth — fetch only the org's users
  const authMap: Record<string, string | null> = {}
  const authFetches = userIds.map(async (uid) => {
    const { data } = await admin.auth.admin.getUserById(uid)
    if (data?.user) authMap[uid] = data.user.last_sign_in_at ?? null
  })
  await Promise.all(authFetches)

  return members.map((m) => ({
    userId: m.user_id,
    email: profileMap[m.user_id]?.email ?? "",
    displayName: m.display_name ?? profileMap[m.user_id]?.full_name ?? null,
    role: m.role,
    linkedStaffId: m.linked_staff_id ?? null,
    lastLogin: authMap[m.user_id] ?? null,
  }))
}

export async function inviteOrgUser(email: string, role: string, displayName: string): Promise<{ error?: string }> {
  const { user, orgId, admin } = await requireOrgAdmin()
  const cleanEmail = email.trim().toLowerCase()

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { error: "Email inválido" }
  }

  // Check if auth user already exists via profiles table
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", cleanEmail)
    .maybeSingle() as { data: { id: string } | null }
  const existingUser = existingProfile ? { id: existingProfile.id } : null

  let userId: string
  if (existingUser) {
    userId = existingUser.id
    // Check if already a member
    const { data: existing } = await admin
      .from("organisation_members")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("user_id", userId)
      .maybeSingle()
    if (existing) return { error: "Este usuario ya es miembro de la organización" }
  } else {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(cleanEmail, {
      data: { full_name: displayName || undefined },
      redirectTo: "https://www.labrota.app/auth/callback",
    })
    if (error) return { error: error.message }
    userId = data.user.id
  }

  const { error: memberError } = await admin
    .from("organisation_members")
    .insert({
      organisation_id: orgId,
      user_id: userId,
      role,
      display_name: displayName || null,
    } as never)

  if (memberError) return { error: memberError.message }

  // Set profile org if not set
  const { data: profile } = await admin
    .from("profiles")
    .select("organisation_id")
    .eq("id", userId)
    .single() as { data: { organisation_id: string | null } | null }

  if (!profile?.organisation_id) {
    await admin.from("profiles").update({ organisation_id: orgId } as never).eq("id", userId)
  }

  logAuditEvent({
    orgId,
    userId: user.id,
    userEmail: user.email,
    action: "user_invited",
    entityType: "user",
    changes: { email: cleanEmail, role },
    metadata: { invitedBy: user.email },
  })

  revalidatePath("/settings")
  return {}
}

export async function updateUserRole(targetUserId: string, newRole: string): Promise<{ error?: string }> {
  const { user, orgId, admin } = await requireOrgAdmin()

  // Can't change own role
  if (targetUserId === user.id) return { error: "No puedes cambiar tu propio rol" }

  const { error } = await admin
    .from("organisation_members")
    .update({ role: newRole } as never)
    .eq("organisation_id", orgId)
    .eq("user_id", targetUserId)

  if (error) return { error: error.message }

  logAuditEvent({
    orgId,
    userId: user.id,
    userEmail: user.email,
    action: "user_role_changed",
    entityType: "user",
    changes: { role: newRole },
    metadata: { targetUserId, changedBy: user.email },
  })

  revalidatePath("/settings")
  return {}
}

export async function removeOrgMember(targetUserId: string): Promise<{ error?: string }> {
  const { user, orgId, admin } = await requireOrgAdmin()

  if (targetUserId === user.id) return { error: "No puedes eliminarte a ti mismo" }

  const { error } = await admin
    .from("organisation_members")
    .delete()
    .eq("organisation_id", orgId)
    .eq("user_id", targetUserId)

  if (error) return { error: error.message }

  // Clear profile org if this was their only membership
  const { data: remaining } = await admin
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", targetUserId) as { data: Array<{ organisation_id: string }> | null }

  if (!remaining?.length) {
    await admin.from("profiles").update({ organisation_id: null } as never).eq("id", targetUserId)
  }

  logAuditEvent({
    orgId,
    userId: user.id,
    userEmail: user.email,
    action: "user_removed",
    entityType: "user",
    changes: { targetUserId },
    metadata: { removedBy: user.email },
  })

  revalidatePath("/settings")
  return {}
}

export async function linkUserToStaff(targetUserId: string, staffId: string | null): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgAdmin()

  // Verify staffId belongs to this org (admin client bypasses RLS)
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
    .eq("user_id", targetUserId)

  if (error) return { error: error.message }

  revalidatePath("/settings")
  return {}
}

// ── Org settings ──────────────────────────────────────────────────────────────

export interface OrgSettings {
  name: string
  logoUrl: string | null
  country: string
  region: string
  enableLeaveRequests: boolean
  enableNotes: boolean
  enableTaskInShift: boolean
  displayMode: "by_shift" | "by_task"
  billingStart: string | null
  billingEnd: string | null
  billingFee: number | null
}

export async function getOrgSettings(): Promise<OrgSettings | null> {
  const { orgId, admin } = await requireOrgAdmin()

  const { data: org } = await admin
    .from("organisations")
    .select("name, logo_url, rota_display_mode, billing_start, billing_end, billing_fee")
    .eq("id", orgId)
    .single() as { data: { name: string; logo_url: string | null; rota_display_mode?: string; billing_start?: string | null; billing_end?: string | null; billing_fee?: number | null } | null }

  const { data: config } = await admin
    .from("lab_config")
    .select("country, region, enable_leave_requests, enable_notes, enable_task_in_shift")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { country: string; region: string; enable_leave_requests?: boolean; enable_notes?: boolean; enable_task_in_shift?: boolean } | null }

  if (!org) return null
  return {
    name: org.name,
    logoUrl: org.logo_url,
    country: config?.country ?? "",
    region: config?.region ?? "",
    enableLeaveRequests: config?.enable_leave_requests ?? false,
    enableNotes: config?.enable_notes ?? true,
    enableTaskInShift: config?.enable_task_in_shift ?? false,
    displayMode: (org.rota_display_mode ?? "by_shift") as "by_shift" | "by_task",
    billingStart: org.billing_start ?? null,
    billingEnd: org.billing_end ?? null,
    billingFee: org.billing_fee ?? null,
  }
}

export async function updateOrgName(name: string): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgAdmin()
  const { error } = await admin
    .from("organisations")
    .update({ name } as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  revalidatePath("/")
  return {}
}

export async function updateOrgLogo(logoUrl: string): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgAdmin()
  const { error } = await admin
    .from("organisations")
    .update({ logo_url: logoUrl } as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  revalidatePath("/")
  return {}
}

export async function updateOrgRegional(country: string, region: string): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgAdmin()

  // Check if lab_config exists — create if missing
  const { data: existing } = await admin
    .from("lab_config")
    .select("organisation_id")
    .eq("organisation_id", orgId)
    .maybeSingle()

  if (!existing) {
    const { error: insertError } = await admin
      .from("lab_config")
      .insert({ organisation_id: orgId, country, region, autonomous_community: region || null } as never)
    if (insertError) return { error: insertError.message }
  } else {
    const { error } = await admin
      .from("lab_config")
      .update({ country, region, autonomous_community: region || null } as never)
      .eq("organisation_id", orgId)
    if (error) return { error: error.message }
  }

  revalidatePath("/settings")
  revalidatePath("/")
  return {}
}

export async function toggleLeaveRequests(enabled: boolean): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgAdmin()
  const { error } = await admin
    .from("lab_config")
    .update({ enable_leave_requests: enabled } as never)
    .eq("organisation_id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}

export async function resetImplementation(): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgAdmin()
  // Full reset: wipe everything except the org record itself
  // Phase 1: delete leaf tables that depend on others
  await admin.from("rota_assignments").delete().eq("organisation_id", orgId)
  // Phase 2: delete tables whose children are gone
  await Promise.all([
    admin.from("rota_snapshots").delete().eq("organisation_id", orgId),
    admin.from("rotas").delete().eq("organisation_id", orgId),
    admin.from("staff_skills").delete().eq("organisation_id", orgId),
    admin.from("leaves").delete().eq("organisation_id", orgId),
  ])
  // Phase 3: delete remaining tables (staff depends on skills/leaves being gone)
  await Promise.all([
    admin.from("staff").delete().eq("organisation_id", orgId),
    admin.from("tecnicas").delete().eq("organisation_id", orgId),
    admin.from("shift_types").delete().eq("organisation_id", orgId),
    admin.from("departments").delete().eq("organisation_id", orgId),
    admin.from("rota_rules").delete().eq("organisation_id", orgId),
    admin.from("lab_config").update({ country: "", region: "", autonomous_community: null } as never).eq("organisation_id", orgId),
    admin.from("implementation_steps").delete().eq("organisation_id", orgId),
  ])
  revalidatePath("/settings")
  revalidatePath("/staff")
  revalidatePath("/lab")
  revalidatePath("/")
  return {}
}

export { getOrgId }
