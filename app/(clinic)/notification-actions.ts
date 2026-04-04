"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { Notification } from "@/lib/types/database"

export async function getNotifications(): Promise<Notification[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50) as unknown as { data: Notification[] | null }
  return data ?? []
}

export async function getUnreadCount(): Promise<number> {
  const supabase = await createClient()
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("read", false) as { count: number | null }
  return count ?? 0
}

export async function markAsRead(notificationId: string): Promise<void> {
  const supabase = await createClient()
  await supabase
    .from("notifications")
    .update({ read: true } as never)
    .eq("id", notificationId)
}

export async function markAllAsRead(): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  await supabase
    .from("notifications")
    .update({ read: true } as never)
    .eq("user_id", user.id)
    .eq("read", false)
}

/**
 * Check if a leave overlaps published rotas and notify admins.
 * Called from leave creation/approval actions.
 */
export async function notifyLeaveImpact(params: {
  orgId: string
  staffName: string
  startDate: string
  endDate: string
}): Promise<void> {
  const admin = createAdminClient()

  // Check for any rotas (draft or published) that overlap this leave period
  const { data: rotas } = await admin
    .from("rotas")
    .select("id, week_start, status")
    .eq("organisation_id", params.orgId)
    .lte("week_start", params.endDate) as unknown as { data: { id: string; week_start: string; status: string }[] | null }

  // Filter to rotas whose week actually overlaps the leave
  const overlapping = (rotas ?? []).filter((r) => {
    const weekEnd = new Date(r.week_start + "T12:00:00")
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekEndStr = weekEnd.toISOString().split("T")[0]
    return r.week_start <= params.endDate && weekEndStr >= params.startDate
  })

  if (overlapping.length === 0) return

  // Get all admin/manager members for this org
  const { data: members } = await admin
    .from("organisation_members")
    .select("user_id, role")
    .eq("organisation_id", params.orgId) as unknown as { data: { user_id: string; role: string }[] | null }

  const adminIds = (members ?? [])
    .filter((m) => m.role === "admin" || m.role === "manager")
    .map((m) => m.user_id)

  if (adminIds.length === 0) return

  // Create notifications
  const weekLabels = overlapping.map((r) => r.week_start).join(", ")
  const notifications = adminIds.map((userId) => ({
    organisation_id: params.orgId,
    user_id: userId,
    type: "leave_impact",
    title: "Leave impacts published rota",
    message: `${params.staffName} has leave from ${params.startDate} to ${params.endDate}. Their shifts have been removed from ${overlapping.length} rota${overlapping.length > 1 ? "s" : ""}.`,
    data: {
      staffName: params.staffName,
      startDate: params.startDate,
      endDate: params.endDate,
      affectedWeeks: overlapping.map((r) => r.week_start),
    },
  }))

  await admin.from("notifications").insert(notifications as never)
}

/** Notify a staff member when their shift changes on a published rota. */
export async function notifyShiftChange(params: {
  orgId: string
  staffId: string
  date: string
  message: string
}): Promise<void> {
  try {
    const admin = createAdminClient()
    // Find the user_id linked to this staff member via email
    const { data: staff } = await admin
      .from("staff")
      .select("email")
      .eq("id", params.staffId)
      .single() as { data: { email: string | null } | null }

    if (!staff?.email) return

    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", staff.email)
      .maybeSingle() as { data: { id: string } | null }

    if (!profile) return

    await admin.from("notifications").insert({
      organisation_id: params.orgId,
      user_id: profile.id,
      type: "shift_change",
      title: "Your shift has changed",
      message: params.message,
      data: { date: params.date, staffId: params.staffId },
    } as never)
  } catch (e) {
    console.error("[notify] Failed to send shift change notification:", e)
  }
}
