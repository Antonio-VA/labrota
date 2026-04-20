"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"

export async function getOrgDisplayMode(): Promise<{ mode: string; orgName: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { mode: "by_shift", orgName: "" }
  const { data } = await supabase.from("organisations").select("name, rota_display_mode").eq("id", orgId).single()
  return { mode: (data as { rota_display_mode?: string } | null)?.rota_display_mode ?? "by_shift", orgName: (data as { name: string } | null)?.name ?? "" }
}
