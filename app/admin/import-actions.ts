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

  // 4. Create staff
  const staffIdMap: Record<string, string> = {} // initials → staff id
  for (const s of payload.staff) {
    const { data: staffRow, error: staffErr } = await admin
      .from("staff")
      .insert({
        organisation_id: orgId,
        first_name: s.firstName || s.initials,
        last_name: s.lastName || "",
        role: s.department || "lab",
        working_pattern: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
        days_per_week: 6,
        onboarding_status: "active",
        start_date: new Date().toISOString().split("T")[0],
        contracted_hours: 37,
      } as never)
      .select("id")
      .single()
    if (staffErr) continue
    staffIdMap[s.initials] = (staffRow as { id: string }).id
  }

  // 5. Create techniques (by_task) or shifts (by_shift)
  if (payload.mode === "by_task") {
    const COLORS = ["blue", "green", "amber", "purple", "coral", "teal", "slate", "red"]
    for (let i = 0; i < payload.techniques.length; i++) {
      const t = payload.techniques[i]
      const code = t.name.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) || `T${i}`
      const { data: tecRow } = await admin
        .from("tecnicas")
        .insert({
          organisation_id: orgId,
          nombre_es: t.name,
          nombre_en: t.name,
          codigo: code,
          color: t.color || COLORS[i % COLORS.length],
          department: "lab",
          activa: true,
          orden: t.order,
        } as never)
        .select("id")
        .single()

      // Add staff skills for qualified staff
      if (tecRow) {
        for (const initials of t.qualifiedInitials) {
          const staffId = staffIdMap[initials]
          if (staffId) {
            await admin.from("staff_skills").insert({
              organisation_id: orgId,
              staff_id: staffId,
              skill: code,
              level: "certified",
            } as never)
          }
        }
      }
    }
  } else {
    for (let i = 0; i < payload.shifts.length; i++) {
      const s = payload.shifts[i]
      await admin.from("shift_types").insert({
        organisation_id: orgId,
        code: `T${i + 1}`,
        name_es: s.name,
        name_en: s.name,
        start_time: s.start || "07:30",
        end_time: s.end || "15:30",
        sort_order: i,
      } as never)
    }
  }

  // 6. Create leave records
  for (const l of payload.leaves) {
    const staffId = staffIdMap[l.initials]
    if (!staffId || !l.from || !l.to) continue
    await admin.from("leaves").insert({
      organisation_id: orgId,
      staff_id: staffId,
      type: l.type || "annual",
      start_date: l.from,
      end_date: l.to,
      status: "approved",
    } as never)
  }

  // 7. Create initial rota week
  if (payload.assignments.length > 0) {
    const { data: rotaRow } = await admin
      .from("rotas")
      .insert({ organisation_id: orgId, week_start: payload.weekStart, status: "draft" } as never)
      .select("id")
      .single()

    if (rotaRow) {
      const rotaId = (rotaRow as { id: string }).id
      for (const a of payload.assignments) {
        const staffId = staffIdMap[a.initials]
        if (!staffId) continue
        await admin.from("rota_assignments").insert({
          organisation_id: orgId,
          rota_id: rotaId,
          staff_id: staffId,
          date: a.date,
          shift_type: "T1",
          function_label: a.task ? a.task.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3) : null,
          is_manual_override: false,
        } as never)
      }
    }
  }

  // 8. Add current user as admin
  await admin.from("organisation_members").insert({
    organisation_id: orgId, user_id: user.id, role: "admin",
  } as never)

  revalidatePath("/admin")
  return { orgId }
}
