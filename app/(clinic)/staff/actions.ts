"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import type { StaffRole, OnboardingStatus, SkillName, SkillLevel, WorkingDay, ShiftType } from "@/lib/types/database"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const ALL_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
function parseSkillsFromForm(formData: FormData): { skill: string; level: SkillLevel }[] {
  const skills: { skill: string; level: SkillLevel }[] = []
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("skill_") && (value === "certified" || value === "training")) {
      skills.push({ skill: key.slice(6), level: value as SkillLevel })
    }
  }
  return skills
}

const STAFF_PASTEL_COLORS = [
  "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
  "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  "#E9D5FF", "#FEF08A", "#CCFBF1", "#FFE4E6",
  "#93C5FD", "#86EFAC", "#FCA5A5", "#FCD34D", "#C4B5FD", "#F9A8D4",
  "#6EE7B7", "#FDBA74", "#A5B4FC", "#FDA4AF", "#7DD3FC", "#BEF264",
  "#D8B4FE", "#FDE047", "#99F6E4", "#E0E7FF",
  "#E2E8F0", "#CBD5E1", "#D1D5DB", "#B0B8C4",
  "#E8D5C4", "#D4B896", "#C9B8A8", "#DEC9B0",
]

function parseFormData(formData: FormData) {
  return {
    staff: {
      first_name:        (formData.get("first_name") as string).trim(),
      last_name:         (formData.get("last_name")  as string).trim(),
      email:             ((formData.get("email") as string) || "").trim() || null,
      role:              formData.get("role") as StaffRole,
      working_pattern:   ALL_DAYS.filter(d => formData.get(`day_${d}`) === "on"),
      preferred_days:    ALL_DAYS.filter(d => formData.get(`pref_${d}`) === "on"),
      avoid_days:        ALL_DAYS.filter(d => formData.get(`avoid_${d}`) === "on"),
      contracted_hours:  37,   // kept in DB but not shown in UI
      days_per_week:     Math.min(7, Math.max(1, parseInt(formData.get("days_per_week") as string, 10) || 5)),
      onboarding_status: formData.get("onboarding_status") as OnboardingStatus,
      start_date:        formData.get("start_date") as string,
      end_date:          ((formData.get("end_date") as string) || "").trim() || null,
      notes:             ((formData.get("notes")    as string) || "").trim() || null,
      preferred_shift:   ((formData.get("preferred_shifts") as string) || (formData.get("preferred_shift") as string) || "") || null as ShiftType | null,
      avoid_shifts:      ((formData.get("avoid_shifts") as string) || "").split(",").filter(Boolean),
      color:             (formData.get("color") as string) || STAFF_PASTEL_COLORS[Math.floor(Math.random() * STAFF_PASTEL_COLORS.length)],
    },
    skills: parseSkillsFromForm(formData),
  }
}


export async function createStaff(_prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { staff, skills } = parseFormData(formData)

  if (staff.email && !EMAIL_RE.test(staff.email)) return { error: "Invalid email format." }
  if (staff.end_date && staff.start_date && staff.end_date < staff.start_date) return { error: "End date must be after start date." }

  const { data: newStaff, error } = await supabase
    .from("staff")
    .insert({ ...staff, organisation_id: orgId } as never)
    .select("id")
    .single()

  if (error || !newStaff) return { error: error?.message ?? "Failed to create staff member." }

  const newStaffId = (newStaff as { id: string }).id

  if (skills.length > 0) {
    const { error: skillsError } = await supabase.from("staff_skills").insert(
      skills.map(({ skill, level }) => ({ organisation_id: orgId, staff_id: newStaffId, skill, level })) as never
    )
    if (skillsError) return { error: skillsError.message }
  }

  // Run audit + invite after response so the redirect is instant
  const inviteViewer = formData.get("invite_viewer") === "on"
  after(async () => {
    // Audit
    const { data: { user: auUser } } = await supabase.auth.getUser()
    logAuditEvent({
      orgId, userId: auUser?.id, userEmail: auUser?.email,
      action: "staff_created", entityType: "staff", entityId: newStaffId,
      metadata: { firstName: staff.first_name, lastName: staff.last_name, role: staff.role },
    })

    // Invite as viewer if checkbox was checked and email provided
    if (inviteViewer && staff.email) {
      const admin = createAdminClient()
      const fullName = `${staff.first_name} ${staff.last_name}`.trim()

      const { data: existingProfile } = await admin
        .from("profiles")
        .select("id")
        .eq("email", staff.email)
        .maybeSingle() as { data: { id: string } | null }
      const existing = existingProfile ? { id: existingProfile.id } : null

      let userId: string
      if (existing) {
        userId = existing.id
      } else {
        const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(staff.email, {
          data: { full_name: fullName },
          redirectTo: "https://www.labrota.app/auth/callback",
        })
        if (inviteError) { console.error("Invite failed:", inviteError.message); return }
        userId = invited.user.id
      }

      await admin.from("organisation_members").upsert(
        { organisation_id: orgId, user_id: userId, role: "viewer", display_name: fullName } as never,
        { onConflict: "organisation_id,user_id" }
      )

      const { data: profile } = await admin.from("profiles").select("organisation_id").eq("id", userId).single() as { data: { organisation_id: string | null } | null }
      if (!profile?.organisation_id) {
        await admin.from("profiles").update({ organisation_id: orgId, full_name: fullName } as never).eq("id", userId)
      }
    }
  })

  revalidatePath("/staff")
  redirect("/staff?saved=1")
}

