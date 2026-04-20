"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import type { SwapRequest } from "@/lib/types/database"
import type { SwapRequestWithNames } from "./types"

// ── Get my swap requests ─────────────────────────────────────────────────────

export async function getMySwapRequests(staffId: string): Promise<SwapRequestWithNames[]> {
  const orgId = await getOrgId()
  if (!orgId) return []

  const admin = createAdminClient()

  // Get swaps where this staff is initiator or target
  const { data: swaps } = await admin
    .from("swap_requests")
    .select("*")
    .eq("organisation_id", orgId)
    .or(`initiator_staff_id.eq.${staffId},target_staff_id.eq.${staffId}`)
    .order("created_at", { ascending: false })
    .limit(20) as { data: SwapRequest[] | null }

  if (!swaps || swaps.length === 0) return []

  // Collect staff IDs for name resolution
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

// ── Check if swap requests are enabled ───────────────────────────────────────

export async function isSwapEnabled(): Promise<boolean> {
  const orgId = await getOrgId()
  if (!orgId) return false

  const admin = createAdminClient()

  const [configRes, orgRes] = await Promise.all([
    admin.from("lab_config").select("enable_swap_requests").eq("organisation_id", orgId).maybeSingle(),
    admin.from("organisations").select("rota_display_mode").eq("id", orgId).single(),
  ])

  const config = configRes.data as { enable_swap_requests?: boolean } | null
  const org = orgRes.data as { rota_display_mode: string } | null

  return !!(config?.enable_swap_requests && org?.rota_display_mode === "by_shift")
}

// ── Get all swap requests for the org (managers) ────────────────────────────

export async function getOrgSwapRequests(): Promise<SwapRequestWithNames[]> {
  const orgId = await getOrgId()
  if (!orgId) return []

  const admin = createAdminClient()

  const { data: swaps } = await admin
    .from("swap_requests")
    .select("*")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: false })
    .limit(30) as { data: SwapRequest[] | null }

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

// ── Get swap badge count ────────────────────────────────────────────────────

export async function getSwapBadgeCount(role: "viewer" | "manager" | "admin", staffId?: string): Promise<number> {
  const orgId = await getOrgId()
  if (!orgId) return 0

  const admin = createAdminClient()

  if (role === "admin" || role === "manager") {
    // Managers see count of pending_manager requests
    const { count } = await admin
      .from("swap_requests")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("status", "pending_manager") as { count: number | null }
    return count ?? 0
  }

  if (!staffId) return 0

  // Staff see count of active (non-resolved) requests they're involved in
  const { count } = await admin
    .from("swap_requests")
    .select("id", { count: "exact", head: true })
    .eq("organisation_id", orgId)
    .or(`initiator_staff_id.eq.${staffId},target_staff_id.eq.${staffId}`)
    .in("status", ["pending_manager", "manager_approved", "pending_target"]) as { count: number | null }

  return count ?? 0
}
