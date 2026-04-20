"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { LeaveReportData, LeaveReportRow } from "./types"
import { formatDateES } from "./_shared"

export async function generateLeaveReport(from: string, to: string): Promise<LeaveReportData | { error: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const [orgRes, leavesRes, staffRes] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", orgId).single(),
    supabase
      .from("leaves")
      .select("id, staff_id, type, start_date, end_date, notes")
      .eq("organisation_id", orgId)
      .eq("status", "approved")
      .lte("start_date", to)
      .gte("end_date", from)
      .order("start_date"),
    supabase
      .from("staff")
      .select("id, first_name, last_name, role, color")
      .eq("organisation_id", orgId),
  ])

  const orgName = (orgRes.data as { name: string } | null)?.name ?? ""
  const leaves = leavesRes.data as { id: string; staff_id: string; type: string; start_date: string; end_date: string; notes: string | null }[] | null
  const staffData = staffRes.data as { id: string; first_name: string; last_name: string; role: string; color: string }[] | null

  const staffMap = new Map((staffData ?? []).map((s) => [s.id, s]))

  const rows: LeaveReportRow[] = (leaves ?? []).map((l) => {
    const s = staffMap.get(l.staff_id)
    const start = new Date(l.start_date + "T12:00:00")
    const end = new Date(l.end_date + "T12:00:00")
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1
    return {
      leaveId: l.id,
      staffName: s ? `${s.first_name} ${s.last_name}` : "—",
      department: s?.role ?? "",
      color: s?.color ?? "",
      type: l.type,
      startDate: l.start_date,
      endDate: l.end_date,
      days,
      notes: l.notes,
    }
  })

  return {
    orgName,
    periodLabel: `${formatDateES(from)} – ${formatDateES(to)}`,
    from,
    to,
    totalLeaves: rows.length,
    totalDays: rows.reduce((s, r) => s + r.days, 0),
    rows,
  }
}

