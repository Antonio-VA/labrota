"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { TechReportData, TechReportRow } from "./types"
import { formatDateES, getDatesInRange } from "./_shared"

export async function generateTechReport(from: string, to: string): Promise<TechReportData | { error: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const dates = getDatesInRange(from, to)
  const totalDays = dates.length
  if (totalDays === 0) return { error: "Período inválido." }

  const [orgRes, tecnicasRes, assignmentsRes, skillsRes] = await Promise.all([
    supabase.from("organisations").select("name").eq("id", orgId).single(),
    supabase
      .from("tecnicas")
      .select("codigo, nombre_es, color, department")
      .eq("organisation_id", orgId)
      .eq("activa", true)
      .order("orden"),
    supabase
      .from("rota_assignments")
      .select("date, function_label")
      .eq("organisation_id", orgId)
      .gte("date", from)
      .lte("date", to)
      .neq("function_label", ""),
    supabase
      .from("staff_skills")
      .select("skill")
      .eq("organisation_id", orgId)
      .eq("level", "certified"),
  ])

  const orgName = (orgRes.data as { name: string } | null)?.name ?? ""
  const tecnicas = tecnicasRes.data as { codigo: string; nombre_es: string; color: string; department: string }[] | null
  const assignments = assignmentsRes.data as { date: string; function_label: string }[] | null
  const skills = skillsRes.data as { skill: string }[] | null

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

