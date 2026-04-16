import { NextResponse, type NextRequest } from "next/server"
import { createHmac } from "crypto"
import { createAdminClient } from "@/lib/supabase/admin"
import { exchangeCodeForTokens, getMicrosoftProfile } from "@/lib/outlook/graph-client"
import { encrypt } from "@/lib/outlook/encryption"

// Verify and parse the signed state parameter
function parseState(state: string): { staffId: string; orgId: string } | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8")
    const parts = decoded.split(":")
    if (parts.length !== 4) return null
    const [staffId, orgId, timestamp, sig] = parts

    // Verify signature
    const payload = `${staffId}:${orgId}:${timestamp}`
    const secret = process.env.SUPABASE_SECRET_KEY!
    const expectedSig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16)
    if (sig !== expectedSig) return null

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
    console.error("[outlook-callback] OAuth error:", error, errorDesc)
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
    console.error("[outlook-callback] Error:", msg)
    return errorRedirect(req, encodeURIComponent(msg.slice(0, 100)))
  }
}
