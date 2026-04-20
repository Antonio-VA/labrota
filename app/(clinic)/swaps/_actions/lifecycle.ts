"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import type { SwapRequest } from "@/lib/types/database"

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
    .update({ status: "cancelled" })
    .eq("id", swapId)

  revalidatePath("/schedule")
  return {}
}

// ── Execute swap (called when target accepts) ────────────────────────────────

export async function executeSwap(swapId: string): Promise<{ error?: string }> {
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
  if (swap.status !== "pending_target") return { error: "Swap is not in the correct state." }

  // Verify both assignments still exist
  const { data: initiatorAssignment } = await admin
    .from("rota_assignments")
    .select("id, staff_id, shift_type, date, rota_id")
    .eq("id", swap.initiator_assignment_id)
    .single() as { data: { id: string; staff_id: string; shift_type: string; date: string; rota_id: string } | null }

  if (!initiatorAssignment) {
    await admin.from("swap_requests").update({ status: "rejected", rejected_by: "system" }).eq("id", swapId)
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
      await admin.from("swap_requests").update({ status: "rejected", rejected_by: "system" }).eq("id", swapId)
      return { error: "The target shift assignment no longer exists." }
    }

    // Insert swapped rows first so a mid-write crash leaves extra rows (recoverable)
    // rather than missing rows (data loss). New staff_ids don't conflict with existing rows.
    const initData = { ...initiatorAssignment, staff_id: targetAssignment.staff_id }
    const targetData = { ...targetAssignment, staff_id: initiatorAssignment.staff_id }

    await admin.from("rota_assignments").insert({
      rota_id: initData.rota_id,
      staff_id: initData.staff_id,
      date: initData.date,
      shift_type: initData.shift_type,
      organisation_id: swap.organisation_id,
      is_manual_override: true,
    })

    await admin.from("rota_assignments").insert({
      rota_id: targetData.rota_id,
      staff_id: targetData.staff_id,
      date: targetData.date,
      shift_type: targetData.shift_type,
      organisation_id: swap.organisation_id,
      is_manual_override: true,
    })

    await admin.from("rota_assignments").delete().eq("id", initiatorAssignment.id)
    await admin.from("rota_assignments").delete().eq("id", targetAssignment.id)

  } else {
    // day_off: target covers initiator's day; initiator covers target's exchange day
    if (!swap.target_staff_id) return { error: "Target staff not specified." }

    if (swap.target_assignment_id) {
      // Mutual exchange: both assignments are swapped
      const { data: targetAssignment } = await admin
        .from("rota_assignments")
        .select("id, staff_id, shift_type, date, rota_id")
        .eq("id", swap.target_assignment_id)
        .single() as { data: { id: string; staff_id: string; shift_type: string; date: string; rota_id: string } | null }

      if (!targetAssignment) {
        await admin.from("swap_requests").update({ status: "rejected", rejected_by: "system" }).eq("id", swapId)
        return { error: "The exchange assignment no longer exists." }
      }

      // Insert first, then delete — same crash-safety pattern as shift_swap above
      await admin.from("rota_assignments").insert({
        rota_id: initiatorAssignment.rota_id,
        staff_id: targetAssignment.staff_id,
        date: initiatorAssignment.date,
        shift_type: initiatorAssignment.shift_type,
        organisation_id: swap.organisation_id,
        is_manual_override: true,
      })

      await admin.from("rota_assignments").insert({
        rota_id: targetAssignment.rota_id,
        staff_id: initiatorAssignment.staff_id,
        date: targetAssignment.date,
        shift_type: targetAssignment.shift_type,
        organisation_id: swap.organisation_id,
        is_manual_override: true,
      })

      await admin.from("rota_assignments").delete().eq("id", initiatorAssignment.id)
      await admin.from("rota_assignments").delete().eq("id", targetAssignment.id)
    } else {
      // Legacy / simple cover: reassign initiator's shift to target staff
      await admin
        .from("rota_assignments")
        .update({ staff_id: swap.target_staff_id, is_manual_override: true })
        .eq("id", initiatorAssignment.id)
    }
  }

  // Mark swap as approved
  await admin
    .from("swap_requests")
    .update({ status: "approved", target_responded_at: new Date().toISOString() })
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

  revalidatePath("/schedule")
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

