"use server"

import { revalidatePath, revalidateTag } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { orgStaticTag } from "@/lib/org-context-cache"
import type { StaffRole, OnboardingStatus, ContractType, SkillName, SkillLevel, WorkingDay, ShiftType } from "@/lib/types/database"

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
      onboarding_status:   formData.get("onboarding_status") as OnboardingStatus,
      contract_type:       (formData.get("contract_type") as ContractType) || "full_time",
      prefers_guardia:     formData.get("prefers_guardia") === "on",
      start_date:          formData.get("start_date") as string,
      end_date:            ((formData.get("end_date") as string) || "").trim() || null,
      notes:             ((formData.get("notes")    as string) || "").trim() || null,
      preferred_shift:   ((formData.get("preferred_shifts") as string) || (formData.get("preferred_shift") as string) || "") || null as ShiftType | null,
      avoid_shifts:      ((formData.get("avoid_shifts") as string) || "").split(",").filter(Boolean),
      color:             (formData.get("color") as string) || STAFF_PASTEL_COLORS[Math.floor(Math.random() * STAFF_PASTEL_COLORS.length)],
    },
    skills: parseSkillsFromForm(formData),
  }
}


function computeOnboardingEndDate(startDate: string, weeks: number): string | null {
  if (!weeks || weeks <= 0) return null
  const d = new Date(startDate + "T12:00:00")
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split("T")[0]
}

export async function createStaff(_prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "No organisation found." }

  const { staff, skills } = parseFormData(formData)
  const onboardingEndDate = ((formData.get("onboarding_end_date") as string) || "").trim() || null

  if (staff.email && !EMAIL_RE.test(staff.email)) return { error: "Invalid email format." }
  if (staff.end_date && staff.start_date && staff.end_date < staff.start_date) return { error: "End date must be after start date." }

  const { data: newStaff, error } = await supabase
    .from("staff")
    .insert({ ...staff, organisation_id: orgId, onboarding_end_date: onboardingEndDate } as never)
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
  // Capture user info before after() runs (session may be unavailable after response)
  const { data: { user: auUser } } = await supabase.auth.getUser()
  after(async () => {
    // Audit
    logAuditEvent({
      orgId, userId: auUser?.id, userEmail: auUser?.email,
      action: "staff_created", entityType: "staff", entityId: newStaffId,
      metadata: { firstName: staff.first_name, lastName: staff.last_name, role: staff.role },
    })

    // Invite as viewer if checkbox was checked and email provided
    if (inviteViewer && staff.email) {
      try {
        const admin = createAdminClient()
        const fullName = `${staff.first_name} ${staff.last_name}`.trim()

        // Check if user already exists in profiles (linked to auth.users)
        const { data: existingProfile } = await admin
          .from("profiles")
          .select("id")
          .eq("email", staff.email)
          .maybeSingle() as { data: { id: string } | null }

        let userId: string
        if (existingProfile) {
          userId = existingProfile.id
        } else {
          const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(staff.email, {
            data: { full_name: fullName },
            redirectTo: "https://www.labrota.app/auth/callback",
          })
          if (inviteError) { console.error("Invite failed:", inviteError.message); return }
          userId = invited.user.id
        }

        // Link staff record to user
        await admin.from("staff").update({ linked_user_id: userId } as never).eq("id", newStaffId)

        await admin.from("organisation_members").upsert(
          { organisation_id: orgId, user_id: userId, role: "viewer", display_name: fullName } as never,
          { onConflict: "organisation_id,user_id" }
        )

        const { data: profile } = await admin.from("profiles").select("organisation_id").eq("id", userId).single() as { data: { organisation_id: string | null } | null }
        if (!profile?.organisation_id) {
          await admin.from("profiles").update({ organisation_id: orgId, full_name: fullName } as never).eq("id", userId)
        }
      } catch (e) {
        console.error("Viewer invite error:", e)
      }
    }
  })

  revalidateTag(orgStaticTag(orgId))
  revalidatePath("/staff")
  redirect("/staff?saved=1")
}

export async function updateStaff(id: string, _prevState: unknown, formData: FormData) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  const { staff, skills } = parseFormData(formData)
  const onboardingEndDate = ((formData.get("onboarding_end_date") as string) || "").trim() || null

  if (staff.email && !EMAIL_RE.test(staff.email)) return { error: "Invalid email format." }
  if (staff.end_date && staff.start_date && staff.end_date < staff.start_date) return { error: "End date must be after start date." }

  const { error: updateError } = await supabase
    .from("staff")
    .update({ ...staff, onboarding_end_date: onboardingEndDate } as never)
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

  revalidateTag(orgStaticTag(orgId))
  revalidatePath("/staff")
  revalidatePath(`/staff/${id}`)
  redirect("/staff?saved=1")
}

export async function deleteStaff(id: string) {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }
  await supabase.from("staff").delete().eq("id", id).eq("organisation_id", orgId)
  revalidateTag(orgStaticTag(orgId))
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

  revalidateTag(orgStaticTag(orgId))
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

  revalidateTag(orgStaticTag(orgId))
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

  revalidateTag(orgStaticTag(orgId))
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

  revalidateTag(orgStaticTag(orgId))
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

  revalidateTag(orgStaticTag(orgId))
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

  revalidateTag(orgStaticTag(orgId))
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

  revalidateTag(orgStaticTag(orgId))
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
  revalidateTag(orgStaticTag(orgId))
  revalidatePath("/staff")
  return { updated: count }
}

