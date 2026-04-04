"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

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

export async function saveUserPreferences(prefs: UserPreferences): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  // Merge with existing preferences to avoid wiping unrelated fields
  const { data: existing } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single() as unknown as { data: { preferences: UserPreferences } | null }

  const merged = { ...(existing?.preferences ?? {}), ...prefs }

  const { error } = await supabase
    .from("profiles")
    .update({ preferences: merged } as never)
    .eq("id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}
