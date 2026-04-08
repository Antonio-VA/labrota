import { MICROSOFT_TOKEN_URL, GRAPH_BASE_URL, getClientConfig } from "./config"
import { encrypt, decrypt } from "./encryption"
import { createAdminClient } from "@/lib/supabase/admin"

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  id_token?: string
}

interface GraphCalendarEvent {
  id: string
  subject: string
  start: { dateTime: string; timeZone: string }
  end: { dateTime: string; timeZone: string }
  showAs: "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown"
  isAllDay: boolean
  isCancelled: boolean
}

export interface OOFEvent {
  eventId: string
  subject: string
  startDate: string  // YYYY-MM-DD
  endDate: string    // YYYY-MM-DD
}

// Exchange authorization code for tokens
export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = getClientConfig()
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  })
  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token exchange failed: ${err}`)
  }
  return res.json()
}

// Refresh an expired access token
export async function refreshAccessToken(encryptedRefreshToken: string): Promise<TokenResponse> {
  const { clientId, clientSecret } = getClientConfig()
  const refreshToken = decrypt(encryptedRefreshToken)
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  })
  const res = await fetch(MICROSOFT_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Token refresh failed: ${err}`)
  }
  return res.json()
}

// Get a valid access token for a staff member, refreshing if needed
export async function getValidAccessToken(staffId: string): Promise<string> {
  const admin = createAdminClient()
  const { data: conn } = await admin
    .from("outlook_connections")
    .select("*")
    .eq("staff_id", staffId)
    .single()

  if (!conn) throw new Error(`No Outlook connection for staff ${staffId}`)

  const expiresAt = new Date(conn.token_expires_at).getTime()
  const fiveMinutes = 5 * 60 * 1000

  // Token still valid
  if (Date.now() < expiresAt - fiveMinutes) {
    return decrypt(conn.access_token)
  }

  // Refresh the token
  try {
    const tokens = await refreshAccessToken(conn.refresh_token)
    const expiresAtNew = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    await admin
      .from("outlook_connections")
      .update({
        access_token: encrypt(tokens.access_token),
        refresh_token: encrypt(tokens.refresh_token),
        token_expires_at: expiresAtNew,
      } as never)
      .eq("staff_id", staffId)

    return tokens.access_token
  } catch {
    // Token revoked — disable sync
    await admin
      .from("outlook_connections")
      .update({ sync_enabled: false } as never)
      .eq("staff_id", staffId)
    throw new Error(`Outlook token revoked for staff ${staffId}. Sync disabled.`)
  }
}

// Get the Microsoft user profile (id + email)
export async function getMicrosoftProfile(accessToken: string): Promise<{ id: string; mail: string }> {
  const res = await fetch(`${GRAPH_BASE_URL}/me?$select=id,mail,userPrincipalName`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Graph /me failed: ${await res.text()}`)
  const data = await res.json()
  return { id: data.id, mail: data.mail || data.userPrincipalName }
}

// Fetch OOF events from Outlook calendar for a date range
export async function fetchOOFEvents(
  accessToken: string,
  startDate: string,
  endDate: string,
): Promise<OOFEvent[]> {
  const params = new URLSearchParams({
    startDateTime: `${startDate}T00:00:00Z`,
    endDateTime: `${endDate}T23:59:59Z`,
    $select: "id,subject,start,end,showAs,isAllDay,isCancelled",
    $top: "500",
  })

  const res = await fetch(
    `${GRAPH_BASE_URL}/me/calendarView?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Prefer: 'outlook.timezone="UTC", IdType="immutable"' } },
  )
  if (!res.ok) throw new Error(`Graph calendarView failed: ${await res.text()}`)

  const data = await res.json()
  const events = (data.value ?? []) as GraphCalendarEvent[]

  return events
    .filter((e) => !e.isCancelled && e.showAs === "oof")
    .map((e) => {
      // Parse dates — Graph returns ISO datetime strings
      const start = e.start.dateTime.split("T")[0]
      // For all-day events, end is exclusive (next day), so subtract 1 day
      let end = e.end.dateTime.split("T")[0]
      if (e.isAllDay && end > start) {
        const d = new Date(end)
        d.setDate(d.getDate() - 1)
        end = d.toISOString().split("T")[0]
      }
      return { eventId: e.id, subject: e.subject, startDate: start, endDate: end }
    })
}
