"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguageToggle } from "@/components/language-toggle"
import { Mail, AlertCircle, CheckCircle2 } from "lucide-react"

function getInitialError(searchParams: URLSearchParams, t: (key: string) => string): { state: "idle" | "error"; message: string } {
  const queryError = searchParams.get("error")
  if (queryError === "otp_expired") return { state: "error", message: t("linkExpired") }
  if (queryError) return { state: "error", message: t("sessionExpired") }
  return { state: "idle", message: "" }
}

export default function LoginPage() {
  const t = useTranslations("auth")
  const searchParams = useSearchParams()
  const initial = getInitialError(searchParams, t)

  const [email, setEmail] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">(initial.state)
  const [errorMessage, setErrorMessage] = useState(initial.message)

  // Supabase redirects expired magic links with error details in the URL hash fragment
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    const params = new URLSearchParams(hash.substring(1))
    const errorCode = params.get("error_code")
    if (errorCode === "otp_expired") {
      setState("error")
      setErrorMessage(t("linkExpired"))
      // Clean the hash so a refresh doesn't re-show the error
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
    } else if (params.get("error")) {
      setState("error")
      setErrorMessage(t("sessionExpired"))
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
    }
  }, [t])

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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setErrorMessage(error.message)
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
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-8 shadow-sm flex flex-col gap-6">

        {/* Logo */}
        <div className="flex flex-col items-center">
          <span className="font-sans text-[28px] leading-none tracking-normal text-primary">
            <span className="font-light">lab</span><span className="font-bold">rota</span>
          </span>
        </div>

        {state === "sent" ? (
          <div className="flex flex-col gap-3 text-center">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-left">
                <p className="text-[14px] font-medium text-emerald-700 dark:text-emerald-400">{t("checkEmail")}</p>
                <p className="text-[13px] text-emerald-600 dark:text-emerald-400/80 mt-1">{t("checkEmailDescription", { email })}</p>
              </div>
            </div>
            <button
              onClick={() => setState("idle")}
              className="text-[12px] text-primary hover:underline"
            >
              {t("resendLink")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">

            <p className="text-[14px] text-muted-foreground text-center">{t("subtitle")}</p>

            {/* Error banner */}
            {state === "error" && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
                <AlertCircle className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
                <p className="text-[14px] text-red-600 dark:text-red-400">{errorMessage}</p>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-[13px] text-muted-foreground font-medium">
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
                className="h-10"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-10"
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
