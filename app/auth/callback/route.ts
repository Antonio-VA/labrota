import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next = searchParams.get("next") ?? "/"

  const cookieStore = await cookies()
  const response = NextResponse.redirect(`${origin}${next}`)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Magic link flow: token_hash + type
  const token_hash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) {
      // Recovery links → go to the reset-password page
      if (type === "recovery") {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      return response
    }
  }

  // PKCE / OAuth flow: code
  const code = searchParams.get("code")

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // In PKCE flow, Supabase appends type=recovery for password-reset links.
      // Also honour the ?next=/reset-password param from the redirectTo URL.
      const pkceType = searchParams.get("type")
      if (pkceType === "recovery" || next === "/reset-password") {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      return response
    }
    console.error("[auth/callback] exchangeCodeForSession failed")
  }

  // Something went wrong — send back to login with an error hint
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
