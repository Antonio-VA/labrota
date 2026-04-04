"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { formatDateWithYear } from "@/lib/format-date"

// ── Types ────────────────────────────────────────────────────────────────────

export interface StaffReportRow {
  staffId: string
  firstName: string
  lastName: string
  department: string
  color: string
  assignments: number // days with at least one assignment (by_shift) or total technique assignments (by_task)
  daysOff: number     // days with no assignment and no leave
  daysLeave: number   // days covered by leave
  vsMean: number      // difference from average
}

export interface StaffReportData {
  orgName: string
  periodLabel: string
  from: string
  to: string
  totalDays: number
  meanAssignments: number
  activeStaff: number
  rows: StaffReportRow[]
  mode: "by_shift" | "by_task"
}

export interface TechReportRow {
  codigo: string
  nombre: string
  color: string
  daysCovered: number
  daysUncovered: number
  coveragePct: number
  qualifiedStaff: number
}

export interface TechReportData {
  orgName: string
  periodLabel: string
  from: string
  to: string
  totalDays: number
  techniqueCount: number
  daysWithGaps: number
  rows: TechReportRow[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = []
  const d = new Date(from + "T12:00:00")
  const end = new Date(to + "T12:00:00")
  while (d <= end) {
    dates.push(d.toISOString().split("T")[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

// ── Fetch org display mode ───────────────────────────────────────────────────

export async function getOrgDisplayMode(): Promise<{ mode: string; orgName: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { mode: "by_shift", orgName: "" }
  const { data } = await supabase.from("organisations").select("name, rota_display_mode").eq("id", orgId).single()
  return { mode: (data as { rota_display_mode?: string } | null)?.rota_display_mode ?? "by_shift", orgName: (data as { name: string } | null)?.name ?? "" }
}

// ── Report 1: Resumen de Personal ────────────────────────────────────────────

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

// ── Report 2: Cobertura de Técnicas ──────────────────────────────────────────

export async function generateTechReport(from: string, to: string): Promise<TechReportData | { error: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { data: org } = await supabase.from("organisations").select("name").eq("id", orgId).single()
  const orgName = (org as { name: string } | null)?.name ?? ""

  const dates = getDatesInRange(from, to)
  const totalDays = dates.length
  if (totalDays === 0) return { error: "Período inválido." }

  // Fetch active técnicas
  const { data: tecnicas } = await supabase
    .from("tecnicas")
    .select("codigo, nombre_es, color, department")
    .eq("organisation_id", orgId)
    .eq("activa", true)
    .order("orden") as { data: { codigo: string; nombre_es: string; color: string; department: string }[] | null }

  // Fetch assignments with function_label
  const { data: assignments } = await supabase
    .from("rota_assignments")
    .select("date, function_label")
    .eq("organisation_id", orgId)
    .gte("date", from)
    .lte("date", to)
    .neq("function_label", "") as { data: { date: string; function_label: string }[] | null }

  // Fetch qualified staff count per technique
  const { data: skills } = await supabase
    .from("staff_skills")
    .select("skill")
    .eq("organisation_id", orgId)
    .eq("level", "certified") as { data: { skill: string }[] | null }

  const qualifiedCount: Record<string, number> = {}
  for (const sk of skills ?? []) {
    qualifiedCount[sk.skill] = (qualifiedCount[sk.skill] ?? 0) + 1
  }

  // Build coverage map: tecnica_code → set of covered dates
  const coverageMap: Record<string, Set<string>> = {}
  for (const a of assignments ?? []) {
    if (!a.function_label) continue
    if (!coverageMap[a.function_label]) coverageMap[a.function_label] = new Set()
    coverageMap[a.function_label].add(a.date)
  }

  let daysWithGaps = 0
  const gapDays = new Set<string>()

  const rows: TechReportRow[] = (tecnicas ?? []).map((t) => {
    const covered = coverageMap[t.codigo]?.size ?? 0
    const uncovered = totalDays - covered
    const pct = totalDays > 0 ? Math.round((covered / totalDays) * 100) : 0
    if (uncovered > 0) {
      // Track unique gap days
      for (const d of dates) {
        if (!coverageMap[t.codigo]?.has(d)) gapDays.add(d)
      }
    }
    return {
      codigo: t.codigo,
      nombre: t.nombre_es,
      color: t.color,
      daysCovered: covered,
      daysUncovered: uncovered,
      coveragePct: pct,
      qualifiedStaff: qualifiedCount[t.codigo] ?? 0,
    }
  })

  daysWithGaps = gapDays.size

  return {
    orgName,
    periodLabel: `${formatDateES(from)} – ${formatDateES(to)}`,
    from,
    to,
    totalDays,
    techniqueCount: (tecnicas ?? []).length,
    daysWithGaps,
    rows,
  }
}

// ── Report 3: Extra Days Worked ─────────────────────────────────────────────

export interface ExtraDaysRow {
  staffId: string
  firstName: string
  lastName: string
  department: string
  color: string
  daysPerWeek: number
  totalExtra: number
  weeks: { weekStart: string; assigned: number; extra: number }[]
}

export interface ExtraDaysData {
  orgName: string
  periodLabel: string
  month: string
  totalStaffWithExtra: number
  totalExtraDays: number
  rows: ExtraDaysRow[]
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const dow = d.getDay()
  d.setDate(d.getDate() - ((dow + 6) % 7))
  return d
}

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
  const from = firstDay.toISOString().split("T")[0]
  const to = lastDay.toISOString().split("T")[0]

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
    const weekStart = getMonday(new Date(a.date + "T12:00:00")).toISOString().split("T")[0]
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

// ── Report 4: Confirmed Leaves ──────────────────────────────────────────────

export interface LeaveReportRow {
  leaveId: string
  staffName: string
  department: string
  color: string
  type: string
  startDate: string
  endDate: string
  days: number
  notes: string | null
}

export interface LeaveReportData {
  orgName: string
  periodLabel: string
  from: string
  to: string
  totalLeaves: number
  totalDays: number
  rows: LeaveReportRow[]
}

export async function generateLeaveReport(from: string, to: string): Promise<LeaveReportData | { error: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { data: org } = await supabase.from("organisations").select("name").eq("id", orgId).single()
  const orgName = (org as { name: string } | null)?.name ?? ""

  // Fetch approved leaves overlapping the range
  const { data: leaves } = await supabase
    .from("leaves")
    .select("id, staff_id, type, start_date, end_date, notes")
    .eq("organisation_id", orgId)
    .eq("status", "approved")
    .lte("start_date", to)
    .gte("end_date", from)
    .order("start_date") as { data: { id: string; staff_id: string; type: string; start_date: string; end_date: string; notes: string | null }[] | null }

  // Fetch staff lookup
  const { data: staffData } = await supabase
    .from("staff")
    .select("id, first_name, last_name, role, color")
    .eq("organisation_id", orgId) as { data: { id: string; first_name: string; last_name: string; role: string; color: string }[] | null }

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

function formatDateES(iso: string): string {
  return formatDateWithYear(iso + "T12:00:00", "es")
}
