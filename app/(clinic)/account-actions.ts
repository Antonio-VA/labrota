"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export interface UserPreferences {
  locale?: "browser" | "es" | "en"
  theme?: "light" | "dark" | "auto"
  accentColor?: string
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

export async function saveUserPreferences(prefs: UserPreferences): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const { error } = await supabase
    .from("profiles")
    .update({ preferences: prefs } as never)
    .eq("id", user.id)

  if (error) return { error: error.message }
  revalidatePath("/")
  return {}
}
