"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { HolidayConfig } from "@/lib/types/database"
import { requireOrgEditor } from "./_shared"

export async function getHolidayConfig(): Promise<HolidayConfig | null> {
  const orgId = await getOrgId()
  if (!orgId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from("holiday_config")
    .select("*")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: HolidayConfig | null }

  return data
}

export async function updateHolidayConfig(
  params: Partial<Omit<HolidayConfig, "id" | "organisation_id" | "created_at" | "updated_at">>
): Promise<{ error?: string }> {
  const { orgId, admin } = await requireOrgEditor()

  const { error } = await admin
    .from("holiday_config")
    .update(params)
    .eq("organisation_id", orgId)

  if (error) return { error: error.message }
  revalidatePath("/settings")
  return {}
}
