import { COOKIE_MAX_AGE_ONE_YEAR } from "@/lib/constants"

export const PREFS_TS_COOKIE = "labrota_prefs_ts"
export const PREFS_TTL_COOKIE = "labrota_prefs_ttl"
export const THEME_COOKIE = "labrota_theme"
export const LOCALE_COOKIE = "locale"
export const PREFS_BROADCAST_CHANNEL = "labrota_prefs"

export const PREFS_COOKIE_OPTS = {
  path: "/",
  maxAge: COOKIE_MAX_AGE_ONE_YEAR,
  sameSite: "lax" as const,
}

// How long a device can trust its cached preference cookies before re-reading
// the DB in middleware. Short enough that a change on device A propagates to
// device B within a few minutes; long enough to skip the DB on nearly every
// request.
export const PREFS_TTL_MS = 5 * 60 * 1000
