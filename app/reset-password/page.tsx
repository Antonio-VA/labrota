"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguageToggle } from "@/components/language-toggle"
import { KeyRound, AlertCircle } from "lucide-react"

export default function ResetPasswordPage() {
  const t = useTranslations("auth")
  const router = useRouter()

  const [password, setPassword]   = useState("")
  const [confirm, setConfirm]     = useState("")
  const [state, setState]         = useState<"idle" | "loading" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (password.length < 8) {
      setErrorMessage(t("passwordTooShort"))
      setState("error")
      return
    }
    if (password !== confirm) {
      setErrorMessage(t("passwordMismatch"))
      setState("error")
      return
    }

    setState("loading")
    const supabase = createClient()

    const { error } = await supabase.auth.updateUser({ password })

    if (error) {
      setErrorMessage(error.message)
      setState("error")
    } else {
      // Sign out so the user logs in fresh with the new password
      await supabase.auth.signOut()
      router.push("/login?message=reset_success")
    }
  }

  return (
    <div className="min-h-screen bg-muted flex items-start justify-center pt-[20vh] px-4">

      {/* Language toggle — top right */}
      <div className="absolute top-4 right-4">
        <LanguageToggle />
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-background rounded-lg border border-border p-8 flex flex-col gap-6">

        {/* Wordmark */}
        <div className="flex flex-col items-center gap-0">
          <span className="font-sans text-[28px] leading-none tracking-normal" style={{ color: "#1B4F8A" }}>
            <span className="font-light">lab</span><span className="font-bold">rota</span>
          </span>
          <div className="mt-1 h-[2px] w-full" style={{ backgroundColor: "#2E86AB" }} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <p className="font-sans text-[22px] font-normal text-center" style={{ color: "#1A2E3B" }}>{t("resetPasswordTitle")}</p>
            <p className="font-sans text-[14px] font-light text-center" style={{ color: "#666666" }}>{t("resetPasswordSubtitle")}</p>
          </div>

          {/* Error banner */}
          {state === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
              <p className="text-[14px] text-red-600">{errorMessage}</p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="password" className="text-[14px] text-muted-foreground">
                {t("newPassword")}
              </label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (state === "error") setState("idle")
                }}
                disabled={state === "loading"}
                required
                className="h-[44px] rounded-[8px] border border-[#CCDDEE]"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label htmlFor="confirm" className="text-[14px] text-muted-foreground">
                {t("confirmPassword")}
              </label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value)
                  if (state === "error") setState("idle")
                }}
                disabled={state === "loading"}
                required
                className="h-[44px] rounded-[8px] border border-[#CCDDEE]"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-[44px] rounded-[8px] bg-[#1B4F8A]"
            disabled={state === "loading"}
          >
            {state === "loading" ? (
              <>
                <KeyRound className="size-4 animate-pulse" />
                {t("resetPassword")}…
              </>
            ) : (
              <>
                <KeyRound className="size-4" />
                {t("resetPassword")}
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
