"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguageToggle } from "@/components/language-toggle"
import { Mail, AlertCircle, CheckCircle2, KeyRound } from "lucide-react"

function getInitialError(searchParams: URLSearchParams, t: (key: string) => string): { state: "idle" | "error"; message: string } {
  const queryError = searchParams.get("error")
  if (queryError === "otp_expired") return { state: "error", message: t("linkExpired") }
  if (queryError) return { state: "error", message: t("sessionExpired") }
  return { state: "idle", message: "" }
}

export default function LoginPage() {
  const t = useTranslations("auth")
  const searchParams = useSearchParams()
  const router = useRouter()
  const initial = getInitialError(searchParams, t)

  const [email, setEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [state, setState] = useState<"idle" | "loading" | "sent" | "verifying" | "error">(initial.state)
  const [errorMessage, setErrorMessage] = useState(initial.message)
  const otpRef = useRef<HTMLInputElement>(null)

  // Supabase redirects expired magic links with error details in the URL hash fragment
  useEffect(() => {
    const hash = window.location.hash
    if (!hash) return
    const params = new URLSearchParams(hash.substring(1))
    const errorCode = params.get("error_code")
    if (errorCode === "otp_expired") {
      setState("error")
      setErrorMessage(t("linkExpired"))
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
    } else if (params.get("error")) {
      setState("error")
      setErrorMessage(t("sessionExpired"))
      window.history.replaceState(null, "", window.location.pathname + window.location.search)
    }
  }, [t])

  // Auto-focus OTP input when the "sent" state is reached
  useEffect(() => {
    if (state === "sent") otpRef.current?.focus()
  }, [state])

  async function handleSendOtp(e: React.FormEvent) {
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

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault()

    const code = otpCode.trim()
    if (code.length < 6) {
      setErrorMessage(t("invalidOtp"))
      setState("error")
      return
    }

    setState("verifying")
    const supabase = createClient()

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: "email",
    })

    if (error) {
      setErrorMessage(error.code === "otp_expired" ? t("linkExpired") : error.message)
      setState("error")
    } else {
      router.replace("/")
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

        {state === "sent" || state === "verifying" ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-left">
                <p className="text-[14px] font-medium text-emerald-700 dark:text-emerald-400">{t("checkEmail")}</p>
                <p className="text-[13px] text-emerald-600 dark:text-emerald-400/80 mt-1">{t("checkEmailDescription", { email })}</p>
              </div>
            </div>

            {/* OTP code input */}
            <form onSubmit={handleVerifyOtp} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="otp" className="text-[13px] text-muted-foreground font-medium">
                  {t("otpLabel")}
                </label>
                <Input
                  ref={otpRef}
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={8}
                  value={otpCode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "")
                    setOtpCode(val)
                  }}
                  disabled={state === "verifying"}
                  className="h-10 text-center tracking-[0.3em] text-[18px] font-medium"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-10"
                disabled={state === "verifying" || otpCode.length < 6}
              >
                {state === "verifying" ? (
                  <>
                    <KeyRound className="size-4 animate-pulse" />
                    {t("verifyCode")}…
                  </>
                ) : (
                  <>
                    <KeyRound className="size-4" />
                    {t("verifyCode")}
                  </>
                )}
              </Button>
            </form>

            <button
              onClick={() => { setState("idle"); setOtpCode("") }}
              className="text-[12px] text-primary hover:underline text-center"
            >
              {t("resendLink")}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendOtp} className="flex flex-col gap-5">

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
