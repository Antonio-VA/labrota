"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { EmailOtpType } from "@supabase/supabase-js"

/**
 * Client-side auth callback page.
 *
 * Email-client link-protection bots (iCloud, Outlook, etc.) prefetch URLs
 * but do NOT execute JavaScript. By exchanging the auth code on the client
 * instead of a server route handler, we prevent bots from consuming the
 * one-time code before the real user clicks.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState(false)

  useEffect(() => {
    async function handleCallback() {
      const tokenHash = searchParams.get("token_hash")
      const type = searchParams.get("type") as EmailOtpType | null
      const code = searchParams.get("code")
      const next = searchParams.get("next") ?? "/"

      const supabase = createClient()

      // Determine destination
      let destination = next
      if (type === "invite") destination = "/"
      if (type === "recovery" || next === "/reset-password") destination = "/reset-password"

      // OTP flow: token_hash + type
      if (tokenHash && type) {
        const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
        if (!verifyError) {
          router.replace(destination)
          return
        }
        const errorParam = verifyError.code === "otp_expired" ? "otp_expired" : "auth_callback_failed"
        router.replace(`/login?error=${errorParam}`)
        return
      }

      // PKCE flow: code
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!exchangeError) {
          router.replace(destination)
          return
        }
      }

      // Fallback — show error
      setError(true)
      setTimeout(() => router.replace("/login?error=auth_callback_failed"), 2000)
    }

    handleCallback()
  }, [searchParams, router])

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        {error ? (
          <p className="text-[14px] text-destructive">Authentication failed. Redirecting...</p>
        ) : (
          <p className="text-[14px] text-muted-foreground">Signing in...</p>
        )}
      </div>
    </div>
  )
}
