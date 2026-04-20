"use server"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { generateSlug } from "@/lib/utils"
import { assertSuperAdmin, COVERAGE_PRESETS, DEFAULT_PUNCTIONS_BY_DAY } from "./_shared"

// ── createOrganisation ────────────────────────────────────────────────────────
export async function createOrganisation(formData: FormData) {
  await assertSuperAdmin()

  const name = (formData.get("name") as string).trim()
  const slug = (formData.get("slug") as string).trim()

  if (!name || !slug) return { error: "Name and slug are required." }

  // Setup configuration (with sensible defaults if not provided)
  const coveragePreset = (formData.get("coverage_preset") as string) || "standard"
  const rotaDisplayModeRaw = (formData.get("rota_display_mode") as string) || "by_shift"
  const rotaDisplayMode = rotaDisplayModeRaw === "by_task" ? "by_task" : "by_shift"
  const country = ((formData.get("country") as string) || "").trim()
  const authMethod = (formData.get("auth_method") as string) === "password" ? "password" : "otp"
  const firstUserEmail = ((formData.get("first_user_email") as string) || "").trim()
  const firstUserName = ((formData.get("first_user_name") as string) || "").trim()

  const admin = createAdminClient()

  // Create org with key settings applied upfront
  const { data: org, error: orgError } = await admin
    .from("organisations")
    .insert({
      name,
      slug,
      is_active: true,
      rota_display_mode: rotaDisplayMode,
      auth_method: authMethod,
    } as never)
    .select()
    .single()

  if (orgError) {
    if (orgError.code === "23505") return { error: "Slug already taken. Choose another." }
    return { error: orgError.message }
  }

  const orgId = (org as { id: string }).id

  // Seed lab_config row with coverage defaults + regional config
  const coverageByDay = COVERAGE_PRESETS[coveragePreset] ?? COVERAGE_PRESETS.standard
  await admin.from("lab_config").insert({
    organisation_id: orgId,
    coverage_by_day: coverageByDay,
    punctions_by_day: DEFAULT_PUNCTIONS_BY_DAY,
    country,
  } as never)

  // Seed default shift types (T1–T4)
  await admin.from("shift_types").insert([
    { organisation_id: orgId, code: "T1", name_es: "Mañana",      name_en: "Morning",         start_time: "07:30", end_time: "15:30", sort_order: 0 },
    { organisation_id: orgId, code: "T2", name_es: "Tarde",       name_en: "Afternoon",        start_time: "08:30", end_time: "16:30", sort_order: 1 },
    { organisation_id: orgId, code: "T3", name_es: "Tarde-tarde", name_en: "Late afternoon",   start_time: "09:00", end_time: "17:00", sort_order: 2 },
    { organisation_id: orgId, code: "T4", name_es: "Noche",       name_en: "Evening",          start_time: "09:30", end_time: "17:30", sort_order: 3 },
  ] as never[])

  // Optionally invite first admin user
  if (firstUserEmail) {
    const redirectTo = authMethod === "password"
      ? "https://www.labrota.app/auth/callback?next=/set-password"
      : "https://www.labrota.app/auth/callback"
    const { data: userData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(firstUserEmail, {
      data: { full_name: firstUserName || undefined },
      redirectTo,
    })
    if (!inviteError && userData?.user) {
      const userId = userData.user.id
      await admin.from("organisation_members").insert({
        organisation_id: orgId, user_id: userId, role: "admin",
      })
      await admin.from("profiles").update({ organisation_id: orgId, full_name: firstUserName || null }).eq("id", userId)
    }
  }

  revalidatePath("/admin")
  return { success: true, orgId }
}

// ── renameOrganisation ────────────────────────────────────────────────────────
export async function renameOrganisation(orgId: string, newName: string) {
  await assertSuperAdmin()

  const name = newName.trim()
  if (!name) return { error: "Name cannot be empty." }

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ name, slug: generateSlug(name) })
    .eq("id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

// ── deleteOrganisation ────────────────────────────────────────────────────────
export async function deleteOrganisation(orgId: string) {
  await assertSuperAdmin()

  const admin = createAdminClient()

  // Delete child tables first (FK-safe: assignments depend on rotas, skills on staff)
  await admin.from("rota_assignments").delete().eq("organisation_id", orgId)
  await Promise.all([
    admin.from("rotas").delete().eq("organisation_id", orgId),
    admin.from("staff_skills").delete().eq("organisation_id", orgId),
    admin.from("leaves").delete().eq("organisation_id", orgId),
  ])
  await Promise.all([
    admin.from("staff").delete().eq("organisation_id", orgId),
    admin.from("lab_config").delete().eq("organisation_id", orgId),
    admin.from("organisation_members").delete().eq("organisation_id", orgId),
    admin.from("profiles").update({ organisation_id: null }).eq("organisation_id", orgId),
    admin.from("profiles").update({ default_organisation_id: null } as never).eq("default_organisation_id", orgId),
  ])

  const { error } = await admin
    .from("organisations")
    .delete()
    .eq("id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/admin")
  return { success: true }
}

// ── toggleOrgStatus ───────────────────────────────────────────────────────────
export async function toggleOrgStatus(orgId: string, currentStatus: boolean) {
  await assertSuperAdmin()

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ is_active: !currentStatus })
    .eq("id", orgId)

  if (error) throw new Error(error.message)
  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
}

