"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { useSearchParams, useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguageToggle } from "@/components/language-toggle"
import { Mail, AlertCircle, CheckCircle2, KeyRound, Loader2 } from "lucide-react"

export default function LoginPage() {
  const t = useTranslations("auth")
  const searchParams = useSearchParams()
  const router = useRouter()

  const [email, setEmail] = useState("")
  const [otpCode, setOtpCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const otpRef = useRef<HTMLInputElement>(null)

  // Detect errors from query params or hash fragment on mount
  useEffect(() => {
    const queryError = searchParams.get("error")
    if (queryError === "otp_expired") {
      setErrorMessage(t("linkExpired"))
    } else if (queryError === "no_access") {
      setErrorMessage(t("noAccess"))
    } else if (queryError) {
      setErrorMessage(t("sessionExpired"))
    }

    const hash = window.location.hash
    if (hash) {
      const params = new URLSearchParams(hash.substring(1))
      const errorCode = params.get("error_code")
      if (errorCode === "otp_expired") {
        setErrorMessage(t("linkExpired"))
      } else if (params.get("error")) {
        setErrorMessage(t("sessionExpired"))
      }
      window.history.replaceState(null, "", window.location.pathname)
    }
  }, [searchParams, t])

  useEffect(() => {
    if (step === "code") otpRef.current?.focus()
  }, [step])

  async function handleSendCode(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage(t("invalidEmail"))
      return
    }

    setLoading(true)
    setErrorMessage("")
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    setLoading(false)
    if (error) {
      if (error.code === "over_email_send_rate_limit") {
        setErrorMessage(t("rateLimited"))
      } else {
        setErrorMessage(t("sendError"))
      }
    } else {
      setErrorMessage("")
      setOtpCode("")
      setStep("code")
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault()

    const code = otpCode.trim()
    if (code.length < 6) {
      setErrorMessage(t("invalidOtp"))
      return
    }

    setLoading(true)
    setErrorMessage("")
    const supabase = createClient()

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code,
      type: "email",
    })

    if (error) {
      setLoading(false)
      if (error.code === "otp_expired") {
        setErrorMessage(t("otpExpired"))
      } else if (error.code === "otp_disabled") {
        setErrorMessage(t("otpDisabled"))
      } else {
        setErrorMessage(t("verifyError"))
      }
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

        <p className="text-[14px] text-muted-foreground text-center">{t("subtitle")}</p>

        {/* Error banner */}
        {errorMessage && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
            <AlertCircle className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
            <p className="text-[14px] text-red-600 dark:text-red-400">{errorMessage}</p>
          </div>
        )}

        {step === "email" ? (
          <form onSubmit={handleSendCode} className="flex flex-col gap-4">
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
                onChange={(e) => { setEmail(e.target.value); setErrorMessage("") }}
                disabled={loading}
                required
                className="h-10"
              />
            </div>

            <Button type="submit" className="w-full h-10" disabled={loading}>
              {loading ? (
                <><Loader2 className="size-4 animate-spin" />{t("sendCode")}…</>
              ) : (
                <><Mail className="size-4" />{t("sendCode")}</>
              )}
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Success message — click link or enter code */}
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-3">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <div className="text-left">
                <p className="text-[14px] font-medium text-emerald-700 dark:text-emerald-400">{t("checkEmail")}</p>
                <p className="text-[13px] text-emerald-600 dark:text-emerald-400/80 mt-1">{t("checkEmailDescription", { email })}</p>
              </div>
            </div>

            {/* OTP code form */}
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-3">
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
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => {
                    setOtpCode(e.target.value.replace(/\D/g, ""))
                    setErrorMessage("")
                  }}
                  disabled={loading}
                  className="h-10 text-center tracking-[0.3em] text-[18px] font-medium"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-10"
                disabled={loading || otpCode.length < 6}
              >
                {loading ? (
                  <><Loader2 className="size-4 animate-spin" />{t("verifyCode")}…</>
                ) : (
                  <><KeyRound className="size-4" />{t("verifyCode")}</>
                )}
              </Button>
            </form>

            <button
              type="button"
              onClick={() => { setStep("email"); setOtpCode(""); setErrorMessage("") }}
              className="text-[12px] text-primary hover:underline text-center"
            >
              {t("useAnotherEmail")}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
