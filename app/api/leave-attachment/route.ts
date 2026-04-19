import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"

const SIGNED_URL_TTL_SECONDS = 60

/**
 * Proxy route for `leave-attachments` storage downloads.
 *
 * The bucket has no authenticated-role RLS, so the only paths to its
 * contents are the service-role admin client. This route re-checks that
 * the caller belongs to the same org as the leave whose attachment is
 * being requested, then mints a short-lived signed URL and redirects.
 *
 * The underlying leave row is fetched via the user-scoped Supabase
 * client so the project's `auth_organisation_id()` RLS policy filters
 * out cross-org reads before we ever see the stored path.
 */
export async function GET(req: NextRequest) {
  const leaveId = req.nextUrl.searchParams.get("id")
  if (!leaveId) return new NextResponse("Missing id.", { status: 400 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse("Not authenticated.", { status: 401 })

  const orgId = await getOrgId()
  if (!orgId) return new NextResponse("No organisation.", { status: 403 })

  const { data: leave } = await supabase
    .from("leaves")
    .select("attachment_url, organisation_id")
    .eq("id", leaveId)
    .eq("organisation_id", orgId)
    .maybeSingle() as { data: { attachment_url: string | null; organisation_id: string } | null }

  if (!leave || !leave.attachment_url) {
    return new NextResponse("Not found.", { status: 404 })
  }

  // Defence-in-depth: the path must live under this org's folder prefix.
  // The upload action writes `${orgId}/${userId}/${ts}.${ext}`; anything
  // else is either legacy data that escaped the org scope or tampered
  // input, so we refuse rather than sign it.
  const path = leave.attachment_url
  if (!path.startsWith(`${orgId}/`)) {
    return new NextResponse("Not found.", { status: 404 })
  }

  const admin = createAdminClient()
  const { data: signed, error } = await admin.storage
    .from("leave-attachments")
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS)

  if (error || !signed) {
    return new NextResponse("Unavailable.", { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}
