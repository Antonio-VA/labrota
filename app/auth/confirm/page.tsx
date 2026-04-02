"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import type { EmailOtpType } from "@supabase/supabase-js"

/**
 * Client-side token verification page.
 *
 * Supabase email templates link here instead of the default
 * supabase.co/auth/v1/verify endpoint. Because this page requires
 * JavaScript to verify the token, email-client link-protection bots
 * (iCloud, Outlook, etc.) that prefetch URLs but don't execute JS
 * cannot consume the one-time token.
 */
export default function AuthConfirmPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [error, setError] = useState(false)

  useEffect(() => {
    async function verify() {
      const tokenHash = searchParams.get("token_hash")
      const type = searchParams.get("type") as EmailOtpType | null

      if (!tokenHash || !type) {
        setError(true)
        setTimeout(() => router.replace("/login?error=auth_callback_failed"), 2000)
        return
      }

      const supabase = createClient()
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      })

      if (verifyError) {
        const errorParam = verifyError.code === "otp_expired" ? "otp_expired" : "auth_callback_failed"
        router.replace(`/login?error=${errorParam}`)
        return
      }

      // Success — redirect based on type
      if (type === "recovery") {
        router.replace("/reset-password")
      } else {
        router.replace("/")
      }
    }

    verify()
  }, [searchParams, router])

  return (
    <div className="min-h-screen bg-muted flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        {error ? (
          <p className="text-[14px] text-destructive">Authentication failed. Redirecting...</p>
        ) : (
          <p className="text-[14px] text-muted-foreground">Verifying...</p>
        )}
      </div>
    </div>
  )
}
