"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { UnpaidLeaveReportData, UnpaidLeaveReportRow } from "./types"
import { formatDateES } from "./_shared"

export async function generateUnpaidLeaveReport(from: string, to: string): Promise<UnpaidLeaveReportData | { error: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const [hrModRes, orgRes, unpaidTypesRes] = await Promise.all([
    supabase.from("hr_module").select("status").maybeSingle(),
    supabase.from("organisations").select("name").eq("id", orgId).single(),
    supabase
      .from("company_leave_types")
      .select("id, name, name_en")
      .eq("organisation_id", orgId)
      .eq("is_paid", false)
      .eq("is_archived", false),
  ])

  const hrMod = hrModRes.data as { status: string } | null
  if (hrMod?.status !== "active") {
    return { error: "HR module is not active." }
  }

  const orgName = (orgRes.data as { name: string } | null)?.name ?? ""
  const unpaidTypes = unpaidTypesRes.data as Array<{ id: string; name: string; name_en: string | null }> | null

  if (!unpaidTypes?.length) {
    return {
      orgName,
      periodLabel: `${formatDateES(from)} – ${formatDateES(to)}`,
      from,
      to,
      totalStaff: 0,
      totalUnpaidDays: 0,
      rows: [],
    }
  }

  const unpaidTypeIds = unpaidTypes.map((t) => t.id)

  // Identify which types are "sick" related
  const sickTypeIds = new Set(
    unpaidTypes
      .filter((t) => t.name.toLowerCase().includes("enfermedad") || (t.name_en ?? "").toLowerCase().includes("sick"))
      .map((t) => t.id)
  )

  const [leavesRes, staffRes] = await Promise.all([
    supabase
      .from("leaves")
      .select("staff_id, leave_type_id, days_counted, start_date, end_date")
      .eq("organisation_id", orgId)
      .eq("status", "approved")
      .in("leave_type_id", unpaidTypeIds)
      .lte("start_date", to)
      .gte("end_date", from),
    supabase
      .from("staff")
      .select("id, first_name, last_name, role, color")
      .eq("organisation_id", orgId),
  ])

  const leaves = leavesRes.data as Array<{ staff_id: string; leave_type_id: string; days_counted: number | null; start_date: string; end_date: string }> | null
  const staffData = staffRes.data as Array<{ id: string; first_name: string; last_name: string; role: string; color: string }> | null

  const staffMap = new Map((staffData ?? []).map((s) => [s.id, s]))

  // Aggregate by staff
  const agg = new Map<string, { unpaidLeave: number; unpaidSick: number }>()
  for (const l of leaves ?? []) {
    const days = l.days_counted ?? Math.round(
      (new Date(l.end_date + "T12:00:00").getTime() - new Date(l.start_date + "T12:00:00").getTime()) / 86400000
    ) + 1
    const entry = agg.get(l.staff_id) ?? { unpaidLeave: 0, unpaidSick: 0 }
    if (sickTypeIds.has(l.leave_type_id ?? "")) {
      entry.unpaidSick += days
    } else {
      entry.unpaidLeave += days
    }
    agg.set(l.staff_id, entry)
  }

  const rows: UnpaidLeaveReportRow[] = [...agg.entries()]
    .map(([staffId, { unpaidLeave, unpaidSick }]) => {
      const s = staffMap.get(staffId)
      return {
        staffId,
        staffName: s ? `${s.first_name} ${s.last_name}` : "—",
        department: s?.role ?? "",
        color: s?.color ?? "",
        unpaidLeaveDays: unpaidLeave,
        unpaidSickDays: unpaidSick,
        totalUnpaid: unpaidLeave + unpaidSick,
      }
    })
    .filter((r) => r.totalUnpaid > 0)
    .sort((a, b) => b.totalUnpaid - a.totalUnpaid)

  return {
    orgName,
    periodLabel: `${formatDateES(from)} – ${formatDateES(to)}`,
    from,
    to,
    totalStaff: rows.length,
    totalUnpaidDays: rows.reduce((s, r) => s + r.totalUnpaid, 0),
    rows,
  }
}
