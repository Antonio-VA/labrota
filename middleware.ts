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

  // PKCE flow: if a `code` param lands on any non-callback route, redirect to /auth/callback
  if (searchParams.get("code") && !pathname.startsWith("/auth/callback")) {
    const callbackUrl = new URL("/auth/callback", request.url)
    callbackUrl.search = request.nextUrl.search
    return NextResponse.redirect(callbackUrl)
  }
  const hostname = request.headers.get("host") ?? ""
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

  // Allow through unconditionally
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/brand") ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/set-password" ||
    pathname === "/demo"
  ) {
    return supabaseResponse
  }

  // ── /admin/* routes (direct access, e.g. localhost dev) ─────────────────
  if (pathname.startsWith("/admin")) {
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    if (!isSuperAdmin) {
      return NextResponse.redirect(new URL("/", request.url))
    }
    return supabaseResponse
  }

  // ── /login & /demo ───────────────────────────────────────────────────────
  if (pathname === "/login" || pathname === "/demo") {
    if (user) {
      if (isSuperAdmin) return NextResponse.redirect(new URL("/admin", request.url))
      return NextResponse.redirect(new URL("/", request.url))
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
