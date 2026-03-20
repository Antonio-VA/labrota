"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguageToggle } from "@/components/language-toggle"
import { AlertCircle, Mail } from "lucide-react"

export default function ForgotPasswordPage() {
  const t = useTranslations("auth")

  const [email, setEmail]   = useState("")
  const [state, setState]   = useState<"idle" | "loading" | "sent" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage(t("invalidEmail"))
      setState("error")
      return
    }

    setState("loading")
    const supabase = createClient()

    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      { redirectTo: "https://labrota.app/auth/callback?next=/reset-password" }
    )

    if (error) {
      setErrorMessage(t("invalidEmail"))
      setState("error")
    } else {
      setState("sent")
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

        {state === "sent" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-sans text-[22px] font-normal text-center" style={{ color: "#1A2E3B" }}>{t("checkResetEmail")}</p>
              <p className="font-sans text-[14px] font-light text-center" style={{ color: "#666666" }}>
                {t("checkResetEmailDescription", { email })}
              </p>
            </div>
            <Button
              render={<Link href="/login" />}
              className="w-full h-[44px] rounded-[8px] bg-[#1B4F8A]"
            >
              {t("backToLogin")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div className="flex flex-col gap-1">
              <p className="font-sans text-[22px] font-normal text-center" style={{ color: "#1A2E3B" }}>{t("forgotPassword")}</p>
              <p className="font-sans text-[14px] font-light text-center" style={{ color: "#666666" }}>{t("subtitle")}</p>
            </div>

            {/* Error banner */}
            {state === "error" && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-[14px] text-red-600">{errorMessage}</p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-[14px] text-muted-foreground">
                {t("emailLabel")}
              </label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (state === "error") setState("idle")
                }}
                disabled={state === "loading"}
                required
                className="h-[44px] rounded-[8px] border border-[#CCDDEE]"
              />
            </div>

            <div className="flex flex-col gap-3">
              <Button
                type="submit"
                className="w-full h-[44px] rounded-[8px] bg-[#1B4F8A]"
                disabled={state === "loading"}
              >
                {state === "loading" ? (
                  <>
                    <Mail className="size-4 animate-pulse" />
                    {t("sendResetLink")}…
                  </>
                ) : (
                  <>
                    <Mail className="size-4" />
                    {t("sendResetLink")}
                  </>
                )}
              </Button>

              <Button
                render={<Link href="/login" />}
                className="w-full h-[44px] rounded-[8px]"
                variant="outline"
              >
                {t("backToLogin")}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
