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

  const { pathname } = request.nextUrl
  const isSuperAdmin = user?.app_metadata?.role === "super_admin"

  // Allow through unconditionally
  if (
    pathname.startsWith("/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/brand")
  ) {
    return supabaseResponse
  }

  // ── /admin/* routes ─────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // Not logged in → /login
    if (!user) {
      return NextResponse.redirect(new URL("/login", request.url))
    }
    // Logged in but not super admin → back to clinic app
    if (!isSuperAdmin) {
      return NextResponse.redirect(new URL("/", request.url))
    }
    return supabaseResponse
  }

  // ── /login ───────────────────────────────────────────────────────────────
  if (pathname === "/login") {
    if (user) {
      // Super admin lands on /login → go to admin portal
      if (isSuperAdmin) return NextResponse.redirect(new URL("/admin", request.url))
      // Regular user → clinic app
      return NextResponse.redirect(new URL("/", request.url))
    }
    return supabaseResponse
  }

  // ── Clinic app routes ─────────────────────────────────────────────────────
  if (!user) {
    return NextResponse.redirect(new URL("/login", request.url))
  }
  // Super admin accidentally on clinic app → admin portal
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
