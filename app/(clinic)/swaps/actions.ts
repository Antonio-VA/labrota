"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import type { SwapRequest, SwapType } from "@/lib/types/database"

// ── Types ────────────────────────────────────────────────────────────────────

export interface SwapCandidate {
  staffId: string
  firstName: string
  lastName: string
  role: string
  shiftType: string | null  // their current shift on swap_date (null = day off)
  assignmentId: string | null
  coverageWarning: string | null
}

export interface SwapRequestWithNames extends SwapRequest {
  initiatorName: string
  targetName: string | null
}

// ── Create swap request ──────────────────────────────────────────────────────

export async function createSwapRequest(params: {
  assignmentId: string
  swapType: SwapType
  targetStaffId: string
  targetAssignmentId?: string
}): Promise<{ error?: string; id?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const admin = createAdminClient()

  // Verify feature flag
  const { data: config } = await admin
    .from("lab_config")
    .select("enable_swap_requests")
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { enable_swap_requests?: boolean } | null }
  if (!config?.enable_swap_requests) return { error: "Swap requests are not enabled." }

  // Verify org is by_shift mode
  const { data: org } = await admin
    .from("organisations")
    .select("rota_display_mode")
    .eq("id", orgId)
    .single() as { data: { rota_display_mode: string } | null }
  if (org?.rota_display_mode !== "by_shift") return { error: "Swap requests are only available in shift mode." }

  // Verify the caller is a viewer linked to the initiator staff
  const { data: member } = await supabase
    .from("organisation_members")
    .select("linked_staff_id, role")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single() as { data: { linked_staff_id: string | null; role: string } | null }

  // Get the assignment details
  const { data: assignment } = await admin
    .from("rota_assignments")
    .select("id, rota_id, staff_id, date, shift_type, organisation_id")
    .eq("id", params.assignmentId)
    .eq("organisation_id", orgId)
    .single() as { data: { id: string; rota_id: string; staff_id: string; date: string; shift_type: string; organisation_id: string } | null }

  if (!assignment) return { error: "Assignment not found." }

  // Verify caller owns this assignment (or is a manager/admin)
  const isManager = member?.role === "admin" || member?.role === "manager"
  if (!isManager && member?.linked_staff_id !== assignment.staff_id) {
    return { error: "You can only request swaps for your own shifts." }
  }

  // Verify rota is published
  const { data: rota } = await admin
    .from("rotas")
    .select("id, status")
    .eq("id", assignment.rota_id)
    .single() as { data: { id: string; status: string } | null }
  if (!rota || rota.status !== "published") return { error: "Swaps are only available for published rotas." }

  // Check for duplicate pending request
  const { data: existing } = await admin
    .from("swap_requests")
    .select("id")
    .eq("initiator_assignment_id", params.assignmentId)
    .in("status", ["pending_manager", "manager_approved", "pending_target"])
    .maybeSingle() as { data: { id: string } | null }
  if (existing) return { error: "A swap request for this shift is already pending." }

  // Verify target staff is not on leave
  const { data: targetLeave } = await admin
    .from("leaves")
    .select("id")
    .eq("staff_id", params.targetStaffId)
    .eq("organisation_id", orgId)
    .eq("status", "approved")
    .lte("start_date", assignment.date)
    .gte("end_date", assignment.date)
    .maybeSingle() as { data: { id: string } | null }
  if (targetLeave) return { error: "Target staff member is on leave that day." }

  // Insert swap request
  const { data: inserted, error } = await admin
    .from("swap_requests")
    .insert({
      organisation_id: orgId,
      rota_id: assignment.rota_id,
      initiator_staff_id: assignment.staff_id,
      initiator_assignment_id: params.assignmentId,
      swap_type: params.swapType,
      target_staff_id: params.targetStaffId,
      target_assignment_id: params.targetAssignmentId ?? null,
      swap_date: assignment.date,
      swap_shift_type: assignment.shift_type,
      status: "pending_manager",
    } as never)
    .select("id")
    .single() as { data: { id: string } | null; error: unknown }

  if (error || !inserted) return { error: (error as { message?: string })?.message ?? "Insert failed." }

  // Send email to managers (fire-and-forget)
  try {
    const { sendSwapManagerEmail } = await import("@/lib/swap-email")
    await sendSwapManagerEmail(inserted.id, orgId)
  } catch (e) {
    console.error("[swap] Failed to send manager email:", e)
  }

  // In-app notification for managers
  try {
    const { notifySwapManagers } = await import("@/lib/swap-email")
    await notifySwapManagers(inserted.id, orgId)
  } catch { /* non-blocking */ }

  revalidatePath("/")
  return { id: inserted.id }
}

// ── Get swap candidates ──────────────────────────────────────────────────────