export async function updateStaff(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { staff, skills } = parseFormData(formData)

  if (staff.email && !EMAIL_RE.test(staff.email)) return { error: "Invalid email format." }
  if (staff.end_date && staff.start_date && staff.end_date < staff.start_date) return { error: "End date must be after start date." }

  const { error: updateError } = await supabase
    .from("staff")
    .update(staff as never)
    .eq("id", id)
    .eq("organisation_id", orgId)

  if (updateError) return { error: updateError.message }

  // Replace all skills: delete then re-insert
  const { error: delError } = await supabase.from("staff_skills").delete().eq("staff_id", id).eq("organisation_id", orgId)
  if (delError) return { error: delError.message }
  if (skills.length > 0) {
    const { error: insError } = await supabase.from("staff_skills").insert(
      skills.map(({ skill, level }) => ({ organisation_id: orgId, staff_id: id, skill, level })) as never
    )
    if (insError) return { error: insError.message }
  }

  revalidatePath("/staff")
  revalidatePath(`/staff/${id}`)
  redirect("/staff?saved=1")
}

export async function deleteStaff(id: string) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  await supabase.from("staff").delete().eq("id", id).eq("organisation_id", orgId)
  revalidatePath("/staff")
  redirect("/staff")
}

// ── Bulk actions ───────────────────────────────────────────────────────────────

export async function bulkAddSkill(
  staffIds: string[],
  skill: SkillName,
  level: SkillLevel,
): Promise<{ added: number; skipped: number; error?: string }> {
  if (staffIds.length === 0) return { added: 0, skipped: 0 }
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { added: 0, skipped: 0, error: "No organisation found." }

  const { data: existing } = await supabase
    .from("staff_skills")
    .select("staff_id")
    .eq("organisation_id", orgId)
    .in("staff_id", staffIds)
    .eq("skill", skill) as { data: { staff_id: string }[] | null }

  const alreadyHave = new Set((existing ?? []).map((r) => r.staff_id))
  const toAdd = staffIds.filter((id) => !alreadyHave.has(id))

  if (toAdd.length === 0) return { added: 0, skipped: staffIds.length }

  const { error } = await supabase
    .from("staff_skills")
    .insert(toAdd.map((staff_id) => ({ organisation_id: orgId, staff_id, skill, level })) as never)

  if (error) return { added: 0, skipped: staffIds.length, error: error.message }

  revalidatePath("/staff")
  return { added: toAdd.length, skipped: alreadyHave.size }
}

export async function bulkRemoveSkill(
  staffIds: string[],
  skill: SkillName,
): Promise<{ removed: number; error?: string }> {
  if (staffIds.length === 0) return { removed: 0 }
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { removed: 0, error: "No organisation found." }

  const { data, error } = await supabase
    .from("staff_skills")
    .delete()
    .eq("organisation_id", orgId)
    .in("staff_id", staffIds)
    .eq("skill", skill)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null }

  if (error) return { removed: 0, error: error.message }

  revalidatePath("/staff")
  return { removed: (data ?? []).length }
}

