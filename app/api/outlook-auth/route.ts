import { NextResponse, type NextRequest } from "next/server"
import { createHmac } from "crypto"
import { MICROSOFT_AUTH_URL, SCOPES, getClientConfig } from "@/lib/outlook/config"
import { authorizeOutlookConnection } from "@/lib/outlook/authorize"
import { getOutlookStateSecret } from "@/lib/env"

// Build a signed state parameter to prevent CSRF
function buildState(staffId: string, orgId: string): string {
  const payload = `${staffId}:${orgId}:${Date.now()}`
  const sig = createHmac("sha256", getOutlookStateSecret()).update(payload).digest("hex")
  return Buffer.from(`${payload}:${sig}`).toString("base64url")
}

export async function GET(req: NextRequest) {
  const staffId = req.nextUrl.searchParams.get("staffId")
  const orgId = req.nextUrl.searchParams.get("orgId")

  if (!staffId || !orgId) {
    return NextResponse.json({ error: "staffId and orgId required" }, { status: 400 })
  }

  const authError = await authorizeOutlookConnection(staffId, orgId)
  if (authError) {
    const status = authError === "unauthenticated" ? 401 : 403
    return NextResponse.json({ error: authError }, { status })
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
