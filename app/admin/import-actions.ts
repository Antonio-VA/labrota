"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

interface ImportStaff {
  initials: string
  firstName: string
  lastName: string
  department: string
}

interface ImportTechnique {
  name: string
  qualifiedInitials: string[]
  order: number
  color: string
}

interface ImportShift {
  name: string
  start: string
  end: string
}

interface ImportLeave {
  initials: string
  from: string
  to: string
  type: string
}

interface ImportAssignment {
  date: string
  initials: string
  task?: string
  shift?: string
}

interface ImportDepartment {
  name: string
  code: string
  colour: string
}

export interface ImportPayload {
  orgName: string
  mode: "by_task" | "by_shift"
  staff: ImportStaff[]
  departments: ImportDepartment[]
  techniques: ImportTechnique[]
  shifts: ImportShift[]
  leaves: ImportLeave[]
  assignments: ImportAssignment[]
  weekStart: string
}

export async function importOrganisation(payload: ImportPayload): Promise<{ error?: string; orgId?: string }> {
  // Verify super admin
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "super_admin") {
    return { error: "Unauthorised." }
  }

  const admin = createAdminClient()
  const slug = payload.orgName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

  try {

  // 1. Create org
  const { data: org, error: orgErr } = await admin
    .from("organisations")
    .insert({ name: payload.orgName, slug, is_active: true, rota_display_mode: payload.mode } as never)
    .select("id")
    .single()
  if (orgErr) return { error: orgErr.code === "23505" ? "Slug already taken." : orgErr.message }
  const orgId = (org as { id: string }).id

  // 2. Seed lab_config
  await admin.from("lab_config").insert({ organisation_id: orgId } as never)

  // 3. Create departments
  for (let i = 0; i < payload.departments.length; i++) {
    const d = payload.departments[i]
    await admin.from("departments").insert({
      organisation_id: orgId, code: d.code, name: d.name, colour: d.colour,
      abbreviation: d.name.slice(0, 3), sort_order: i, is_default: i < 3,
    } as never)
  }

  // 4. Create staff (batch insert, then map initials → IDs)
  const staffIdMap: Record<string, string> = {}
  const today = new Date().toISOString().split("T")[0]
  if (payload.staff.length > 0) {
    const staffRows = payload.staff.map((s) => ({
      organisation_id: orgId,
      first_name: s.firstName || s.initials,
      last_name: s.lastName || "",
      role: s.department || "lab",
      working_pattern: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      days_per_week: 6,
      onboarding_status: "active",
      start_date: today,
      contracted_hours: 37,
    }))
    const { data: inserted } = await admin
      .from("staff")
      .insert(staffRows as never)
      .select("id, first_name, last_name")
    if (inserted) {
      for (let i = 0; i < payload.staff.length && i < inserted.length; i++) {
        staffIdMap[payload.staff[i].initials] = (inserted[i] as { id: string }).id
      }
    }
  }

  // 5. Create techniques (by_task) or shifts (by_shift)
  if (payload.mode === "by_task") {
    const FALLBACK_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316", "#EC4899"]
    const tecRows = payload.techniques.map((t, i) => ({
      organisation_id: orgId,
      nombre_es: t.name,
      nombre_en: t.name,
      codigo: t.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || `T${i}`,
      color: t.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length],
      department: "lab",
      activa: true,
      orden: t.order,
    }))
    if (tecRows.length > 0) {
      await admin.from("tecnicas").insert(tecRows as never)
    }

    // Batch insert staff skills
    const skillRows: { organisation_id: string; staff_id: string; skill: string; level: string }[] = []
    for (const t of payload.techniques) {
      const code = t.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3)
      for (const initials of t.qualifiedInitials) {
        const staffId = staffIdMap[initials]
        if (staffId) skillRows.push({ organisation_id: orgId, staff_id: staffId, skill: code, level: "certified" })
      }
    }
    if (skillRows.length > 0) {
      await admin.from("staff_skills").insert(skillRows as never)
    }

    // Create a default shift for by_task orgs (needed for assignments)
    await admin.from("shift_types").insert({
      organisation_id: orgId,
      code: "T1",
      name_es: "Jornada",
      name_en: "Day shift",
      start_time: "09:00",
      end_time: "17:00",
      sort_order: 0,
    } as never)
  } else {
    const shiftRows = payload.shifts.map((s, i) => ({
      organisation_id: orgId,
      code: `T${i + 1}`,
      name_es: s.name,
      name_en: s.name,
      start_time: s.start || "07:30",
      end_time: s.end || "15:30",
      sort_order: i,
    }))
    if (shiftRows.length > 0) {
      await admin.from("shift_types").insert(shiftRows as never)
    }
  }

  // 6. Create leave records (batch)
  const leaveRows = payload.leaves
    .filter((l) => staffIdMap[l.initials] && l.from && l.to)
    .map((l) => ({
      organisation_id: orgId,
      staff_id: staffIdMap[l.initials],
      type: l.type || "annual",
      start_date: l.from,
      end_date: l.to,
      status: "approved",
    }))
  if (leaveRows.length > 0) {
    await admin.from("leaves").insert(leaveRows as never)
  }

  // 7. Create initial rota week (batch assignments)
  if (payload.assignments.length > 0) {
    const { data: rotaRow } = await admin
      .from("rotas")
      .insert({ organisation_id: orgId, week_start: payload.weekStart, status: "draft" } as never)
      .select("id")
      .single()

    if (rotaRow) {
      const rotaId = (rotaRow as { id: string }).id
      const assignmentRows = payload.assignments
        .filter((a) => staffIdMap[a.initials])
        .map((a) => ({
          organisation_id: orgId,
          rota_id: rotaId,
          staff_id: staffIdMap[a.initials],
          date: a.date,
          shift_type: "T1",
          function_label: a.task ? a.task.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : "",
          is_manual_override: false,
        }))
      if (assignmentRows.length > 0) {
        // Batch in chunks of 100 to avoid payload limits
        for (let i = 0; i < assignmentRows.length; i += 100) {
          await admin.from("rota_assignments").upsert(assignmentRows.slice(i, i + 100) as never, { onConflict: "rota_id,staff_id,date,function_label", ignoreDuplicates: true })
        }
      }
    }
  }

  // 8. Add current user as admin
  await admin.from("organisation_members").insert({
    organisation_id: orgId, user_id: user.id, role: "admin",
  } as never)

  revalidatePath("/admin")
  return { orgId }

  } catch (e) {
    console.error("[importOrganisation] Error:", e)
    return { error: e instanceof Error ? e.message : "Error creating organisation." }
  }
}

