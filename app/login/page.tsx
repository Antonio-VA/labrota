"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { LanguageToggle } from "@/components/language-toggle"
import { LogIn, AlertCircle, CheckCircle2 } from "lucide-react"

export default function LoginPage() {
  const t = useTranslations("auth")
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasCallbackError = searchParams.get("error") !== null
  const isResetSuccess   = searchParams.get("message") === "reset_success"

  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [state, setState]       = useState<"idle" | "loading" | "error">(
    hasCallbackError ? "error" : "idle"
  )
  const [errorMessage, setErrorMessage] = useState(
    hasCallbackError ? t("invalidCredentials") : ""
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage(t("invalidEmail"))
      setState("error")
      return
    }
    if (!password) {
      setErrorMessage(t("invalidCredentials"))
      setState("error")
      return
    }

    setState("loading")
    const supabase = createClient()

    const { error } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    })

    if (error) {
      setErrorMessage(t("invalidCredentials"))
      setState("error")
    } else {
      router.push("/")
      router.refresh()
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center pt-[20vh] px-4">

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

        <form onSubmit={handleSubmit} className="flex flex-col gap-5">

          {/* Subtitle only — no "Bienvenido" heading */}
          <p className="text-[14px] text-muted-foreground text-center">{t("subtitle")}</p>

          {/* Success banner (post-reset) */}
          {isResetSuccess && state !== "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
              <p className="text-[14px] text-emerald-700 dark:text-emerald-400">{t("resetSuccess")}</p>
            </div>
          )}

          {/* Error banner */}
          {state === "error" && (
            <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2">
              <AlertCircle className="size-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0" />
              <p className="text-[14px] text-red-600 dark:text-red-400">{errorMessage}</p>
            </div>
          )}

          <div className="flex flex-col gap-4">
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

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-[13px] text-muted-foreground font-medium">
                  {t("passwordLabel")}
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[12px] text-primary hover:underline"
                >
                  {t("forgotPassword")}
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (state === "error") setState("idle")
                }}
                disabled={state === "loading"}
                required
                className="h-10"
              />
            </div>
          </div>

          <Button
            type="submit"
            className="w-full h-10"
            disabled={state === "loading"}
          >
            {state === "loading" ? (
              <>
                <LogIn className="size-4 animate-pulse" />
                {t("signIn")}…
              </>
            ) : (
              <>
                <LogIn className="size-4" />
                {t("signIn")}
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