export async function getSwapCandidates(assignmentId: string): Promise<{ candidates: SwapCandidate[]; error?: string }> {
  const orgId = await getOrgId()
  if (!orgId) return { candidates: [], error: "No organisation found." }

  const admin = createAdminClient()

  // Get the assignment
  const { data: assignment } = await admin
    .from("rota_assignments")
    .select("id, rota_id, staff_id, date, shift_type")
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
    .single() as { data: { id: string; rota_id: string; staff_id: string; date: string; shift_type: string } | null }

  if (!assignment) return { candidates: [], error: "Assignment not found." }

  // Get all active staff in the org
  const { data: allStaff } = await admin
    .from("staff")
    .select("id, first_name, last_name, role, working_pattern, onboarding_status")
    .eq("organisation_id", orgId)
    .eq("onboarding_status", "active")
    .neq("id", assignment.staff_id) as { data: Array<{ id: string; first_name: string; last_name: string; role: string; working_pattern: string[]; onboarding_status: string }> | null }

  if (!allStaff || allStaff.length === 0) return { candidates: [] }

  // Get all assignments for that date in this rota
  const { data: dayAssignments } = await admin
    .from("rota_assignments")
    .select("id, staff_id, shift_type")
    .eq("rota_id", assignment.rota_id)
    .eq("date", assignment.date) as { data: Array<{ id: string; staff_id: string; shift_type: string }> | null }

  const assignmentMap = new Map((dayAssignments ?? []).map(a => [a.staff_id, a]))

  // Get leaves for that date
  const { data: leaves } = await admin
    .from("leaves")
    .select("staff_id")
    .eq("organisation_id", orgId)
    .eq("status", "approved")
    .lte("start_date", assignment.date)
    .gte("end_date", assignment.date) as { data: Array<{ staff_id: string }> | null }

  const onLeaveIds = new Set((leaves ?? []).map(l => l.staff_id))

  // Get pending swap requests for that date
  const { data: pendingSwaps } = await admin
    .from("swap_requests")
    .select("target_staff_id, initiator_staff_id")
    .eq("organisation_id", orgId)
    .eq("swap_date", assignment.date)
    .in("status", ["pending_manager", "manager_approved", "pending_target"]) as { data: Array<{ target_staff_id: string | null; initiator_staff_id: string }> | null }

  const busyStaffIds = new Set<string>()
  for (const s of pendingSwaps ?? []) {
    if (s.target_staff_id) busyStaffIds.add(s.target_staff_id)
    busyStaffIds.add(s.initiator_staff_id)
  }

  // Get day of week for working pattern check
  const dayOfWeek = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][new Date(assignment.date + "T12:00:00").getDay()]

  const candidates: SwapCandidate[] = []

  for (const staff of allStaff) {
    if (onLeaveIds.has(staff.id)) continue
    if (busyStaffIds.has(staff.id)) continue

    const theirAssignment = assignmentMap.get(staff.id)

    // For shift_swap: they must be working that day on a different shift
    // For day_off: they must be available (has the day in working_pattern but not assigned, or assigned)
    if (theirAssignment) {
      // They're working — good candidate for shift_swap
      candidates.push({
        staffId: staff.id,
        firstName: staff.first_name,
        lastName: staff.last_name,
        role: staff.role,
        shiftType: theirAssignment.shift_type,
        assignmentId: theirAssignment.id,
        coverageWarning: null,
      })
    } else if ((staff.working_pattern as string[]).includes(dayOfWeek)) {
      // They're off but available — good candidate for day_off cover
      candidates.push({
        staffId: staff.id,
        firstName: staff.first_name,
        lastName: staff.last_name,
        role: staff.role,
        shiftType: null,
        assignmentId: null,
        coverageWarning: null,
      })
    }
  }

  return { candidates }
}

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

// ── Cancel swap request ──────────────────────────────────────────────────────

export async function cancelSwapRequest(swapId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: "Not authenticated." }

  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const admin = createAdminClient()

  const { data: swap } = await admin
    .from("swap_requests")
    .select("id, status, initiator_staff_id")
    .eq("id", swapId)
    .eq("organisation_id", orgId)
    .single() as { data: { id: string; status: string; initiator_staff_id: string } | null }

  if (!swap) return { error: "Swap request not found." }

  // Only pending requests can be cancelled
  if (!["pending_manager", "manager_approved", "pending_target"].includes(swap.status)) {
    return { error: "This swap request can no longer be cancelled." }
  }

  // Verify caller is the initiator or a manager
  const { data: member } = await supabase
    .from("organisation_members")
    .select("linked_staff_id, role")
    .eq("user_id", user.id)
    .eq("organisation_id", orgId)
    .single() as { data: { linked_staff_id: string | null; role: string } | null }

  const isManager = member?.role === "admin" || member?.role === "manager"
  if (!isManager && member?.linked_staff_id !== swap.initiator_staff_id) {
    return { error: "Only the initiator or a manager can cancel this request." }
  }

  await admin
    .from("swap_requests")
    .update({ status: "cancelled" } as never)
    .eq("id", swapId)

  revalidatePath("/")
  return {}
}

