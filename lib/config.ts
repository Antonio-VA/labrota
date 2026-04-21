// Resolve the public-facing base URL without hardcoding production hostnames.
// Preference order:
//   1. NEXT_PUBLIC_APP_URL  — explicit override for self-hosting / staging
//   2. VERCEL_URL           — auto-set on Vercel preview + prod deployments
//   3. http://localhost:3000 — dev fallback (never appropriate for prod)
function resolveAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, "")
  const vercel = process.env.VERCEL_URL
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`
  return "http://localhost:3000"
}

export const APP_URL = resolveAppUrl()
export const FROM_EMAIL = process.env.EMAIL_FROM ?? "LabRota <noreply@labrota.app>"
export const BRAND_COLOR = "#1B4F8A"
export const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days
