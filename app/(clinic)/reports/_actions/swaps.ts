"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import type { SwapReportData, SwapReportRow } from "./types"
import { formatDateES } from "./_shared"

export async function generateSwapReport(from: string, to: string): Promise<SwapReportData | { error: string }> {
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const admin = createAdminClient()

  const { data: org } = await admin.from("organisations").select("name").eq("id", orgId).single()
  const orgName = (org as { name: string } | null)?.name ?? ""

  const { data: swaps } = await admin
    .from("swap_requests")
    .select("id, initiator_staff_id, target_staff_id, swap_type, swap_date, swap_shift_type, status, created_at, manager_reviewed_at, target_responded_at")
    .eq("organisation_id", orgId)
    .gte("swap_date", from)
    .lte("swap_date", to)
    .order("created_at", { ascending: false }) as {
      data: Array<{
        id: string
        initiator_staff_id: string
        target_staff_id: string | null
        swap_type: string
        swap_date: string
        swap_shift_type: string
        status: string
        created_at: string
        manager_reviewed_at: string | null
        target_responded_at: string | null
      }> | null
    }

  if (!swaps || swaps.length === 0) {
    return { orgName, periodLabel: `${formatDateES(from)} – ${formatDateES(to)}`, from, to, totalRequests: 0, approved: 0, rejected: 0, pending: 0, cancelled: 0, rows: [] }
  }

  // Fetch staff lookup
  const staffIds = new Set<string>()
  for (const s of swaps) {
    staffIds.add(s.initiator_staff_id)
    if (s.target_staff_id) staffIds.add(s.target_staff_id)
  }

  const { data: staffData } = await admin
    .from("staff")
    .select("id, first_name, last_name")
    .eq("organisation_id", orgId)
    .in("id", [...staffIds]) as { data: Array<{ id: string; first_name: string; last_name: string }> | null }

  const nameMap = new Map((staffData ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`]))

  const rows: SwapReportRow[] = swaps.map((s) => ({
    id: s.id,
    initiatorName: nameMap.get(s.initiator_staff_id) ?? "Unknown",
    targetName: s.target_staff_id ? nameMap.get(s.target_staff_id) ?? "Unknown" : null,
    swapType: s.swap_type,
    swapDate: s.swap_date,
    shiftType: s.swap_shift_type,
    status: s.status,
    requestedAt: s.created_at,
    managerReviewedAt: s.manager_reviewed_at,
    targetRespondedAt: s.target_responded_at,
  }))

  return {
    orgName,
    periodLabel: `${formatDateES(from)} – ${formatDateES(to)}`,
    from,
    to,
    totalRequests: rows.length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    pending: rows.filter((r) => ["pending_manager", "manager_approved", "pending_target"].includes(r.status)).length,
    cancelled: rows.filter((r) => r.status === "cancelled").length,
    rows,
  }
}
