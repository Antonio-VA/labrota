"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { StaffReportData, StaffReportRow } from "./types"
import { formatDateES, getDatesInRange } from "./_shared"

export async function generateStaffReport(from: string, to: string): Promise<StaffReportData | { error: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { data: org } = await supabase.from("organisations").select("name, rota_display_mode").eq("id", orgId).single()
  const orgName = (org as { name: string } | null)?.name ?? ""
  const mode = ((org as { rota_display_mode?: string } | null)?.rota_display_mode ?? "by_shift") as "by_shift" | "by_task"

  const dates = getDatesInRange(from, to)
  const totalDays = dates.length
  if (totalDays === 0) return { error: "Período inválido." }

  // Fetch active staff
  const { data: staffData } = await supabase
    .from("staff")
    .select("id, first_name, last_name, role, color, onboarding_status")
    .eq("organisation_id", orgId)
    .neq("onboarding_status", "inactive") as { data: { id: string; first_name: string; last_name: string; role: string; color: string; onboarding_status: string }[] | null }
  const staff = staffData ?? []

  // Fetch all assignments in range
  const { data: assignments } = await supabase
    .from("rota_assignments")
    .select("staff_id, date, function_label")
    .eq("organisation_id", orgId)
    .gte("date", from)
    .lte("date", to) as { data: { staff_id: string; date: string; function_label: string }[] | null }

  // Fetch leaves in range
  const { data: leaves } = await supabase
    .from("leaves")
    .select("staff_id, start_date, end_date")
    .eq("organisation_id", orgId)
    .eq("status", "approved")
    .lte("start_date", to)
    .gte("end_date", from) as { data: { staff_id: string; start_date: string; end_date: string }[] | null }

  // Build per-staff data
  const staffIds = new Set(staff.map((s) => s.id))

  // Assignment counts
  const assignmentsByStaff: Record<string, Set<string>> = {} // staff_id → set of dates (for by_shift dedup)
  const taskCountByStaff: Record<string, number> = {}         // staff_id → total task assignments (by_task)
  for (const a of assignments ?? []) {
    if (!staffIds.has(a.staff_id)) continue
    if (mode === "by_task" && !a.function_label) continue
    if (!assignmentsByStaff[a.staff_id]) assignmentsByStaff[a.staff_id] = new Set()
    assignmentsByStaff[a.staff_id].add(a.date)
    taskCountByStaff[a.staff_id] = (taskCountByStaff[a.staff_id] ?? 0) + 1
  }

  // Leave days per staff
  const leaveDaysByStaff: Record<string, Set<string>> = {}
  for (const l of leaves ?? []) {
    if (!staffIds.has(l.staff_id)) continue
    if (!leaveDaysByStaff[l.staff_id]) leaveDaysByStaff[l.staff_id] = new Set()
    for (const d of dates) {
      if (d >= l.start_date && d <= l.end_date) {
        leaveDaysByStaff[l.staff_id].add(d)
      }
    }
  }

  // Build rows
  const rows: StaffReportRow[] = staff.map((s) => {
    const assignedDays = assignmentsByStaff[s.id]?.size ?? 0
    const assignmentCount = mode === "by_task" ? (taskCountByStaff[s.id] ?? 0) : assignedDays
    const leaveDays = leaveDaysByStaff[s.id]?.size ?? 0
    const daysOff = totalDays - assignedDays - leaveDays
    return {
      staffId: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      department: s.role,
      color: s.color,
      assignments: assignmentCount,
      daysOff: Math.max(0, daysOff),
      daysLeave: leaveDays,
      vsMean: 0, // computed below
    }
  })

  // Compute mean (exclude full-period leave)
  const eligibleRows = rows.filter((r) => r.daysLeave < totalDays)
  const mean = eligibleRows.length > 0
    ? eligibleRows.reduce((sum, r) => sum + r.assignments, 0) / eligibleRows.length
    : 0

  for (const r of rows) {
    r.vsMean = Math.round((r.assignments - mean) * 10) / 10
  }

  // Sort by assignments descending
  rows.sort((a, b) => b.assignments - a.assignments)

  const periodLabel = `${formatDateES(from)} – ${formatDateES(to)}`

  return {
    orgName,
    periodLabel,
    from,
    to,
    totalDays,
    meanAssignments: Math.round(mean * 10) / 10,
    activeStaff: staff.length,
    rows,
    mode,
  }
}

