import { NextResponse, type NextRequest } from "next/server"
import { createHmac, timingSafeEqual } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { exchangeCodeForTokens, getMicrosoftProfile } from "@/lib/outlook/graph-client"
import { encrypt } from "@/lib/outlook/encryption"
import { authorizeOutlookConnection } from "@/lib/outlook/authorize"
import { getOutlookStateSecret } from "@/lib/env"
import { redactForLog } from "@/lib/redact"

// Verify and parse the signed state parameter
function parseState(state: string): { staffId: string; orgId: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8")
    // Format: staffId:orgId:timestamp:sig (sig is full hex HMAC, no UUIDs contain ":")
    const lastColon = decoded.lastIndexOf(":")
    if (lastColon === -1) return null
    const sig = decoded.slice(lastColon + 1)
    const payload = decoded.slice(0, lastColon)
    const payloadParts = payload.split(":")
    if (payloadParts.length !== 3) return null
    const [staffId, orgId, timestamp] = payloadParts

    // Verify signature using timing-safe comparison
    const expectedSig = createHmac("sha256", getOutlookStateSecret()).update(payload).digest("hex")
    const expectedBuf = Buffer.from(expectedSig, "hex")
    const sigBuf = Buffer.from(sig, "hex")
    if (expectedBuf.length !== sigBuf.length || !timingSafeEqual(expectedBuf, sigBuf)) return null

    // Verify timestamp (max 10 minutes)
    if (Date.now() - parseInt(timestamp) > 10 * 60 * 1000) return null

    return { staffId, orgId }
  } catch {
    return null
  }
}

function errorRedirect(req: NextRequest, reason: string) {
  const url = new URL("/leaves", req.url)
  url.searchParams.set("outlook", "error")
  url.searchParams.set("reason", reason)
  return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  const state = req.nextUrl.searchParams.get("state")
  const error = req.nextUrl.searchParams.get("error")
  const errorDesc = req.nextUrl.searchParams.get("error_description")

  // User declined consent
  if (error) {
    console.error("[outlook-callback] OAuth error:", error, redactForLog(errorDesc))
    return errorRedirect(req, `consent_${error}`)
  }

  if (!code || !state) {
    return errorRedirect(req, "missing_code")
  }

  const parsed = parseState(state)
  if (!parsed) {
    return errorRedirect(req, "invalid_state")
  }

  const { staffId, orgId } = parsed

  // Re-verify session ownership: the signed state proves the request came
  // from our /api/outlook-auth flow, but does not prove that the user who
  // completed Microsoft OAuth is the same user the tokens belong to. Without
  // this check, an attacker who gets any signed state could write their own
  // Microsoft tokens against another staff record.
  const authError = await authorizeOutlookConnection(staffId, orgId)
  if (authError) {
    return errorRedirect(req, authError)
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    // Get Microsoft user profile
    const profile = await getMicrosoftProfile(tokens.access_token)

    const admin = createAdminClient()
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Upsert the connection (replace if already connected)
    const { error: dbError } = await admin
      .from("outlook_connections")
      .upsert({
        organisation_id: orgId,
        staff_id: staffId,
        microsoft_user_id: profile.id,
        email: profile.mail,
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        token_expires_at: expiresAt,
        sync_enabled: true,
      }, { onConflict: "staff_id" })

    if (dbError) {
      console.error("[outlook-callback] DB error:", dbError)
      return errorRedirect(req, `db_${dbError.code}`)
    }

    return NextResponse.redirect(new URL("/leaves?outlook=connected", req.url))
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    console.error("[outlook-callback] Error:", redactForLog(msg))
    return errorRedirect(req, encodeURIComponent(msg.slice(0, 100)))
  }
}
