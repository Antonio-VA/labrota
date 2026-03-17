"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { StaffRole, OnboardingStatus, SkillName, WorkingDay } from "@/lib/types/database"

const ALL_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const ALL_SKILLS: SkillName[] = [
  "icsi", "iui", "vitrification", "thawing", "biopsy",
  "semen_analysis", "sperm_prep", "witnessing", "other",
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
      contracted_hours:  parseInt(formData.get("contracted_hours") as string, 10) || 37,
      onboarding_status: formData.get("onboarding_status") as OnboardingStatus,
      start_date:        formData.get("start_date") as string,
      end_date:          ((formData.get("end_date") as string) || "").trim() || null,
      notes:             ((formData.get("notes")    as string) || "").trim() || null,
    },
    skills: ALL_SKILLS.filter(s => formData.get(`skill_${s}`) === "on"),
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
      skills.map(skill => ({ organisation_id: orgId, staff_id: newStaffId, skill })) as never
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
        skills.map(skill => ({ organisation_id: orgId, staff_id: id, skill })) as never
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
