"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"

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

function formatDateES(iso: string): string {
  const d = new Date(iso + "T12:00:00")
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })
}
