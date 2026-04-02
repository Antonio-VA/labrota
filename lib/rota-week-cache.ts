import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

/** Invalidate a single week for one org (e.g. after generating / editing). */
export const rotaWeekTag  = (orgId: string, weekStart: string) => `rota-week-${orgId}-${weekStart}`
/** Invalidate ALL cached weeks for an org (e.g. after adding a leave). */
export const rotaWeeksTag = (orgId: string) => `rota-weeks-${orgId}`

export interface RotaWeekLive {
  rota: {
    id: string
    status: string
    published_at: string | null
    published_by: string | null
    punctions_override: Record<string, number> | null
    engine_warnings: string[] | null
  } | null
  assignments: {
    id: string
    staff_id: string
    date: string
    shift_type: string
    is_manual_override: boolean
    trainee_staff_id: string | null
    notes: string | null
    function_label: string | null
    tecnica_id: string | null
    whole_team: boolean
  }[]
  leaves: {
    staff_id: string
    start_date: string
    end_date: string
    type: string
  }[]
}

/**
 * Returns the live (mutable) week data — rota record, assignments, and leaves —
 * cached per org + weekStart in the Next.js data cache.
 *
 * Tagged with both `rota-week-{orgId}-{weekStart}` (for targeted invalidation)
 * and `rota-weeks-{orgId}` (for broad invalidation, e.g. after a leave change).
 * 60-second TTL as a safety net if an invalidation is missed.
 */
export function getCachedRotaWeekLive(orgId: string, weekStart: string): Promise<RotaWeekLive> {
  const endDate = (() => {
    const d = new Date(weekStart + "T12:00:00")
    d.setDate(d.getDate() + 6)
    return d.toISOString().split("T")[0]
  })()

  return unstable_cache(
    async (): Promise<RotaWeekLive> => {
      const admin = createAdminClient()

      const [rotaRes, leavesRes] = await Promise.all([
        admin.from("rotas")
          .select("id, status, published_at, published_by, punctions_override, engine_warnings")
          .eq("organisation_id", orgId)
          .eq("week_start", weekStart)
          .maybeSingle(),
        admin.from("leaves")
          .select("staff_id, start_date, end_date, type")
          .eq("organisation_id", orgId)
          .lte("start_date", endDate)
          .gte("end_date", weekStart)
          .eq("status", "approved"),
      ])

      const rota = rotaRes.data as RotaWeekLive["rota"]
      const leaves = (leavesRes.data ?? []) as RotaWeekLive["leaves"]

      let assignments: RotaWeekLive["assignments"] = []
      if (rota?.id) {
        const aRes = await admin.from("rota_assignments")
          .select("id, staff_id, date, shift_type, is_manual_override, trainee_staff_id, notes, function_label, tecnica_id, whole_team")
          .eq("rota_id", rota.id)
        assignments = (aRes.data ?? []) as RotaWeekLive["assignments"]
      }

      return { rota, assignments, leaves }
    },
    [orgId, weekStart],
    { tags: [rotaWeekTag(orgId, weekStart), rotaWeeksTag(orgId)], revalidate: 60 },
  )()
}
