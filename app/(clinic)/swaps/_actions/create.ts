"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import type { SwapType } from "@/lib/types/database"

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
    })
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

