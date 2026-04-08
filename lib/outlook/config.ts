export const MICROSOFT_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
export const MICROSOFT_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
export const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0"

export const SCOPES = ["openid", "offline_access", "User.Read", "Calendars.Read"]

export function getClientConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Microsoft OAuth env vars (MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET, MICROSOFT_REDIRECT_URI)")
  }
  return { clientId, clientSecret, redirectUri }
}
