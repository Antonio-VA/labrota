"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { StaffRole, OnboardingStatus, SkillName, SkillLevel, WorkingDay, ShiftType } from "@/lib/types/database"

const ALL_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const ALL_SKILLS: SkillName[] = [
  "biopsy", "icsi", "egg_collection", "embryo_transfer", "denudation",
]

async function getOrgId(): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("profiles")
    .select("organisation_id")
    .single() as { data: { organisation_id: string | null } | null }
  return data?.organisation_id ?? null
}

function parseFormData(formData: FormData) {
  return {
    staff: {
      first_name:        (formData.get("first_name") as string).trim(),
      last_name:         (formData.get("last_name")  as string).trim(),
      email:             ((formData.get("email") as string) || "").trim() || null,
      role:              formData.get("role") as StaffRole,
      working_pattern:   ALL_DAYS.filter(d => formData.get(`day_${d}`) === "on"),
      contracted_hours:  37,   // kept in DB but not shown in UI
      days_per_week:     Math.min(7, Math.max(1, parseInt(formData.get("days_per_week") as string, 10) || 5)),
      onboarding_status: formData.get("onboarding_status") as OnboardingStatus,
      start_date:        formData.get("start_date") as string,
      end_date:          ((formData.get("end_date") as string) || "").trim() || null,
      notes:             ((formData.get("notes")    as string) || "").trim() || null,
      preferred_shift:   ((formData.get("preferred_shift") as string) || "") || null as ShiftType | null,
    },
    skills: ALL_SKILLS
      .map(s => ({ skill: s, level: formData.get(`skill_${s}`) as SkillLevel | null }))
      .filter((s): s is { skill: SkillName; level: SkillLevel } => s.level !== null),
  }
}

export async function createStaff(_prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { staff, skills } = parseFormData(formData)

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

  revalidatePath("/staff")
  redirect("/staff")
}

export async function updateStaff(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const { staff, skills } = parseFormData(formData)

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
  if ((check ?? []).length > 0) return { deleted: 0, error: "Solo se pueden borrar definitivamente miembros inactivos." }

  const { error } = await supabase
    .from("staff")
    .delete()
    .in("id", staffIds)

  if (error) return { deleted: 0, error: error.message }

  revalidatePath("/staff")
  return { deleted: staffIds.length }
}
