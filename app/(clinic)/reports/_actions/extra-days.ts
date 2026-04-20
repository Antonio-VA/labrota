"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import { getMondayOf, toISODate } from "@/lib/format-date"
import type { ExtraDaysData, ExtraDaysRow } from "./types"

export async function generateExtraDaysReport(month: string): Promise<ExtraDaysData | { error: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Validate: must be a past month
  const today = new Date()
  const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`
  if (month >= currentMonth) return { error: "Solo se pueden generar informes de meses pasados." }

  const { data: org } = await supabase.from("organisations").select("name").eq("id", orgId).single()
  const orgName = (org as { name: string } | null)?.name ?? ""

  const [year, mon] = month.split("-").map(Number)
  const firstDay = new Date(year, mon - 1, 1)
  const lastDay = new Date(year, mon, 0)
  const from = toISODate(firstDay)
  const to = toISODate(lastDay)

  // Fetch staff
  const { data: staffData } = await supabase
    .from("staff")
    .select("id, first_name, last_name, role, color, days_per_week")
    .eq("organisation_id", orgId)
    .neq("onboarding_status", "inactive") as { data: { id: string; first_name: string; last_name: string; role: string; color: string; days_per_week: number }[] | null }
  const staff = staffData ?? []

  // Fetch assignments
  const { data: assignments } = await supabase
    .from("rota_assignments")
    .select("staff_id, date")
    .eq("organisation_id", orgId)
    .gte("date", from)
    .lte("date", to) as { data: { staff_id: string; date: string }[] | null }

  // Group assignments by staff → week → unique dates
  const staffIds = new Set(staff.map((s) => s.id))
  const byStaffWeek: Record<string, Record<string, Set<string>>> = {} // staffId → weekStart → set of dates

  for (const a of assignments ?? []) {
    if (!staffIds.has(a.staff_id)) continue
    const weekStart = getMondayOf(a.date)
    if (!byStaffWeek[a.staff_id]) byStaffWeek[a.staff_id] = {}
    if (!byStaffWeek[a.staff_id][weekStart]) byStaffWeek[a.staff_id][weekStart] = new Set()
    byStaffWeek[a.staff_id][weekStart].add(a.date)
  }

  // Build rows — only staff with at least one extra day
  const rows: ExtraDaysRow[] = []
  for (const s of staff) {
    const weekMap = byStaffWeek[s.id]
    if (!weekMap) continue
    const target = s.days_per_week ?? 5
    const weeks: { weekStart: string; assigned: number; extra: number }[] = []
    let totalExtra = 0
    for (const [weekStart, dates] of Object.entries(weekMap)) {
      const assigned = dates.size
      if (assigned > target) {
        const extra = assigned - target
        weeks.push({ weekStart, assigned, extra })
        totalExtra += extra
      }
    }
    if (weeks.length > 0) {
      weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      rows.push({
        staffId: s.id,
        firstName: s.first_name,
        lastName: s.last_name,
        department: s.role,
        color: s.color,
        daysPerWeek: target,
        totalExtra,
        weeks,
      })
    }
  }

  rows.sort((a, b) => b.totalExtra - a.totalExtra)

  const monthLabel = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(firstDay)

  return {
    orgName,
    periodLabel: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
    month,
    totalStaffWithExtra: rows.length,
    totalExtraDays: rows.reduce((s, r) => s + r.totalExtra, 0),
    rows,
  }
}

