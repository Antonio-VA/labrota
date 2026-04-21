import { NextResponse, type NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { syncAllForOrg } from "@/lib/outlook/sync"

// Cron endpoint: syncs all connected Outlook accounts for all orgs with outlook sync enabled.
// Secured by CRON_SECRET env var (Vercel Cron sets this automatically).
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const admin = createAdminClient()

  // Get all orgs with Outlook sync enabled
  const { data: configs } = await admin
    .from("lab_config")
    .select("organisation_id")
    .eq("enable_outlook_sync", true) as { data: Array<{ organisation_id: string }> | null }

  // allSettled so one failing org doesn't poison the cron for the rest.
  const settled = await Promise.allSettled(
    (configs ?? []).map(async (config) => {
      const { staffSynced, staffFailed, totalResult } = await syncAllForOrg(config.organisation_id)
      return {
        orgId: config.organisation_id,
        staffSynced,
        staffFailed,
        created: totalResult.created,
        updated: totalResult.updated,
        deleted: totalResult.deleted,
        errors: totalResult.errors,
      }
    })
  )

  const results = settled.map((s, i) => {
    if (s.status === "fulfilled") return s.value
    const msg = s.reason instanceof Error ? s.reason.message : String(s.reason)
    const orgId = configs?.[i]?.organisation_id ?? "unknown"
    console.error(`[outlook-sync] org ${orgId} sync threw:`, msg)
    return {
      orgId,
      staffSynced: 0,
      staffFailed: -1,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: [msg],
    }
  })

  const totalFailures = results.reduce(
    (acc, r) => acc + (r.staffFailed > 0 ? r.staffFailed : 0) + (r.errors.length > 0 ? 1 : 0),
    0,
  )

  return NextResponse.json({ synced: results, hasFailures: totalFailures > 0 })
}
