"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedAssignment {
  staff_id: string
  date: string
  shift_code: string
  task_codes?: string[]
}

export interface ParsedDayOff {
  staff_id: string
  date: string
}

export interface ImportRotaInput {
  assignments: ParsedAssignment[]
  days_off: ParsedDayOff[]
  conflict_mode: Record<string, "replace" | "merge" | "skip">
}

export interface ImportRotaResult {
  success: boolean
  weeks_imported: number
  assignments_created: number
  staff_skipped: number
  shifts_skipped: number
  error?: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d.toISOString().split("T")[0]
}

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from("profiles").select("organisation_id").eq("id", user.id).single()
  return (profile as { organisation_id: string } | null)?.organisation_id ?? null
}

// ── Import action ────────────────────────────────────────────────────────────

export async function importFutureRota(input: ImportRotaInput): Promise<ImportRotaResult> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { success: false, weeks_imported: 0, assignments_created: 0, staff_skipped: 0, shifts_skipped: 0, error: "Not authenticated" }

  // Group assignments by week
  const byWeek: Record<string, ParsedAssignment[]> = {}
  for (const a of input.assignments) {
    const ws = getMondayOfWeek(a.date)
    if (!byWeek[ws]) byWeek[ws] = []
    byWeek[ws].push(a)
  }

  // Fetch tecnica ID map for task assignments
  const { data: tecnicas } = await supabase.from("tecnicas").select("id, codigo").eq("organisation_id", orgId)
  const tecnicaIdMap: Record<string, string> = {}
  for (const t of (tecnicas ?? []) as { id: string; codigo: string }[]) {
    tecnicaIdMap[t.codigo] = t.id
  }

  let totalWeeks = 0
  let totalAssignments = 0

  for (const [weekStart, assignments] of Object.entries(byWeek)) {
    const mode = input.conflict_mode[weekStart] ?? "merge"
    if (mode === "skip") continue

    // Upsert rota
    const { data: rota, error: rotaErr } = await supabase
      .from("rotas")
      .upsert(
        { organisation_id: orgId, week_start: weekStart, status: "draft", generation_type: "manual" } as never,
        { onConflict: "organisation_id,week_start" }
      )
      .select("id")
      .single()

    if (rotaErr || !rota) continue
    const rotaId = (rota as { id: string }).id

    // Handle conflicts
    if (mode === "replace") {
      await supabase.from("rota_assignments").delete().eq("rota_id", rotaId)
    } else if (mode === "merge") {
      // Keep manual overrides, delete the rest
      await supabase.from("rota_assignments").delete().eq("rota_id", rotaId).eq("is_manual_override", false)
    }

    // Insert assignments
    const rows = assignments.map((a) => {
      const tecId = a.task_codes?.[0] ? tecnicaIdMap[a.task_codes[0]] ?? null : null
      return {
        rota_id: rotaId,
        staff_id: a.staff_id,
        date: a.date,
        shift_type: a.shift_code,
        function_label: a.task_codes?.[0] ?? "",
        tecnica_id: tecId,
        is_manual_override: false,
      }
    })

    if (rows.length > 0) {
      const { data: inserted } = await supabase
        .from("rota_assignments")
        .upsert(rows as never[], { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
        .select("id")

      totalAssignments += inserted?.length ?? rows.length
    }

    totalWeeks++
  }

  revalidatePath("/")
  revalidatePath("/settings")

  return {
    success: true,
    weeks_imported: totalWeeks,
    assignments_created: totalAssignments,
    staff_skipped: 0,
    shifts_skipped: 0,
  }
}
