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

  const results: Array<{ orgId: string; staffSynced: number; created: number; updated: number; deleted: number; errors: string[] }> = []

  for (const config of configs ?? []) {
    const { staffSynced, totalResult } = await syncAllForOrg(config.organisation_id)
    results.push({
      orgId: config.organisation_id,
      staffSynced,
      created: totalResult.created,
      updated: totalResult.updated,
      deleted: totalResult.deleted,
      errors: totalResult.errors,
    })
  }

  return NextResponse.json({ synced: results })
}