export async function bulkAddSkills(
  staffIds: string[],
  skills: { skill: SkillName; level: SkillLevel }[],
): Promise<{ added: number; skipped: number; error?: string }> {
  if (staffIds.length === 0 || skills.length === 0) return { added: 0, skipped: 0 }
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { added: 0, skipped: 0, error: "No organisation found." }

  const skillCodes = skills.map((s) => s.skill)
  const { data: existing } = await supabase
    .from("staff_skills")
    .select("staff_id, skill")
    .eq("organisation_id", orgId)
    .in("staff_id", staffIds)
    .in("skill", skillCodes) as { data: { staff_id: string; skill: string }[] | null }

  const existingSet = new Set((existing ?? []).map((r) => `${r.staff_id}:${r.skill}`))
  const rows: { organisation_id: string; staff_id: string; skill: string; level: string }[] = []
  for (const staffId of staffIds) {
    for (const { skill, level } of skills) {
      if (!existingSet.has(`${staffId}:${skill}`)) {
        rows.push({ organisation_id: orgId, staff_id: staffId, skill, level })
      }
    }
  }
  const skipped = staffIds.length * skills.length - rows.length
  if (rows.length === 0) return { added: 0, skipped }

  const { error } = await supabase.from("staff_skills").insert(rows as never)
  if (error) return { added: 0, skipped, error: error.message }

  revalidatePath("/staff")
  return { added: rows.length, skipped }
}

export async function bulkRemoveSkills(
  staffIds: string[],
  skills: SkillName[],
): Promise<{ removed: number; error?: string }> {
  if (staffIds.length === 0 || skills.length === 0) return { removed: 0 }
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { removed: 0, error: "No organisation found." }

  const { data, error } = await supabase
    .from("staff_skills")
    .delete()
    .eq("organisation_id", orgId)
    .in("staff_id", staffIds)
    .in("skill", skills)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null }

  if (error) return { removed: 0, error: error.message }

  revalidatePath("/staff")
  return { removed: (data ?? []).length }
}

export async function bulkUpdateStatus(
  staffIds: string[],
  status: OnboardingStatus,
): Promise<{ updated: number; error?: string }> {
  if (staffIds.length === 0) return { updated: 0 }
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { updated: 0, error: "Not authenticated." }

  const { data, error } = await supabase
    .from("staff")
    .update({ onboarding_status: status } as never)
    .in("id", staffIds)
    .eq("organisation_id", orgId)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null }

  if (error) return { updated: 0, error: error.message }

  revalidatePath("/staff")
  return { updated: (data ?? []).length }
}

export async function bulkSoftDeleteStaff(
  staffIds: string[],
): Promise<{ deleted: number; error?: string }> {
  if (staffIds.length === 0) return { deleted: 0 }
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { deleted: 0, error: "Not authenticated." }
  const today = new Date().toISOString().split("T")[0]

  const { data, error } = await supabase
    .from("staff")
    .update({ onboarding_status: "inactive" as OnboardingStatus, end_date: today } as never)
    .in("id", staffIds)
    .eq("organisation_id", orgId)
    .select("id") as { data: { id: string }[] | null; error: { message: string } | null }

  if (error) return { deleted: 0, error: error.message }

  revalidatePath("/staff")
  return { deleted: (data ?? []).length }
}

export async function hardDeleteStaff(
  staffIds: string[],
): Promise<{ deleted: number; error?: string }> {
  if (staffIds.length === 0) return { deleted: 0 }
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { deleted: 0, error: "Not authenticated." }

  // Safety guard: only allow hard-deleting inactive staff
  const { data: check, error: checkError } = await supabase
    .from("staff")
    .select("id")
    .in("id", staffIds)
    .eq("organisation_id", orgId)
    .neq("onboarding_status", "inactive") as { data: { id: string }[] | null; error: { message: string } | null }

  if (checkError) return { deleted: 0, error: checkError.message }
  if ((check ?? []).length > 0) return { deleted: 0, error: "Only inactive members can be permanently deleted." }

  const { error } = await supabase
    .from("staff")
    .delete()
    .in("id", staffIds)
    .eq("organisation_id", orgId)

  if (error) return { deleted: 0, error: error.message }

  revalidatePath("/staff")
  return { deleted: staffIds.length }
}

export async function bulkUpdateStaffField(
  updates: { id: string; field: string; value: unknown }[],
): Promise<{ updated: number; error?: string }> {
  if (updates.length === 0) return { updated: 0 }
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { updated: 0, error: "Not authenticated." }
  let count = 0
  for (const { id, field, value } of updates) {
    // Only allow safe fields
    const allowed = ["first_name", "last_name", "preferred_shift", "avoid_shifts", "preferred_days", "avoid_days", "days_per_week", "working_pattern", "onboarding_status", "color"]
    if (!allowed.includes(field)) continue
    const { error } = await supabase
      .from("staff")
      .update({ [field]: value } as never)
      .eq("id", id)
      .eq("organisation_id", orgId)
    if (!error) count++
  }
  revalidatePath("/staff")
  return { updated: count }
}
