import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const next       = searchParams.get("next") ?? "/"
  const token_hash = searchParams.get("token_hash")
  const type       = searchParams.get("type") as EmailOtpType | null
  const code       = searchParams.get("code")

  // Resolve final destination BEFORE creating the response so that session
  // cookies set by verifyOtp / exchangeCodeForSession land on the right object.
  let destination = next
  if (type === "invite")                                destination = "/"
  if (type === "recovery" || next === "/reset-password") destination = "/reset-password"

  const cookieStore = await cookies()
  const response = NextResponse.redirect(`${origin}${destination}`)

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

  // OTP flow: token_hash + type
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type })
    if (!error) return response
    // Pass the specific error code so the login page can show a helpful message
    const errorParam = error.code === "otp_expired" ? "otp_expired" : "auth_callback_failed"
    return NextResponse.redirect(`${origin}/login?error=${errorParam}`)
  }

  // PKCE / OAuth flow: code
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return response
    console.error("[auth/callback] exchangeCodeForSession failed")
  }

  // Something went wrong — send back to login with an error hint
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