// ── Execute swap (called when target accepts) ────────────────────────────────

export async function executeSwap(swapId: string): Promise<{ error?: string }> {
  const admin = createAdminClient()

  const { data: swap } = await admin
    .from("swap_requests")
    .select("*")
    .eq("id", swapId)
    .single() as { data: SwapRequest | null }

  if (!swap) return { error: "Swap request not found." }
  if (swap.status !== "pending_target") return { error: "Swap is not in the correct state." }

  // Verify both assignments still exist
  const { data: initiatorAssignment } = await admin
    .from("rota_assignments")
    .select("id, staff_id, shift_type, date, rota_id")
    .eq("id", swap.initiator_assignment_id)
    .single() as { data: { id: string; staff_id: string; shift_type: string; date: string; rota_id: string } | null }

  if (!initiatorAssignment) {
    await admin.from("swap_requests").update({ status: "rejected", rejected_by: "system" } as never).eq("id", swapId)
    return { error: "The original shift assignment no longer exists." }
  }

  if (swap.swap_type === "shift_swap") {
    // Both assignments must exist for shift swap
    if (!swap.target_assignment_id) return { error: "Target assignment not specified." }

    const { data: targetAssignment } = await admin
      .from("rota_assignments")
      .select("id, staff_id, shift_type, date, rota_id")
      .eq("id", swap.target_assignment_id)
      .single() as { data: { id: string; staff_id: string; shift_type: string; date: string; rota_id: string } | null }

    if (!targetAssignment) {
      await admin.from("swap_requests").update({ status: "rejected", rejected_by: "system" } as never).eq("id", swapId)
      return { error: "The target shift assignment no longer exists." }
    }

    // Swap staff_ids: delete both then reinsert to avoid unique constraint violation
    const initData = { ...initiatorAssignment, staff_id: targetAssignment.staff_id }
    const targetData = { ...targetAssignment, staff_id: initiatorAssignment.staff_id }

    await admin.from("rota_assignments").delete().eq("id", initiatorAssignment.id)
    await admin.from("rota_assignments").delete().eq("id", targetAssignment.id)

    await admin.from("rota_assignments").insert({
      rota_id: initData.rota_id,
      staff_id: initData.staff_id,
      date: initData.date,
      shift_type: initData.shift_type,
      organisation_id: swap.organisation_id,
      is_manual_override: true,
    } as never)

    await admin.from("rota_assignments").insert({
      rota_id: targetData.rota_id,
      staff_id: targetData.staff_id,
      date: targetData.date,
      shift_type: targetData.shift_type,
      organisation_id: swap.organisation_id,
      is_manual_override: true,
    } as never)

  } else {
    // day_off: reassign initiator's shift to target staff
    if (!swap.target_staff_id) return { error: "Target staff not specified." }

    await admin
      .from("rota_assignments")
      .update({ staff_id: swap.target_staff_id, is_manual_override: true } as never)
      .eq("id", initiatorAssignment.id)
  }

  // Mark swap as approved
  await admin
    .from("swap_requests")
    .update({ status: "approved", target_responded_at: new Date().toISOString() } as never)
    .eq("id", swapId)

  // Re-send published rota email with swap notice (fire-and-forget)
  try {
    const { data: rota } = await admin
      .from("rotas")
      .select("id, status")
      .eq("id", swap.rota_id)
      .single() as { data: { id: string; status: string } | null }

    if (rota?.status === "published") {
      const { resendRotaWithSwapNotice } = await import("@/lib/swap-email")
      await resendRotaWithSwapNotice(swap.rota_id, swap.organisation_id)
    }
  } catch (e) {
    console.error("[swap] Failed to resend rota email:", e)
  }

  revalidatePath("/")
  return {}
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
    } as never)
    .eq("id", swapId)

  if (error) return { error: error.message }

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
    } as never)
    .eq("id", swapId)

  if (error) return { error: error.message }

  revalidatePath("/")
  return {}
}

// ── Check pending swaps for an assignment ────────────────────────────────────

export async function hasPendingSwap(assignmentId: string): Promise<boolean> {
  const orgId = await getOrgId()
  if (!orgId) return false

  const admin = createAdminClient()
  const { data } = await admin
    .from("swap_requests")
    .select("id")
    .eq("initiator_assignment_id", assignmentId)
    .in("status", ["pending_manager", "manager_approved", "pending_target"])
    .maybeSingle() as { data: { id: string } | null }

  return !!data
}
