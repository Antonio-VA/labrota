"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  PREFS_TS_COOKIE, PREFS_TTL_COOKIE, PREFS_COOKIE_OPTS, PREFS_TTL_MS,
} from "@/lib/preferences-cookies"

export interface FavoriteView {
  view: string
  calendarLayout: string
  daysAsRows: boolean
  compact: boolean
  colorChips: boolean
  highlightEnabled: boolean
}

export interface MobileFavoriteView {
  viewMode: string   // "shift" | "person"
  compact: boolean
  deptColor: boolean
}

export interface UserPreferences {
  locale?: "browser" | "es" | "en"
  theme?: "light" | "dark" | "auto"
  accentColor?: string
  timeFormat?: "24h" | "12h"
  firstDayOfWeek?: number // 0=Mon, 5=Sat, 6=Sun
  fontScale?: "s" | "m" | "l" // s=90%, m=100%, l=110%
  favoriteView?: FavoriteView
  mobileFavoriteView?: MobileFavoriteView
}

export async function getUserProfile(): Promise<{ email: string | null; fullName: string | null; avatarUrl: string | null }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { email: null, fullName: null, avatarUrl: null }
  return {
    email: user.email ?? null,
    fullName: (user.user_metadata?.full_name as string) ?? null,
    avatarUrl: (user.user_metadata?.avatar_url as string) ?? null,
  }
}

export async function getUserDepartment(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from("staff")
    .select("role")
    .eq("email", user.email ?? "")
    .maybeSingle() as unknown as { data: { role: string } | null }

  return data?.role ?? null
}

export async function getUserPreferences(): Promise<UserPreferences> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return {}

  const { data } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single() as unknown as { data: { preferences: UserPreferences } | null }

  return data?.preferences ?? {}
}

export async function uploadAvatar(formData: FormData): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const file = formData.get("avatar") as File
  if (!file || file.size === 0) return { error: "No file provided." }
  if (file.size > 2 * 1024 * 1024) return { error: "File exceeds 2MB limit." }

  const ext = file.name.split(".").pop() ?? "jpg"
  const path = `avatars/${user.id}.${ext}`

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type })
  if (uploadError) return { error: uploadError.message }

  const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(path)
  const url = `${urlData.publicUrl}?t=${Date.now()}`

  // Update user metadata
  await supabase.auth.updateUser({ data: { avatar_url: url } })

  revalidatePath("/")
  return { url }
}

export async function saveUserPreferences(prefs: UserPreferences): Promise<{ error?: string; updatedAt?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const { data: existing } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single() as unknown as { data: { preferences: UserPreferences } | null }

  const merged = { ...(existing?.preferences ?? {}), ...prefs }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ preferences: merged })
    .eq("id", user.id)
    .select("preferences_updated_at")
    .single<{ preferences_updated_at: string }>()

  if (error || !updated) return { error: error?.message ?? "Failed to save preferences." }

  const updatedAt = updated.preferences_updated_at
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()
  cookieStore.set(PREFS_TS_COOKIE, updatedAt, PREFS_COOKIE_OPTS)
  cookieStore.set(PREFS_TTL_COOKIE, String(Date.now() + PREFS_TTL_MS), PREFS_COOKIE_OPTS)

  revalidatePath("/")
  return { updatedAt }
}

export interface UserOutlookStatus {
  available: boolean   // feature enabled for this user's org
  connected: boolean
  email: string | null
  lastSyncedAt: string | null
  staffId: string | null
  orgId: string | null
}

export async function getUserOutlookStatus(): Promise<UserOutlookStatus> {
  const none: UserOutlookStatus = { available: false, connected: false, email: null, lastSyncedAt: null, staffId: null, orgId: null }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return none

  const admin = createAdminClient()

  // Get org id first (needed for all subsequent queries)
  const { data: profile } = await admin
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
    .single() as { data: { organisation_id: string | null } | null }
  const orgId = profile?.organisation_id
  if (!orgId) return none

  // Fetch feature flag, linked staff member, and email-fallback staff in parallel
  const [configRes, memberRes, staffRes] = await Promise.all([
    admin.from("lab_config").select("enable_outlook_sync").eq("organisation_id", orgId).maybeSingle() as unknown as Promise<{ data: { enable_outlook_sync: boolean } | null }>,
    admin.from("organisation_members").select("linked_staff_id").eq("user_id", user.id).eq("organisation_id", orgId).maybeSingle() as unknown as Promise<{ data: { linked_staff_id: string | null } | null }>,
    admin.from("staff").select("id").eq("email", user.email ?? "").eq("organisation_id", orgId).maybeSingle() as unknown as Promise<{ data: { id: string } | null }>,
  ])

  if (!configRes.data?.enable_outlook_sync) return none

  const staffId = memberRes.data?.linked_staff_id ?? staffRes.data?.id ?? null
  if (!staffId) return { available: true, connected: false, email: null, lastSyncedAt: null, staffId: null, orgId }

  const { data: conn } = await admin
    .from("outlook_connections")
    .select("email, last_synced_at")
    .eq("staff_id", staffId)
    .maybeSingle() as { data: { email: string; last_synced_at: string | null } | null }

  return {
    available: true,
    connected: !!conn,
    email: conn?.email ?? null,
    lastSyncedAt: conn?.last_synced_at ?? null,
    staffId,
    orgId,
  }
}
