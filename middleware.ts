import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

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

  // ── Sync user preferences from DB → cookies on new device/browser ────────
  // Only runs once per browser (marker cookie prevents repeated DB lookups).
  // Covers: locale, theme, accentColor, fontScale.
  if (user && !isSuperAdmin && !request.cookies.has("labrota_prefs_synced")) {
    try {
      const { data } = await supabase
        .from("profiles")
        .select("preferences")
        .eq("id", user.id)
        .single() as { data: { preferences?: Record<string, unknown> } | null }
      const prefs = data?.preferences as Record<string, unknown> | undefined
      if (prefs) {
        const maxAge = 365 * 24 * 60 * 60
        const cookieOpts = { path: "/", maxAge, sameSite: "lax" as const }

        // Locale: only set if user explicitly chose one (not "browser")
        const dbLocale = prefs.locale as string | undefined
        if (dbLocale && dbLocale !== "browser" && !request.cookies.has("locale")) {
          supabaseResponse.cookies.set("locale", dbLocale, cookieOpts)
        }

        // Theme bundle: theme + accentColor + fontScale
        const dbTheme = prefs.theme as string | undefined
        const dbAccent = prefs.accentColor as string | undefined
        const dbFontScale = prefs.fontScale as string | undefined
        if ((dbTheme || dbAccent || dbFontScale) && !request.cookies.has("labrota_theme")) {
          const themeObj: Record<string, string> = {}
          if (dbTheme) themeObj.theme = dbTheme
          if (dbAccent) themeObj.accentColor = dbAccent
          if (dbFontScale) themeObj.fontScale = dbFontScale
          supabaseResponse.cookies.set("labrota_theme", JSON.stringify(themeObj), cookieOpts)
        }
      }
    } catch { /* non-critical — preferences will use defaults */ }
    // Marker cookie so we don't query DB on every request
    supabaseResponse.cookies.set("labrota_prefs_synced", "1", { path: "/", maxAge: 365 * 24 * 60 * 60, sameSite: "lax" })
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
