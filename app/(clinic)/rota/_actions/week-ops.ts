"use server"

import { revalidatePath } from "next/cache"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { typedQuery } from "@/lib/supabase/typed-query"
import { getCachedOrgId } from "@/lib/auth-cache"
import { RECENT_ASSIGNMENTS_LOOKBACK_DAYS } from "@/lib/constants"
import { runRotaEngineV2 } from "@/lib/rota-engine-v2"
import { getWeekDates } from "@/lib/engine-helpers"
import { getMondayOf, toISODate } from "@/lib/format-date"
import { logAuditEvent } from "@/lib/audit"
import { captureSnapshot } from "@/lib/rota-snapshots"
import type {
  RotaStatus,
  StaffWithSkills,
  Leave,
  RotaAssignment,
  RotaRule,
  SkillName,
  ShiftType,
  StaffRole,
  ShiftTypeDefinition,
  Tecnica,
  LabConfig,
  ShiftCoverageByDay,
  ShiftCoverageEntry,
} from "@/lib/types/database"
export async function copyDayFromLastWeek(weekStart: string, date: string): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Get the same weekday from last week
  const lastWeekDate = new Date(date + "T12:00:00")
  lastWeekDate.setDate(lastWeekDate.getDate() - 7)
  const lastWeek = toISODate(lastWeekDate)

  const { data: lastWeekAssignments } = await typedQuery<{ staff_id: string; shift_type: string; function_label: string | null }[]>(
    supabase
      .from("rota_assignments")
      .select("staff_id, shift_type, function_label")
      .eq("date", lastWeek))

  if (!lastWeekAssignments || lastWeekAssignments.length === 0) {
    return { error: "No assignments on the same day last week." }
  }

  // Ensure rota exists
  const { data: rotaRow } = await typedQuery<{ id: string }>(
    supabase
      .from("rotas")
      .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id,week_start" })
      .select("id")
      .single())
  if (!rotaRow) return { error: "Error creating rota." }

  // Check who's on leave
  const { data: leaves } = await typedQuery<{ staff_id: string }[]>(
    supabase
      .from("leaves")
      .select("staff_id")
      .lte("start_date", date)
      .gte("end_date", date)
      .eq("status", "approved"))
  const leaveIds = new Set((leaves ?? []).map((l) => l.staff_id))

  const toInsert = lastWeekAssignments
    .filter((a) => !leaveIds.has(a.staff_id))
    .map((a) => ({
      organisation_id: orgId,
      rota_id: rotaRow.id,
      staff_id: a.staff_id,
      date,
      shift_type: a.shift_type,
      is_manual_override: true,
      function_label: a.function_label ?? "",
    }))

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return { count: toInsert.length }
}

export async function copyPreviousWeek(weekStart: string): Promise<{ error?: string; count?: number }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  // Previous week start
  const prevDate = new Date(weekStart + "T12:00:00")
  prevDate.setDate(prevDate.getDate() - 7)
  const prevWeekStart = toISODate(prevDate)
  const prevDates = getWeekDates(prevWeekStart)
  const currDates = getWeekDates(weekStart)

  // Fetch previous week's assignments
  const { data: prevAssignments } = await typedQuery<{ staff_id: string; date: string; shift_type: string; function_label: string | null }[]>(
    supabase
      .from("rota_assignments")
      .select("staff_id, date, shift_type, function_label")
      .gte("date", prevDates[0])
      .lte("date", prevDates[6]))

  if (!prevAssignments || prevAssignments.length === 0) {
    return { error: "No assignments in the previous week." }
  }

  // Upsert rota
  const { data: rotaRow } = await typedQuery<{ id: string }>(
    supabase
      .from("rotas")
      .upsert({ organisation_id: orgId, week_start: weekStart, status: "draft" }, { onConflict: "organisation_id,week_start" })
      .select("id")
      .single())
  if (!rotaRow) return { error: "Error creating rota." }

  // Check leaves for this week
  const { data: leaves } = await typedQuery<{ staff_id: string; start_date: string; end_date: string }[]>(
    supabase
      .from("leaves")
      .select("staff_id, start_date, end_date")
      .lte("start_date", currDates[6])
      .gte("end_date", currDates[0])
      .eq("status", "approved"))

  const onLeave: Record<string, Set<string>> = {}
  for (const l of leaves ?? []) {
    const s = new Date(l.start_date + "T12:00:00")
    const e = new Date(l.end_date + "T12:00:00")
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const iso = toISODate(d)
      if (!onLeave[iso]) onLeave[iso] = new Set()
      onLeave[iso].add(l.staff_id)
    }
  }

  // Map previous assignments to current week (same day offset)
  const toInsert = prevAssignments
    .map((a) => {
      const dayOffset = prevDates.indexOf(a.date)
      if (dayOffset < 0) return null
      const newDate = currDates[dayOffset]
      if (onLeave[newDate]?.has(a.staff_id)) return null
      return {
        organisation_id: orgId,
        rota_id: rotaRow.id,
        staff_id: a.staff_id,
        date: newDate,
        shift_type: a.shift_type,
        is_manual_override: false,
        function_label: a.function_label ?? "",
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  if (toInsert.length > 0) {
    const { error } = await supabase.from("rota_assignments").upsert(toInsert, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
    if (error) return { error: error.message }
  }

  revalidatePath("/")
  return { count: toInsert.length }
}

export async function clearWeek(weekStart: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const orgId = await getCachedOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { data: rotaRow, error: upsertErr } = await typedQuery<{ id: string }>(
    supabase
      .from("rotas")
      .upsert(
        { organisation_id: orgId, week_start: weekStart, status: "draft" },
        { onConflict: "organisation_id,week_start" }
      )
      .select("id")
      .single())

  if (upsertErr) return { error: upsertErr.message }
  if (!rotaRow) return { error: "Error creating rota." }

  // Best-effort: set generation_type
  await supabase.from("rotas").update({ generation_type: "manual" }).eq("id", rotaRow.id)

  await supabase.from("rota_assignments").delete().eq("rota_id", rotaRow.id)
  revalidatePath("/")
  return {}
}
