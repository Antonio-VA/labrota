import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import {
  PREFS_TS_COOKIE, PREFS_TTL_COOKIE, THEME_COOKIE, LOCALE_COOKIE,
  PREFS_COOKIE_OPTS, PREFS_TTL_MS,
} from "@/lib/preferences-cookies"

const PUBLIC_PATHS = new Set([
  "/privacy",
  "/terms",
  "/gdpr",
  "/forgot-password",
  "/reset-password",
  "/set-password",
  "/demo",
])

function isPublicPath(pathname: string): boolean {
  return (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/outlook-") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/brand") ||
    PUBLIC_PATHS.has(pathname)
  )
}

export async function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl

  // PKCE flow: if a `code` param lands on any non-callback route, redirect to /auth/callback.
  // Handled before any auth work so we don't pay a round-trip for a redirect.
  if (searchParams.get("code") && !pathname.startsWith("/auth/callback") && !pathname.startsWith("/api/outlook-")) {
    const callbackUrl = new URL("/auth/callback", request.url)
    callbackUrl.search = request.nextUrl.search
    return NextResponse.redirect(callbackUrl)
  }

  // Short-circuit truly public paths so we skip the Supabase round-trip entirely.
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session — must call getUser() not getSession()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isSuperAdmin = user?.app_metadata?.role === "super_admin"

  // ── Sync user preferences from DB → cookies ──────────────────────────────
  // Timestamp-based, TTL-gated. A short-lived `labrota_prefs_ttl` cookie lets
  // us skip the DB on nearly every request. When the TTL expires, we compare
  // `preferences_updated_at` (DB) against `labrota_prefs_ts` (cookie) and
  // refresh cookies only if different. Changes made on one device propagate
  // to others within PREFS_TTL_MS.
  if (user && !isSuperAdmin) {
    const ttlRaw = request.cookies.get(PREFS_TTL_COOKIE)?.value
    const ttlExpiresAt = ttlRaw ? parseInt(ttlRaw, 10) : 0
    const ttlFresh = ttlExpiresAt > Date.now()

    if (!ttlFresh) {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("preferences, preferences_updated_at")
          .eq("id", user.id)
          .single<{ preferences: Record<string, unknown> | null; preferences_updated_at: string }>()

        const dbTs = data?.preferences_updated_at
        const cookieTs = request.cookies.get(PREFS_TS_COOKIE)?.value

        if (dbTs && dbTs !== cookieTs) {
          const prefs = data?.preferences ?? {}
          const dbLocale = prefs.locale as string | undefined
          const currentLocale = request.cookies.get(LOCALE_COOKIE)?.value

          if (dbLocale && dbLocale !== "browser") {
            if (currentLocale !== dbLocale) supabaseResponse.cookies.set(LOCALE_COOKIE, dbLocale, PREFS_COOKIE_OPTS)
          } else if (dbLocale === "browser" && currentLocale) {
            supabaseResponse.cookies.delete(LOCALE_COOKIE)
          }

          const dbTheme = prefs.theme as string | undefined
          const dbAccent = prefs.accentColor as string | undefined
          const dbFontScale = prefs.fontScale as string | undefined
          const currentTheme = request.cookies.get(THEME_COOKIE)?.value

          if (dbTheme || dbAccent || dbFontScale) {
            const themeObj: Record<string, string> = {}
            if (dbTheme) themeObj.theme = dbTheme
            if (dbAccent) themeObj.accentColor = dbAccent
            if (dbFontScale) themeObj.fontScale = dbFontScale
            const themeJson = JSON.stringify(themeObj)
            if (currentTheme !== themeJson) supabaseResponse.cookies.set(THEME_COOKIE, themeJson, PREFS_COOKIE_OPTS)
          } else if (currentTheme) {
            supabaseResponse.cookies.delete(THEME_COOKIE)
          }

          supabaseResponse.cookies.set(PREFS_TS_COOKIE, dbTs, PREFS_COOKIE_OPTS)
        }

        supabaseResponse.cookies.set(PREFS_TTL_COOKIE, String(Date.now() + PREFS_TTL_MS), PREFS_COOKIE_OPTS)
      } catch { /* non-critical — cookies retain previous values */ }
    }
  }

  const hostname = (request.headers.get("host") ?? "").toLowerCase()
  const isAdminSubdomain =
    hostname === "admin.labrota.app" ||
    hostname.startsWith("admin.localhost")

  // ── admin.labrota.app subdomain ──────────────────────────────────────────
  if (isAdminSubdomain) {
    // /login is the only unauthenticated admin path — the rest of the
    // public paths were already short-circuited above.
    if (pathname === "/login") {
      return supabaseResponse
    }

    // Auth gate
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    if (!isSuperAdmin) {
      return NextResponse.redirect(new URL("/login", request.url))
    }

    // Rewrite: / → /admin, /orgs/new → /admin/orgs/new, etc.
    // Don't double-prefix if the path already starts with /admin
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = pathname.startsWith("/admin")
      ? pathname
      : "/admin" + (pathname === "/" ? "" : pathname)
    const rewriteResponse = NextResponse.rewrite(rewriteUrl)
    // Forward session cookies set during getUser() refresh
    supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
      rewriteResponse.cookies.set(name, value)
    })
    return rewriteResponse
  }

  // ── Marketing home (always public) ──────────────────────────────────────────
  if (pathname === "/") {
    // Authenticated clinic users → send straight to the app
    if (user && !isSuperAdmin) {
      return NextResponse.redirect(new URL("/schedule", request.url))
    }
    // Super admins → admin portal
    if (user && isSuperAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url))
    }
    // Unauthenticated → show landing page
    return supabaseResponse
  }

  // ── /admin/* routes (direct access, e.g. localhost dev) ─────────────────
  if (pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    if (!isSuperAdmin) {
      return NextResponse.redirect(new URL("/schedule", request.url))
    }
    return supabaseResponse
  }

  // ── /login ───────────────────────────────────────────────────────────────
  // /demo was short-circuited earlier, so only /login reaches this point.
  if (pathname === "/login") {
    if (user) {
      if (isSuperAdmin) return NextResponse.redirect(new URL("/admin", request.url))
      return NextResponse.redirect(new URL("/schedule", request.url))
    }
    return supabaseResponse
  }

  // ── Clinic app routes ─────────────────────────────────────────────────────
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  if (isSuperAdmin) {
    return NextResponse.redirect(new URL("/admin", request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip static Next.js assets, favicon, /brand/*, and root-level files
    // with a common static extension (svg/json/ico/html/mjs/png/jpg/webp/woff/woff2).
    "/((?!_next/static|_next/image|favicon\\.svg|brand/|[^/]+\\.(?:svg|json|ico|html|mjs|png|jpe?g|gif|webp|avif|xml|txt|woff2?)$).*)",
  ],
}
