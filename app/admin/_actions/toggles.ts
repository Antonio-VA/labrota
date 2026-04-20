"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { assertSuperAdmin } from "./_shared"

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
