import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
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

  const { pathname, searchParams } = request.nextUrl
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

  // PKCE flow: if a `code` param lands on any non-callback route, redirect to /auth/callback
  // Skip for Outlook OAuth callback which also uses ?code=
  if (searchParams.get("code") && !pathname.startsWith("/auth/callback") && !pathname.startsWith("/api/outlook-")) {
    const callbackUrl = new URL("/auth/callback", request.url)
    callbackUrl.search = request.nextUrl.search
    return NextResponse.redirect(callbackUrl)
  }
  const hostname = (request.headers.get("host") ?? "").toLowerCase()
  const isAdminSubdomain =
    hostname === "admin.labrota.app" ||
    hostname.startsWith("admin.localhost")

  // ── admin.labrota.app subdomain ──────────────────────────────────────────
  if (isAdminSubdomain) {
    // Pass through special paths unchanged
    if (
      pathname.startsWith("/auth") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/brand") ||
      pathname === "/login"
    ) {
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

  // Allow through unconditionally (public routes)
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/outlook-") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/brand") ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/gdpr" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/set-password" ||
    pathname === "/demo"
  ) {
    return supabaseResponse
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

  // ── /login & /demo ───────────────────────────────────────────────────────
  if (pathname === "/login" || pathname === "/demo") {
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
    "/((?!_next/static|_next/image|favicon\\.svg|brand/).*)",
  ],
}
