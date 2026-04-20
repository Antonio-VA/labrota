"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import type { SwapRequest } from "@/lib/types/database"
import type { SwapRequestWithNames } from "./types"

// ── Manager: get pending swap requests ──────────────────────────────────────

export async function getPendingSwapRequestsForManager(): Promise<SwapRequestWithNames[]> {
  const orgId = await getOrgId()
  if (!orgId) return []

  const admin = createAdminClient()

  const { data: swaps } = await admin
    .from("swap_requests")
    .select("*")
    .eq("organisation_id", orgId)
    .eq("status", "pending_manager")
    .order("created_at", { ascending: true }) as { data: SwapRequest[] | null }

  if (!swaps || swaps.length === 0) return []

  const staffIds = new Set<string>()
  for (const s of swaps) {
    staffIds.add(s.initiator_staff_id)
    if (s.target_staff_id) staffIds.add(s.target_staff_id)
  }

  const { data: staffNames } = await admin
    .from("staff")
    .select("id, first_name, last_name")
    .in("id", [...staffIds]) as { data: Array<{ id: string; first_name: string; last_name: string }> | null }

  const nameMap = new Map((staffNames ?? []).map(s => [s.id, `${s.first_name} ${s.last_name}`]))

  return swaps.map(s => ({
    ...s,
    initiatorName: nameMap.get(s.initiator_staff_id) ?? "Unknown",
    targetName: s.target_staff_id ? nameMap.get(s.target_staff_id) ?? "Unknown" : null,
  }))
}

// ── Manager: approve swap request ────────────────────────────────────────────

export async function approveSwapByManager(swapId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const admin = createAdminClient()

  const { data: swap } = await admin
    .from("swap_requests")
    .select("*")
    .eq("id", swapId)
    .eq("organisation_id", orgId)
    .single() as { data: SwapRequest | null }

  if (!swap) return { error: "Swap request not found." }
  if (swap.status !== "pending_manager") return { error: "Swap is not pending manager approval." }

  const { error } = await admin
    .from("swap_requests")
    .update({
      status: "pending_target",
      manager_reviewed_at: new Date().toISOString(),
      manager_reviewed_by: user.id,
    })
    .eq("id", swapId)

  if (error) return { error: error.message }

  // Notify target staff via in-app notification + email
  try {
    const { notifySwapTarget, sendSwapTargetEmail } = await import("@/lib/swap-email")
    await Promise.all([
      notifySwapTarget(swapId, orgId),
      sendSwapTargetEmail(swapId, orgId),
    ])
  } catch (e) {
    console.error("[swap] Failed to notify target after manager approval:", e)
  }

  revalidatePath("/")
  return {}
}

// ── Manager: reject swap request ─────────────────────────────────────────────

export async function rejectSwapByManager(swapId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const admin = createAdminClient()

  const { data: swap } = await admin
    .from("swap_requests")
    .select("id, organisation_id, status")
    .eq("id", swapId)
    .eq("organisation_id", orgId)
    .single() as { data: { id: string; organisation_id: string; status: string } | null }

  if (!swap) return { error: "Swap request not found." }
  if (swap.status !== "pending_manager") return { error: "Swap is not pending manager approval." }

  const { error } = await admin
    .from("swap_requests")
    .update({
      status: "rejected",
      rejected_by: "manager",
      manager_reviewed_at: new Date().toISOString(),
      manager_reviewed_by: user.id,
    })
    .eq("id", swapId)

  if (error) return { error: error.message }

  revalidatePath("/")
  return {}
}

