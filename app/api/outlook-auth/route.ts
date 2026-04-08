import { NextResponse, type NextRequest } from "next/server"
import { createHmac } from "crypto"
import { MICROSOFT_AUTH_URL, SCOPES, getClientConfig } from "@/lib/outlook/config"

// Build a signed state parameter to prevent CSRF
function buildState(staffId: string, orgId: string): string {
  const payload = `${staffId}:${orgId}:${Date.now()}`
  const secret = process.env.SUPABASE_SECRET_KEY!
  const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16)
  return Buffer.from(`${payload}:${sig}`).toString("base64url")
}

export async function GET(req: NextRequest) {
  const staffId = req.nextUrl.searchParams.get("staffId")
  const orgId = req.nextUrl.searchParams.get("orgId")

  if (!staffId || !orgId) {
    return NextResponse.json({ error: "staffId and orgId required" }, { status: 400 })
  }

  const { clientId, redirectUri } = getClientConfig()
  const state = buildState(staffId, orgId)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SCOPES.join(" "),
    state,
    response_mode: "query",
    prompt: "consent",
  })

  return NextResponse.redirect(`${MICROSOFT_AUTH_URL}?${params.toString()}`)
}
