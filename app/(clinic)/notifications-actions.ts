"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { getAuthUser } from "@/lib/auth-cache"
import type { RotaPublishRecipient } from "@/lib/types/database"

async function requireOrgAdmin() {
  const [user, orgId] = await Promise.all([
    getAuthUser(),
    getOrgId(),
  ])
  if (!user) throw new Error("Not authenticated")
  if (!orgId) throw new Error("No organisation")

  const admin = createAdminClient()

  // Verify user is admin in this org
  const { data: member } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", orgId)
    .eq("user_id", user.id)
    .single() as { data: { role: string } | null }

  if (!member || (member.role !== "admin" && member.role !== "manager")) throw new Error("Admin access required")

  return { user, orgId, admin }
}

export type RecipientRow = {
  id: string | null // null = not yet in recipients table
  userId: string | null
  email: string
  name: string
  enabled: boolean
  isExternal: boolean
}

/** Get all potential recipients: org users + external emails */
export async function getPublishRecipients(): Promise<RecipientRow[]> {
  const { orgId, admin } = await requireOrgAdmin()

  // Get all org members with their profiles
  const { data: members } = await admin
    .from("organisation_members")
    .select("user_id, display_name")
    .eq("organisation_id", orgId) as { data: { user_id: string; display_name: string | null }[] | null }

  // Get emails from auth.users
  const userIds = (members ?? []).map((m) => m.user_id)
  const userEmails: Record<string, string> = {}
  for (const uid of userIds) {
    const { data: { user } } = await admin.auth.admin.getUserById(uid)
    if (user?.email) userEmails[uid] = user.email
  }

  // Get existing recipients
  const supabase = await createClient()
  const { data: recipients } = await supabase
    .from("rota_publish_recipients")
    .select("*") as { data: RotaPublishRecipient[] | null }

  const recipientsByUserId = new Map<string, RotaPublishRecipient>()
  const externalRecipients: RotaPublishRecipient[] = []
  for (const r of recipients ?? []) {
    if (r.user_id) recipientsByUserId.set(r.user_id, r)
    else externalRecipients.push(r)
  }

  // Build rows: internal users
  const rows: RecipientRow[] = (members ?? []).map((m) => {
    const existing = recipientsByUserId.get(m.user_id)
    return {
      id: existing?.id ?? null,
      userId: m.user_id,
      email: userEmails[m.user_id] ?? "",
      name: m.display_name ?? userEmails[m.user_id] ?? "",
      enabled: existing?.enabled ?? false,
      isExternal: false,
    }
  }).filter((r) => r.email) // skip users without email

  // Add external recipients
  for (const r of externalRecipients) {
    rows.push({
      id: r.id,
      userId: null,
      email: r.external_email!,
      name: r.external_name ?? r.external_email!,
      enabled: r.enabled,
      isExternal: true,
    })
  }

  return rows
}

/** Toggle an internal user's notification on/off */
export async function toggleRecipient(userId: string, enabled: boolean): Promise<{ error?: string }> {
  const { orgId } = await requireOrgAdmin()
  const supabase = await createClient()

  if (enabled) {
    // Upsert: create or update
    const { error } = await supabase
      .from("rota_publish_recipients")
      .upsert(
        { organisation_id: orgId, user_id: userId, enabled: true } as never,
        { onConflict: "organisation_id,user_id" }
      )
    if (error) return { error: error.message }
  } else {
    // Update to disabled (or delete)
    const { data: existing } = await supabase
      .from("rota_publish_recipients")
      .select("id")
      .eq("organisation_id", orgId)
      .eq("user_id", userId)
      .maybeSingle() as { data: { id: string } | null }

    if (existing) {
      const { error } = await supabase
        .from("rota_publish_recipients")
        .update({ enabled: false } as never)
        .eq("id", existing.id)
      if (error) return { error: error.message }
    }
  }

  revalidatePath("/settings")
  return {}
}

/** Add an external email recipient */
export async function addExternalRecipient(email: string, name: string): Promise<{ error?: string }> {
  const { orgId } = await requireOrgAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("rota_publish_recipients")
    .insert({
      organisation_id: orgId,
      external_email: email.trim().toLowerCase(),
      external_name: name.trim() || null,
      enabled: true,
    } as never)

  if (error) {
    if (error.code === "23505") return { error: "Este email ya está registrado." }
    return { error: error.message }
  }

  revalidatePath("/settings")
  return {}
}

/** Remove an external email recipient */
export async function removeExternalRecipient(id: string): Promise<{ error?: string }> {
  await requireOrgAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("rota_publish_recipients")
    .delete()
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}

/** Toggle an external recipient on/off */
export async function toggleExternalRecipient(id: string, enabled: boolean): Promise<{ error?: string }> {
  await requireOrgAdmin()
  const supabase = await createClient()

  const { error } = await supabase
    .from("rota_publish_recipients")
    .update({ enabled } as never)
    .eq("id", id)

  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}

/** Get the org's rota email format preference */
export async function getRotaEmailFormat(): Promise<"by_shift" | "by_person"> {
  const orgId = await getOrgId()
  if (!orgId) return "by_shift"
  const admin = createAdminClient()
  const { data } = await admin
    .from("organisations")
    .select("rota_email_format")
    .eq("id", orgId)
    .single() as { data: { rota_email_format?: string } | null }
  return (data?.rota_email_format as "by_shift" | "by_person") ?? "by_shift"
}

/** Update the org's rota email format preference */
export async function updateRotaEmailFormat(format: "by_shift" | "by_person"): Promise<{ error?: string }> {
  const { orgId } = await requireOrgAdmin()
  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ rota_email_format: format } as never)
    .eq("id", orgId)
  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}

/** Check if any notification recipients are enabled for the current org */
export async function hasEnabledRecipients(): Promise<boolean> {
  const orgId = await getOrgId()
  if (!orgId) return false
  const supabase = await createClient()
  const { count, error } = await supabase
    .from("rota_publish_recipients")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", orgId)
    .eq("enabled", true)
  if (error) {
    console.error("[hasEnabledRecipients] Query error:", error.message)
    throw new Error(`Failed to check recipients: ${error.message}`)
  }
  return (count ?? 0) > 0
}

/** Get all enabled recipient emails for a given org (used during publish) */
export async function getEnabledRecipientEmails(orgId: string): Promise<string[]> {
  const admin = createAdminClient()

  const { data: recipients } = await admin
    .from("rota_publish_recipients")
    .select("user_id, external_email")
    .eq("organisation_id", orgId)
    .eq("enabled", true) as { data: { user_id: string | null; external_email: string | null }[] | null }

  if (!recipients || recipients.length === 0) return []

  const emails: string[] = []
  for (const r of recipients) {
    if (r.external_email) {
      emails.push(r.external_email)
    } else if (r.user_id) {
      const { data: { user } } = await admin.auth.admin.getUserById(r.user_id)
      if (user?.email) emails.push(user.email)
    }
  }

  return emails
}
