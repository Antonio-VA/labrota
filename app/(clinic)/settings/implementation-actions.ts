"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { revalidatePath } from "next/cache"

export interface StepCompletion {
  step_key: string
  completed_at: string
  completed_by_name: string | null
}

const STEP_KEYS = [
  "create_org",
  "configure_region",
  "add_departments",
  "add_shifts",
  "add_tasks",
  "add_staff",
  "generate_rota",
]

/**
 * Get all recorded step completions for the current org.
 * Returns a map: step_key → { completed_at, completed_by_name }
 */
export async function getStepCompletions(): Promise<Record<string, StepCompletion>> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return {}

  const { data: steps } = await supabase
    .from("implementation_steps")
    .select("step_key, completed_at, completed_by")
    .eq("organisation_id", orgId) as unknown as { data: { step_key: string; completed_at: string; completed_by: string | null }[] | null }

  if (!steps?.length) return {}

  // Resolve user names
  const userIds = [...new Set(steps.map((s) => s.completed_by).filter(Boolean))] as string[]
  const nameMap: Record<string, string> = {}
  if (userIds.length > 0) {
    const admin = createAdminClient()
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds) as unknown as { data: { id: string; full_name: string | null; email: string }[] | null }
    for (const p of profiles ?? []) {
      nameMap[p.id] = p.full_name || p.email
    }
  }

  const result: Record<string, StepCompletion> = {}
  for (const s of steps) {
    result[s.step_key] = {
      step_key: s.step_key,
      completed_at: s.completed_at,
      completed_by_name: s.completed_by ? (nameMap[s.completed_by] ?? null) : null,
    }
  }
  return result
}

/**
 * Check current state and record any newly completed steps.
 * Only records first completion — won't overwrite existing timestamps.
 */
export async function syncStepCompletions(): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return

  const { data: { user } } = await supabase.auth.getUser()
  const userId = user?.id ?? null

  // Fetch current counts
  const [deptRes, shiftRes, tecRes, staffRes, rotaRes, configRes] = await Promise.all([
    supabase.from("departments").select("id", { count: "exact", head: true }),
    supabase.from("shift_types").select("id", { count: "exact", head: true }),
    supabase.from("tecnicas").select("id", { count: "exact", head: true }),
    supabase.from("staff").select("id", { count: "exact", head: true }).neq("onboarding_status", "inactive"),
    supabase.from("rotas").select("id", { count: "exact", head: true }),
    supabase.from("lab_config").select("country").maybeSingle() as unknown as Promise<{ data: { country?: string } | null }>,
  ])

  const currentState: Record<string, boolean> = {
    create_org: true,
    configure_region: !!(configRes.data as any)?.country,
    add_departments: (deptRes.count ?? 0) > 0,
    add_shifts: (shiftRes.count ?? 0) > 0,
    add_tasks: (tecRes.count ?? 0) > 0,
    add_staff: (staffRes.count ?? 0) > 0,
    generate_rota: (rotaRes.count ?? 0) > 0,
  }

  // Get existing completions
  const { data: existing } = await supabase
    .from("implementation_steps")
    .select("step_key")
    .eq("organisation_id", orgId) as unknown as { data: { step_key: string }[] | null }

  const existingKeys = new Set((existing ?? []).map((s) => s.step_key))

  // Insert newly completed steps
  for (const key of STEP_KEYS) {
    if (currentState[key] && !existingKeys.has(key)) {
      await supabase.from("implementation_steps").insert({
        organisation_id: orgId,
        step_key: key,
        completed_by: userId,
      } as never)
    }
  }
}

/**
 * Clear all step completions (used on re-iniciar).
 */
export async function clearStepCompletions(): Promise<void> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return
  await supabase.from("implementation_steps").delete().eq("organisation_id", orgId)
  revalidatePath("/settings")
}
