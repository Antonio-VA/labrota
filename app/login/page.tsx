"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguageToggle } from "@/components/language-toggle"
import { Mail, CheckCircle2, AlertCircle } from "lucide-react"

export default function LoginPage() {
  const t = useTranslations("auth")
  const searchParams = useSearchParams()
  const hasCallbackError = searchParams.get("error") !== null

  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">(
    hasCallbackError ? "error" : "idle"
  )
  const [errorMessage, setErrorMessage] = useState(
    hasCallbackError ? "El enlace de acceso no es válido o ha caducado." : ""
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage(t("invalidEmail"))
      setState("error")
      return
    }

    setState("loading")
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: false, // only allow pre-existing users in v1
      },
    })

    if (error) {
      setErrorMessage(error.message)
      setState("error")
    } else {
      setState("sent")
    }
  }

  return (
    <div className="min-h-screen bg-muted grid place-items-center px-4">

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
          /* ── Confirmation state ── */
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg border border-border bg-muted">
              <CheckCircle2 className="size-5 text-emerald-600" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-[14px] font-medium">{t("checkEmail")}</p>
              <p className="text-[14px] text-muted-foreground">
                {t("checkEmailDescription", { email })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setState("idle")}
              className="text-muted-foreground"
            >
              {t("resendLink")}
            </Button>
          </div>
        ) : (
          /* ── Form state ── */
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="font-sans text-[22px] font-normal text-center" style={{ color: "#1A2E3B" }}>{t("welcome")}</p>
              <p className="font-sans text-[14px] font-light text-center" style={{ color: "#666666" }}>{t("subtitle")}</p>
            </div>

            {/* Error banner */}
            {state === "error" && (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
                <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
                <p className="text-[14px] text-red-600">{errorMessage}</p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[14px] font-medium">
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
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={state === "loading"}
            >
              {state === "loading" ? (
                <>
                  <Mail className="size-4 animate-pulse" />
                  {t("sendLink")}…
                </>
              ) : (
                <>
                  <Mail className="size-4" />
                  {t("sendLink")}
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