// ── Import historical rota (enrich existing staff with skills/leaves) ────────

interface HistoricalPayload {
  staff: { initials: string; firstName: string; lastName: string }[]
  techniques: { name: string; qualifiedInitials: string[] }[]
  assignments: { date: string; initials: string; task?: string }[]
  leaves: { initials: string; from: string; to: string; type: string }[]
  weekStart: string
}

export async function importHistoricalRota(
  orgId: string,
  payload: HistoricalPayload
): Promise<{ error?: string; skillsAdded?: number; leavesAdded?: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== "super_admin") {
    return { error: "Unauthorised." }
  }

  const admin = createAdminClient()
  let skillsAdded = 0
  let leavesAdded = 0

  // Load existing staff for this org — match by initials (first_name[0] + last_name[0])
  const { data: existingStaff } = await admin
    .from("staff")
    .select("id, first_name, last_name")
    .eq("organisation_id", orgId) as { data: { id: string; first_name: string; last_name: string }[] | null }

  const staffByInitials: Record<string, string> = {}
  for (const s of existingStaff ?? []) {
    const initials = `${(s.first_name?.[0] ?? "").toUpperCase()}${(s.last_name?.[0] ?? "").toUpperCase()}`
    staffByInitials[initials] = s.id
  }

  // Load existing skills to avoid duplicates
  const { data: existingSkills } = await admin
    .from("staff_skills")
    .select("staff_id, skill")
    .eq("organisation_id", orgId) as { data: { staff_id: string; skill: string }[] | null }

  const skillSet = new Set((existingSkills ?? []).map((sk) => `${sk.staff_id}:${sk.skill}`))

  // Load existing técnicas to get code mapping
  const { data: existingTecnicas } = await admin
    .from("tecnicas")
    .select("codigo, nombre_es")
    .eq("organisation_id", orgId) as { data: { codigo: string; nombre_es: string }[] | null }

  const tecnicaCodeByName: Record<string, string> = {}
  for (const t of existingTecnicas ?? []) {
    tecnicaCodeByName[t.nombre_es.toLowerCase()] = t.codigo
    tecnicaCodeByName[t.codigo.toLowerCase()] = t.codigo
  }

  // Extract skills from assignments — who was assigned to which technique
  const skillsToAdd: { staffId: string; skill: string }[] = []

  for (const a of payload.assignments) {
    if (!a.task || a.initials === "ALL") continue
    const staffId = staffByInitials[a.initials]
    if (!staffId) continue

    // Resolve technique name to code
    const taskNorm = a.task.toLowerCase()
    const code = tecnicaCodeByName[taskNorm] ??
      a.task.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3)

    const key = `${staffId}:${code}`
    if (!skillSet.has(key)) {
      skillSet.add(key)
      skillsToAdd.push({ staffId, skill: code })
    }
  }

  // Also use the technique.qualifiedInitials from parsing
  for (const tech of payload.techniques) {
    const taskNorm = tech.name.toLowerCase()
    const code = tecnicaCodeByName[taskNorm] ??
      tech.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3)

    for (const initials of tech.qualifiedInitials) {
      const staffId = staffByInitials[initials]
      if (!staffId) continue
      const key = `${staffId}:${code}`
      if (!skillSet.has(key)) {
        skillSet.add(key)
        skillsToAdd.push({ staffId, skill: code })
      }
    }
  }

  // Insert new skills
  for (const { staffId, skill } of skillsToAdd) {
    await admin.from("staff_skills").insert({
      organisation_id: orgId,
      staff_id: staffId,
      skill,
      level: "certified",
    } as never)
    skillsAdded++
  }

  // Process leaves — only future or spanning-current
  const TODAY = new Date().toISOString().split("T")[0]
  for (const l of payload.leaves) {
    if (l.to && l.to < TODAY) continue // Past leave, skip
    const staffId = staffByInitials[l.initials]
    if (!staffId || !l.from) continue

    await admin.from("leaves").insert({
      organisation_id: orgId,
      staff_id: staffId,
      type: l.type || "annual",
      start_date: l.from < TODAY ? TODAY : l.from,
      end_date: l.to || l.from,
      status: "approved",
    } as never)
    leavesAdded++
  }

  revalidatePath(`/admin/orgs/${orgId}`)
  return { skillsAdded, leavesAdded }
}
