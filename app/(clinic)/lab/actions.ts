"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { LabConfigUpdate } from "@/lib/types/database"

export async function updateLabConfig(data: LabConfigUpdate) {
  const supabase = await createClient()

  // Get the authenticated user's organisation_id
  const { data: profile } = await supabase
    .from("profiles")
    .select("organisation_id")
    .single() as { data: { organisation_id: string | null } | null }

  if (!profile?.organisation_id) {
    return { error: "No organisation found." }
  }

  const { error } = await supabase
    .from("lab_config")
    .update(data as never)
    .eq("organisation_id", profile.organisation_id)

  if (error) return { error: error.message }

  revalidatePath("/lab")
  return { success: true }
}