// ── Optimal headcount calculation ─────────────────────────────────────────────

export interface HeadcountResult {
  total: number
  breakdown: { department: string; label: string; headcount: number; explanation: string }[]
  explanation: string
  calculatedAt: string
}

export async function calculateOptimalHeadcount(): Promise<{ data?: HeadcountResult; error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }

  // Fetch lab config + departments + active staff summary
  const [labConfigRes, deptRes, staffRes] = await Promise.all([
    supabase.from("lab_config").select("*").single() as unknown as Promise<{ data: Record<string, unknown> | null }>,
    supabase.from("departments").select("*").order("sort_order") as unknown as Promise<{ data: { code: string; name: string }[] | null }>,
    supabase.from("staff").select("id, role, days_per_week").neq("onboarding_status", "inactive") as unknown as Promise<{ data: { id: string; role: string; days_per_week: number }[] | null }>,
  ])

  if (!labConfigRes.data) return { error: "Lab config not found." }

  const lc = labConfigRes.data
  const departments = deptRes.data ?? []
  const staffList = staffRes.data ?? []

  // Build coverage context per department
  // When shift_coverage_enabled, sum across shifts per dept per day
  const shiftCoverageEnabled = lc.shift_coverage_enabled as boolean | undefined ?? false
  const shiftCoverageByDay = lc.shift_coverage_by_day as Record<string, Record<string, Record<string, number>>> | null
  const coverageByDay = lc.coverage_by_day as Record<string, Record<string, number>> | null

  // Get per-day per-dept total: sum across shifts when shift coverage is active
  function getDeptCoverageForDay(day: string, deptCode: string): number {
    if (shiftCoverageEnabled && shiftCoverageByDay) {
      let total = 0
      for (const shiftCode of Object.keys(shiftCoverageByDay)) {
        total += shiftCoverageByDay[shiftCode]?.[day]?.[deptCode] ?? 0
      }
      return total
    }
    if (coverageByDay) {
      return (coverageByDay[day] as Record<string, number> | undefined)?.[deptCode] ?? 0
    }
    // Fallback to legacy flat fields
    if (deptCode === "lab") {
      const isWe = day === "sat" || day === "sun"
      return isWe ? (lc.min_weekend_lab_coverage as number ?? 0) : (lc.min_lab_coverage as number ?? 0)
    }
    if (deptCode === "andrology") {
      const isWe = day === "sat" || day === "sun"
      return isWe ? (lc.min_weekend_andrology as number ?? 0) : (lc.min_andrology_coverage as number ?? 0)
    }
    return 0
  }

  const annualLeaveDays = lc.annual_leave_days as number ?? 20
  const defaultDaysPerWeek = lc.default_days_per_week as number ?? 5
  const effectiveDaysPerYear = (defaultDaysPerWeek * 52) - annualLeaveDays
  const weekdays = ["mon", "tue", "wed", "thu", "fri"]
  const weekendDays = ["sat", "sun"]
  const allDepts = [...departments.filter((d) => d.code !== "admin"), ...departments.filter((d) => d.code === "admin")]

  const deptResults: { code: string; name: string; headcount: number; explanation: string }[] = []
  let grandTotal = 0

  for (const dept of allDepts) {
    // Skip admin if not scheduled on weekends and no weekday coverage
    const weekdayCoverages = weekdays.map((d) => getDeptCoverageForDay(d, dept.code))
    const weekendCoverages = weekendDays.map((d) => getDeptCoverageForDay(d, dept.code))
    const maxWeekday = Math.max(0, ...weekdayCoverages)
    const maxWeekend = Math.max(0, ...weekendCoverages)

    if (maxWeekday === 0 && maxWeekend === 0) continue

    // Total person-days needed per year
    const weekdayPersonDays = weekdayCoverages.reduce((s, c) => s + c, 0) * 52.14
    const weekendPersonDays = weekendCoverages.reduce((s, c) => s + c, 0) * 52.14
    const totalPersonDays = weekdayPersonDays + weekendPersonDays

    const optimal = Math.ceil(totalPersonDays / effectiveDaysPerYear)
    grandTotal += optimal

    const weeklyTotal = weekdayCoverages.reduce((s, c) => s + c, 0) + weekendCoverages.reduce((s, c) => s + c, 0)
    deptResults.push({
      code: dept.code,
      name: dept.name,
      headcount: optimal,
      explanation: `${weeklyTotal} person-days/week needed (${weekdayCoverages.reduce((s, c) => s + c, 0)} weekday + ${weekendCoverages.reduce((s, c) => s + c, 0)} weekend). ${Math.round(totalPersonDays)} person-days/year ÷ ${Math.round(effectiveDaysPerYear)} effective days/person = ${optimal}.`,
    })
  }

  const headcountResult: HeadcountResult = {
    total: grandTotal,
    breakdown: deptResults.map((d) => ({
      department: d.code,
      label: d.name,
      headcount: d.headcount,
      explanation: d.explanation,
    })),
    explanation: `Minimum fully trained staff needed to meet ${shiftCoverageEnabled ? "per-shift" : "department-level"} coverage minimums year-round. Assumes all staff are certified. Each person provides (${defaultDaysPerWeek} days/week × 52) − ${annualLeaveDays} holiday days = ${Math.round(effectiveDaysPerYear)} effective days/year.`,
    calculatedAt: new Date().toISOString(),
  }

  return { data: headcountResult }
}
