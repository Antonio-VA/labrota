"use client"

import { useEffect, useState, useTransition } from "react"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import { setLocale } from "@/lib/locale-action"
import type { User } from "@supabase/supabase-js"

// ── Pathname → nav key ────────────────────────────────────────────────────────

type NavKey = "schedule" | "staff" | "leaves" | "lab" | "reports" | "settings"

function getNavKey(pathname: string): NavKey {
  if (pathname === "/")               return "schedule"
  if (pathname.startsWith("/staff"))  return "staff"
  if (pathname.startsWith("/leaves")) return "leaves"
  if (pathname.startsWith("/lab"))    return "lab"
  if (pathname.startsWith("/reports"))  return "reports"
  if (pathname.startsWith("/settings")) return "settings"
  return "schedule"
}

// ── Top bar ───────────────────────────────────────────────────────────────────

export function ClinicTopBar() {
  const t        = useTranslations("nav")
  const locale   = useLocale()
  const pathname = usePathname()
  const router   = useRouter()

  const [user, setUser]               = useState<User | null>(null)
  const [isPending, startTransition]  = useTransition()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  function initials(u: User) {
    const name = (u.user_metadata?.full_name as string | undefined) ?? ""
    if (name) return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    return (u.email ?? "").slice(0, 2).toUpperCase()
  }

  function toggleLocale() {
    const next = locale === "es" ? "en" : "es"
    startTransition(async () => {
      await setLocale(next as "es" | "en")
      router.refresh()
    })
  }

  const pageTitle = t(getNavKey(pathname))

  return (
    <header className="hidden md:flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-5">
      {/* Left: logo wordmark */}
      <a href="/" className="flex items-center shrink-0">
        <Image
          src="/brand/logo-wordmark.svg"
          alt="LabRota"
          width={96}
          height={28}
          priority
          className="h-7 w-auto"
        />
      </a>

      {/* Centre: page name */}
      <span className="text-[14px] font-medium absolute left-1/2 -translate-x-1/2">
        {pageTitle}
      </span>

      {/* Right: lang toggle + avatar */}
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={toggleLocale}
          disabled={isPending}
          className="text-[11px] font-semibold text-muted-foreground hover:text-foreground tracking-widest transition-colors"
          title={locale === "es" ? "Switch to English" : "Cambiar a Español"}
        >
          {locale === "es" ? "EN" : "ES"}
        </button>

        {user && (
          <div
            title={user.user_metadata?.full_name as string ?? user.email ?? ""}
            className="flex size-8 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground cursor-default select-none"
          >
            {initials(user)}
          </div>
        )}
      </div>
    </header>
  )
}
