"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/admin"
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

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .eq("id", user.id)
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
}

const STAFF_PASTEL_COLORS = [
  "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
  "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  "#E9D5FF", "#FEF08A", "#CCFBF1", "#FFE4E6",
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
      preferred_shift:   ((formData.get("preferred_shift") as string) || "") || null as ShiftType | null,
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

  // Audit
  const { data: { user: auUser } } = await supabase.auth.getUser()
  logAuditEvent({
    orgId, userId: auUser?.id, userEmail: auUser?.email,
    action: "staff_created", entityType: "staff", entityId: newStaffId,
    metadata: { firstName: staff.first_name, lastName: staff.last_name, role: staff.role },
  })

  if (skills.length > 0) {
    const { error: skillsError } = await supabase.from("staff_skills").insert(
      skills.map(({ skill, level }) => ({ organisation_id: orgId, staff_id: newStaffId, skill, level })) as never
    )
    if (skillsError) return { error: skillsError.message }
  }

  // Invite as viewer if checkbox was checked and email provided
  const inviteViewer = formData.get("invite_viewer") === "on"
  if (inviteViewer && staff.email) {
    const admin = createAdminClient()
    const fullName = `${staff.first_name} ${staff.last_name}`.trim()

    // Check if auth user already exists
    const { data: existingUsers } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const existing = existingUsers?.users.find((u) => u.email === staff.email)

    let userId: string
    if (existing) {
      userId = existing.id
    } else {
      const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(staff.email, {
        data: { full_name: fullName },
      })
      if (inviteError) return { error: `Staff created but invite failed: ${inviteError.message}` }
      userId = invited.user.id
    }

    // Add to organisation_members as viewer
    await admin.from("organisation_members").upsert(
      { organisation_id: orgId, user_id: userId, role: "viewer", display_name: fullName } as never,
      { onConflict: "organisation_id,user_id" }
    )

    // Set active org if first org
    const { data: profile } = await admin.from("profiles").select("organisation_id").eq("id", userId).single() as { data: { organisation_id: string | null } | null }
    if (!profile?.organisation_id) {
      await admin.from("profiles").update({ organisation_id: orgId, full_name: fullName } as never).eq("id", userId)
    }
  }

  revalidatePath("/staff")
  redirect("/staff")
}

export async function updateStaff(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const { staff, skills } = parseFormData(formData)

  if (staff.email && !EMAIL_RE.test(staff.email)) return { error: "Invalid email format." }
  if (staff.end_date && staff.start_date && staff.end_date < staff.start_date) return { error: "End date must be after start date." }

  const { error: updateError } = await supabase
    .from("staff")
    .update(staff as never)
    .eq("id", id)

  if (updateError) return { error: updateError.message }

  // Replace all skills: delete then re-insert
  await supabase.from("staff_skills").delete().eq("staff_id", id)
  if (skills.length > 0) {
    const orgId = await getOrgId()
    if (orgId) {
      await supabase.from("staff_skills").insert(
        skills.map(({ skill, level }) => ({ organisation_id: orgId, staff_id: id, skill, level })) as never
      )
    }
  }

  revalidatePath("/staff")
  revalidatePath(`/staff/${id}`)
  redirect("/staff")
}

export async function deleteStaff(id: string) {
  const supabase = await createClient()
  await supabase.from("staff").delete().eq("id", id)
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

export async function bulkUpdateStatus(
  staffIds: string[],
  status: OnboardingStatus,
): Promise<{ updated: number; error?: string }> {
  if (staffIds.length === 0) return { updated: 0 }
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("staff")
    .update({ onboarding_status: status } as never)
    .in("id", staffIds)
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
  const today = new Date().toISOString().split("T")[0]

  const { data, error } = await supabase
    .from("staff")
    .update({ onboarding_status: "inactive" as OnboardingStatus, end_date: today } as never)
    .in("id", staffIds)
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

  // Safety guard: only allow hard-deleting inactive staff
  const { data: check, error: checkError } = await supabase
    .from("staff")
    .select("id")
    .in("id", staffIds)
    .neq("onboarding_status", "inactive") as { data: { id: string }[] | null; error: { message: string } | null }

  if (checkError) return { deleted: 0, error: checkError.message }
  if ((check ?? []).length > 0) return { deleted: 0, error: "Only inactive members can be permanently deleted." }

  const { error } = await supabase
    .from("staff")
    .delete()
    .in("id", staffIds)

  if (error) return { deleted: 0, error: error.message }

  revalidatePath("/staff")
  return { deleted: staffIds.length }
}
