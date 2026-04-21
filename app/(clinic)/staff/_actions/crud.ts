"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuditEvent } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { getLeaveYear } from "@/lib/hr-balance-engine"
import type { StaffRole, OnboardingStatus, ContractType, SkillLevel, ShiftType } from "@/lib/types/database"
import { STAFF_PASTEL_COLORS, ALL_DAYS } from "@/lib/constants"
import { APP_URL } from "@/lib/config"
import { sendEmail } from "@/lib/email"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function inviteStaffAsViewer(staffId: string, email: string, fullName: string, orgId: string) {
  const admin = createAdminClient()

  const { data: orgData } = await admin
    .from("organisations")
    .select("auth_method")
    .eq("id", orgId)
    .single() as { data: { auth_method: string } | null }
  const redirectTo = orgData?.auth_method === "password"
    ? `${APP_URL}/auth/callback?next=/set-password`
    : `${APP_URL}/auth/callback`

  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle() as { data: { id: string } | null }

  let userId: string
  if (existingProfile) {
    userId = existingProfile.id
  } else {
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    })
    if (inviteError) { console.error("Invite failed:", inviteError.message); return }
    userId = invited.user.id
  }

  await admin.from("organisation_members").upsert(
    { organisation_id: orgId, user_id: userId, role: "viewer", display_name: fullName, linked_staff_id: staffId },
    { onConflict: "organisation_id,user_id" }
  )

  const { data: profile } = await admin.from("profiles").select("organisation_id").eq("id", userId).single() as { data: { organisation_id: string | null } | null }
  if (!profile?.organisation_id) {
    await admin.from("profiles").update({ organisation_id: orgId, full_name: fullName }).eq("id", userId)
  }
}

function parseSkillsFromForm(formData: FormData): { skill: string; level: SkillLevel }[] {
  const skills: { skill: string; level: SkillLevel }[] = []
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("skill_") && (value === "certified" || value === "training")) {
      skills.push({ skill: key.slice(6), level: value as SkillLevel })
    }
  }
  return skills
}

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
      contracted_hours:  37,
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
    .insert({ ...staff, organisation_id: orgId, onboarding_end_date: onboardingEndDate })
    .select("id")
    .single()

  if (error || !newStaff) return { error: error?.message ?? "Failed to create staff member." }

  const newStaffId = (newStaff as { id: string }).id

  if (skills.length > 0) {
    const { error: skillsError } = await supabase.from("staff_skills").insert(
      skills.map(({ skill, level }) => ({ organisation_id: orgId, staff_id: newStaffId, skill, level }))
    )
    if (skillsError) return { error: skillsError.message }
  }

  const inviteViewer = formData.get("invite_viewer") === "on"
  const { data: { user: auUser } } = await supabase.auth.getUser()
  after(async () => {
    logAuditEvent({
      orgId, userId: auUser?.id, userEmail: auUser?.email,
      action: "staff_created", entityType: "staff", entityId: newStaffId,
      metadata: { firstName: staff.first_name, lastName: staff.last_name, role: staff.role },
    })

    if (inviteViewer && staff.email) {
      try {
        await inviteStaffAsViewer(newStaffId, staff.email, `${staff.first_name} ${staff.last_name}`.trim(), orgId)
      } catch (e) {
        console.error("[staff] Viewer invite error:", e)
      }
    }

    const adminClient = createAdminClient()

    try {
      const { data: hrMod } = await adminClient
        .from("hr_module")
        .select("status")
        .eq("organisation_id", orgId)
        .maybeSingle() as { data: { status: string } | null }

      if (hrMod?.status === "active") {
        const [configRes, typesRes] = await Promise.all([
          adminClient.from("holiday_config").select("leave_year_start_month, leave_year_start_day").eq("organisation_id", orgId).maybeSingle() as unknown as Promise<{ data: { leave_year_start_month: number; leave_year_start_day: number } | null }>,
          adminClient.from("company_leave_types").select("id, default_days").eq("organisation_id", orgId).eq("has_balance", true).eq("is_archived", false) as unknown as Promise<{ data: Array<{ id: string; default_days: number | null }> | null }>,
        ])
        const config = configRes.data
        const leaveTypes = typesRes.data
        if (config && leaveTypes?.length) {
          const today = new Date().toISOString().slice(0, 10)
          const currentYear = getLeaveYear(today, config.leave_year_start_month, config.leave_year_start_day)
          const inserts = leaveTypes.map((lt) => ({
            organisation_id: orgId,
            staff_id: newStaffId,
            leave_type_id: lt.id,
            year: currentYear,
            entitlement: lt.default_days ?? 0,
            carried_forward: 0,
            cf_expiry_date: null as string | null,
            manual_adjustment: 0,
            manual_adjustment_notes: null as string | null,
          }))
          await adminClient.from("holiday_balance").insert(inserts)
        }
      }
    } catch (e) {
      console.error("[staff] HR balance creation error:", e)
    }

    try {
      const [orgRowRes, activeCountRes] = await Promise.all([
        adminClient.from("organisations").select("name, max_staff").eq("id", orgId).single() as unknown as Promise<{ data: { name: string; max_staff: number } | null }>,
        adminClient.from("staff").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("onboarding_status", "active") as unknown as Promise<{ count: number | null }>,
      ])
      const orgRow = orgRowRes.data
      const maxStaff = orgRow?.max_staff ?? 50
      const orgName = orgRow?.name ?? "Unknown Organisation"
      const activeCount = activeCountRes.count
      if ((activeCount ?? 0) > maxStaff) {
        await sendEmail({
          to: "info@labrota.app",
          subject: `[LabRota] Staff limit exceeded — ${orgName}`,
          text: `${orgName} has exceeded their contracted staff limit.\n\nContracted limit: ${maxStaff}\nCurrent active staff: ${activeCount}\n\nPlease contact them to discuss upgrading their subscription.`,
        })
      }
    } catch (e) {
      console.error("[staff] Limit notification error:", e)
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
  const onboardingEndDate = ((formData.get("onboarding_end_date") as string) || "").trim() || null

  if (staff.email && !EMAIL_RE.test(staff.email)) return { error: "Invalid email format." }
  if (staff.end_date && staff.start_date && staff.end_date < staff.start_date) return { error: "End date must be after start date." }

  const { error: updateError } = await supabase
    .from("staff")
    .update({ ...staff, onboarding_end_date: onboardingEndDate })
    .eq("id", id)
    .eq("organisation_id", orgId)

  if (updateError) return { error: updateError.message }

  const { error: delError } = await supabase.from("staff_skills").delete().eq("staff_id", id).eq("organisation_id", orgId)
  if (delError) return { error: delError.message }
  if (skills.length > 0) {
    const { error: insError } = await supabase.from("staff_skills").insert(
      skills.map(({ skill, level }) => ({ organisation_id: orgId, staff_id: id, skill, level }))
    )
    if (insError) return { error: insError.message }
  }

  const inviteViewer = formData.get("invite_viewer") === "on"
  if (inviteViewer && staff.email) {
    after(async () => {
      try {
        await inviteStaffAsViewer(id, staff.email!, `${staff.first_name} ${staff.last_name}`.trim(), orgId)
      } catch (e) {
        console.error("[staff] Viewer invite error:", e)
      }
    })
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
