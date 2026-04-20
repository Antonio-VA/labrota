"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"
import type { OnboardingStatus, SkillName, SkillLevel } from "@/lib/types/database"
import { toISODate } from "@/lib/format-date"

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
    .insert(toAdd.map((staff_id) => ({ organisation_id: orgId, staff_id, skill, level })))

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
  const rows: { organisation_id: string; staff_id: string; skill: SkillName; level: SkillLevel }[] = []
  for (const staffId of staffIds) {
    for (const { skill, level } of skills) {
      if (!existingSet.has(`${staffId}:${skill}`)) {
        rows.push({ organisation_id: orgId, staff_id: staffId, skill, level })
      }
    }
  }
  const skipped = staffIds.length * skills.length - rows.length
  if (rows.length === 0) return { added: 0, skipped }

  const { error } = await supabase.from("staff_skills").insert(rows)
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
    .update({ onboarding_status: status })
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
  const today = toISODate()

  const { data, error } = await supabase
    .from("staff")
    .update({ onboarding_status: "inactive" as OnboardingStatus, end_date: today })
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
  const allowed = new Set(["first_name", "last_name", "email", "role", "preferred_shift", "avoid_shifts", "preferred_days", "avoid_days", "days_per_week", "working_pattern", "onboarding_status", "color"])

  const results = await Promise.all(
    updates
      .filter((u) => allowed.has(u.field))
      .map(({ id, field, value }) =>
        supabase
          .from("staff")
          .update({ [field]: value })
          .eq("id", id)
          .eq("organisation_id", orgId)
      )
  )
  const count = results.filter((r) => !r.error).length

  revalidatePath("/staff")
  return { updated: count }
}
