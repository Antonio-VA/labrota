"use server"

import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { toISODate } from "@/lib/format-date"
import type { SwapCandidate, DayOffCandidate, ExchangeOption } from "./types"

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

  // Get the initiator's role to filter candidates by same department
  const { data: initiatorStaff } = await admin
    .from("staff")
    .select("role")
    .eq("id", assignment.staff_id)
    .single() as { data: { role: string } | null }

  const initiatorRole = initiatorStaff?.role ?? "lab"

  // Get all active staff in the org — same department only
  const { data: allStaff } = await admin
    .from("staff")
    .select("id, first_name, last_name, role, working_pattern, onboarding_status")
    .eq("organisation_id", orgId)
    .eq("onboarding_status", "active")
    .eq("role", initiatorRole)
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

// ── Get day-off swap candidates (staff who are OFF on the initiator's date) ──

export async function getDayOffCandidates(assignmentId: string): Promise<{ candidates: DayOffCandidate[]; error?: string }> {
  const orgId = await getOrgId()
  if (!orgId) return { candidates: [], error: "No organisation found." }

  const admin = createAdminClient()

  const { data: assignment } = await admin
    .from("rota_assignments")
    .select("id, rota_id, staff_id, date, shift_type")
    .eq("id", assignmentId)
    .eq("organisation_id", orgId)
    .single() as { data: { id: string; rota_id: string; staff_id: string; date: string; shift_type: string } | null }

  if (!assignment) return { candidates: [], error: "Assignment not found." }

  // Get the initiator's role to filter candidates by same department
  const { data: initiatorStaff } = await admin
    .from("staff")
    .select("role")
    .eq("id", assignment.staff_id)
    .single() as { data: { role: string } | null }

  const initiatorRole = initiatorStaff?.role ?? "lab"

  const { data: allStaff } = await admin
    .from("staff")
    .select("id, first_name, last_name, role")
    .eq("organisation_id", orgId)
    .eq("onboarding_status", "active")
    .eq("role", initiatorRole)
    .neq("id", assignment.staff_id) as { data: Array<{ id: string; first_name: string; last_name: string; role: string }> | null }

  if (!allStaff || allStaff.length === 0) return { candidates: [] }

  // Who is already working that day?
  const { data: dayAssignments } = await admin
    .from("rota_assignments")
    .select("staff_id")
    .eq("rota_id", assignment.rota_id)
    .eq("date", assignment.date) as { data: Array<{ staff_id: string }> | null }

  const workingOnDay = new Set((dayAssignments ?? []).map(a => a.staff_id))

  // Who is on leave that day?
  const { data: leaves } = await admin
    .from("leaves")
    .select("staff_id")
    .eq("organisation_id", orgId)
    .eq("status", "approved")
    .lte("start_date", assignment.date)
    .gte("end_date", assignment.date) as { data: Array<{ staff_id: string }> | null }

  const onLeaveIds = new Set((leaves ?? []).map(l => l.staff_id))

  // Only staff who are OFF (not working, not on leave)
  const offStaff = allStaff.filter(s => !workingOnDay.has(s.id) && !onLeaveIds.has(s.id))
  if (offStaff.length === 0) return { candidates: [] }

  // Get their assignments for the rest of the week (to pick which day to exchange)
  const offStaffIds = offStaff.map(s => s.id)
  const { data: weekAssignments } = await admin
    .from("rota_assignments")
    .select("id, staff_id, date, shift_type")
    .eq("rota_id", assignment.rota_id)
    .in("staff_id", offStaffIds)
    .neq("date", assignment.date) as { data: Array<{ id: string; staff_id: string; date: string; shift_type: string }> | null }

  const weekMap: Record<string, Array<{ date: string; shiftType: string; assignmentId: string }>> = {}
  for (const a of weekAssignments ?? []) {
    if (!weekMap[a.staff_id]) weekMap[a.staff_id] = []
    weekMap[a.staff_id].push({ date: a.date, shiftType: a.shift_type, assignmentId: a.id })
  }

  const candidates: DayOffCandidate[] = offStaff.map(s => ({
    staffId: s.id,
    firstName: s.first_name,
    lastName: s.last_name,
    role: s.role,
    weeklyAssignments: (weekMap[s.id] ?? []).sort((a, b) => a.date.localeCompare(b.date)),
  }))

  return { candidates }
}


export async function getDayOffExchangeOptions(
  initiatorAssignmentId: string,
  targetStaffId: string,
  weekStart: string,
): Promise<{ options: ExchangeOption[]; error?: string }> {
  const orgId = await getOrgId()
  if (!orgId) return { options: [], error: "No organisation found." }

  const admin = createAdminClient()

  // Get the initiator's assignment to find their staff ID
  const { data: initAssignment } = await admin
    .from("rota_assignments")
    .select("id, staff_id, date")
    .eq("id", initiatorAssignmentId)
    .eq("organisation_id", orgId)
    .single() as { data: { id: string; staff_id: string; date: string } | null }

  if (!initAssignment) return { options: [], error: "Assignment not found." }

  // Build 14-day date range: weekStart → weekStart+13
  const start = new Date(weekStart + "T12:00:00")
  const dateRange: string[] = []
  for (let i = 0; i < 14; i++) {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const iso = toISODate(d)
    // Exclude the initiator's own shift date
    if (iso !== initAssignment.date) dateRange.push(iso)
  }

  if (dateRange.length === 0) return { options: [] }

  // Get initiator's assignments in that range (to find their working days)
  const { data: initiatorAssignments } = await admin
    .from("rota_assignments")
    .select("date")
    .eq("staff_id", initAssignment.staff_id)
    .eq("organisation_id", orgId)
    .in("date", dateRange) as { data: Array<{ date: string }> | null }

  const initiatorWorkingDays = new Set((initiatorAssignments ?? []).map(a => a.date))

  // Initiator's OFF days = days in range where they have no assignment
  const initiatorOffDays = dateRange.filter(d => !initiatorWorkingDays.has(d))
  if (initiatorOffDays.length === 0) return { options: [] }

  // Get target's assignments on those OFF days
  const { data: targetAssignments } = await admin
    .from("rota_assignments")
    .select("id, date, shift_type")
    .eq("staff_id", targetStaffId)
    .eq("organisation_id", orgId)
    .in("date", initiatorOffDays) as { data: Array<{ id: string; date: string; shift_type: string }> | null }

  const options: ExchangeOption[] = (targetAssignments ?? [])
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(a => ({ date: a.date, shiftType: a.shift_type, assignmentId: a.id }))

  return { options }
}