// ── updateOrgLogo ─────────────────────────────────────────────────────────────
export async function updateOrgLogo(orgId: string, logoUrl: string | null) {
  if (logoUrl && !logoUrl.startsWith("https://")) return { error: "Logo URL must use HTTPS." }
  await assertSuperAdmin()

  const admin = createAdminClient()
  const { error } = await admin
    .from("organisations")
    .update({ logo_url: logoUrl })
    .eq("id", orgId)

  if (error) return { error: error.message }

  revalidatePath("/admin")
  revalidatePath(`/admin/orgs/${orgId}`)
  return { success: true }
}

export async function copyOrganisation(
  sourceOrgId: string,
  newName: string,
  options: { departments?: boolean; shifts?: boolean; tasks?: boolean; rules?: boolean; staff?: boolean; users?: boolean; config?: boolean; rotas?: boolean }
): Promise<{ error?: string; orgId?: string }> {
  await assertSuperAdmin()
  const admin = createAdminClient()
  const { data: source } = await admin.from("organisations").select("*").eq("id", sourceOrgId).single()
  if (!source) return { error: "Source organisation not found" }

  const slug = newName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + `-${Date.now().toString(36)}`
  const { data: newOrg, error: createErr } = await admin
    .from("organisations")
    .insert({ name: newName, slug, is_active: true, rota_display_mode: (source as { rota_display_mode?: string }).rota_display_mode ?? "by_shift" })
    .select("id").single()
  if (createErr) return { error: createErr.message }
  const newOrgId = (newOrg as { id: string }).id

  // Lab config
  if (options.config !== false) {
    const { data: cfg } = await admin.from("lab_config").select("*").eq("organisation_id", sourceOrgId).maybeSingle()
    if (cfg) {
      const { id: _, organisation_id: __, created_at: ___, updated_at: ____, ...rest } = cfg as Record<string, unknown>
      await admin.from("lab_config").insert({ ...rest, organisation_id: newOrgId })
    } else {
      await admin.from("lab_config").insert({ organisation_id: newOrgId })
    }
  } else {
    await admin.from("lab_config").insert({ organisation_id: newOrgId })
  }

  // Copy config tables in parallel (no FK dependencies between them)
  const copyTasks: Promise<void>[] = []

  if (options.departments) {
    copyTasks.push((async () => {
      const { data } = await admin.from("departments").select("*").eq("organisation_id", sourceOrgId).order("sort_order")
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((d) => { const { id: _, organisation_id: __, created_at: ___, ...rest } = d; return { ...rest, organisation_id: newOrgId } })
        await admin.from("departments").insert(rows as never)
      }
    })())
  }
  if (options.shifts) {
    copyTasks.push((async () => {
      const { data } = await admin.from("shift_types").select("*").eq("organisation_id", sourceOrgId).order("sort_order")
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((s) => { const { id: _, organisation_id: __, created_at: ___, ...rest } = s; return { ...rest, organisation_id: newOrgId } })
        await admin.from("shift_types").insert(rows as never)
      }
    })())
  }
  if (options.tasks) {
    copyTasks.push((async () => {
      const { data } = await admin.from("tecnicas").select("*").eq("organisation_id", sourceOrgId).order("orden")
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((t) => { const { id: _, organisation_id: __, created_at: ___, ...rest } = t; return { ...rest, organisation_id: newOrgId } })
        await admin.from("tecnicas").insert(rows as never)
      }
    })())
  }
  if (options.rules) {
    copyTasks.push((async () => {
      const { data } = await admin.from("rota_rules").select("*").eq("organisation_id", sourceOrgId)
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((r) => { const { id: _, organisation_id: __, created_at: ___, updated_at: ____, ...rest } = r; return { ...rest, organisation_id: newOrgId, staff_ids: [] } })
        await admin.from("rota_rules").insert(rows as never)
      }
    })())
  }
  if (options.users) {
    copyTasks.push((async () => {
      const { data } = await admin.from("organisation_members").select("*").eq("organisation_id", sourceOrgId)
      if (data?.length) {
        const rows = (data as Record<string, unknown>[]).map((m) => { const { organisation_id: _, ...rest } = m; return { ...rest, organisation_id: newOrgId } })
        await admin.from("organisation_members").upsert(rows as never, { onConflict: "organisation_id,user_id" })
      }
    })())
  }

  await Promise.all(copyTasks)

  // Staff first: skill and rota-assignment inserts below need the old→new staff ID map.
  // Both multi-row inserts rely on PostgreSQL preserving input order in the RETURNING
  // clause, which Supabase passes through for .insert([...]).select().
  const staffIdMap = new Map<string, string>()
  if (options.staff) {
    const { data } = await admin.from("staff").select("*, staff_skills(*)").eq("organisation_id", sourceOrgId)
    const staffRows = (data ?? []) as Record<string, unknown>[]
    if (staffRows.length) {
      const staffInserts = staffRows.map((s) => {
        const { id: _, organisation_id: __, created_at: ___, updated_at: ____, staff_skills: _____, ...rest } = s
        return { ...rest, organisation_id: newOrgId }
      })
      const { data: inserted } = await admin.from("staff").insert(staffInserts as never).select("id")
      const insertedRows = (inserted ?? []) as { id: string }[]

      const allSkills: Record<string, unknown>[] = []
      for (let i = 0; i < staffRows.length; i++) {
        const newId = insertedRows[i]?.id
        if (!newId) continue
        staffIdMap.set(staffRows[i].id as string, newId)
        const skills = (staffRows[i].staff_skills as Record<string, unknown>[] | undefined) ?? []
        for (const sk of skills) {
          const { id: _, staff_id: __, organisation_id: ___, ...skRest } = sk
          allSkills.push({ ...skRest, staff_id: newId, organisation_id: newOrgId })
        }
      }
      if (allSkills.length) {
        await admin.from("staff_skills").insert(allSkills as never)
      }
    }
  }

  // Copy rotas and assignments (requires staff mapping)
  if (options.rotas) {
    const { data: rotas } = await admin.from("rotas").select("*").eq("organisation_id", sourceOrgId).order("week_start")
    const rotaRows = (rotas ?? []) as Record<string, unknown>[]
    if (rotaRows.length) {
      const rotaInserts = rotaRows.map((r) => {
        const { id: _, organisation_id: __, created_at: ___, updated_at: ____, ...rest } = r
        return { ...rest, organisation_id: newOrgId }
      })
      const { data: newRotas } = await admin.from("rotas").insert(rotaInserts as never).select("id")
      const newRotaRows = (newRotas ?? []) as { id: string }[]

      const rotaIdMap = new Map<string, string>()
      for (let i = 0; i < rotaRows.length; i++) {
        const newId = newRotaRows[i]?.id
        if (newId) rotaIdMap.set(rotaRows[i].id as string, newId)
      }

      if (rotaIdMap.size > 0) {
        const { data: assignments } = await admin
          .from("rota_assignments")
          .select("*")
          .in("rota_id", Array.from(rotaIdMap.keys()))
        const assignmentRows = ((assignments ?? []) as Record<string, unknown>[])
          .map((a) => {
            const { id: _, organisation_id: __, rota_id: oldRotaId, created_at: ____, updated_at: _____, ...aRest } = a
            const newRotaId = rotaIdMap.get(oldRotaId as string)
            const newStaffId = staffIdMap.get(a.staff_id as string)
            if (!newRotaId || !newStaffId) return null
            const newTraineeId = a.trainee_staff_id ? staffIdMap.get(a.trainee_staff_id as string) ?? null : null
            return { ...aRest, rota_id: newRotaId, organisation_id: newOrgId, staff_id: newStaffId, trainee_staff_id: newTraineeId }
          })
          .filter(Boolean)
        if (assignmentRows.length) {
          await admin.from("rota_assignments").insert(assignmentRows as never)
        }
      }
    }
  }

  revalidatePath("/admin")
  return { orgId: newOrgId }
}
