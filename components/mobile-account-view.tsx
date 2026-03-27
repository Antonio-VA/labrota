"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { Sun, Moon, Monitor, LogOut, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { getUserPreferences, saveUserPreferences, type UserPreferences } from "@/app/(clinic)/account-actions"

export { applyTheme } from "@/components/account-panel"

const ACCENT_COLORS = [
  "#1b4f8a", "#2563EB", "#7C3AED", "#DB2777", "#059669",
  "#D97706", "#DC2626", "#0D9488", "#4F46E5", "#64748B",
]

interface MobileAccountViewProps {
  initialUser: { email: string | null; fullName: string | null; avatarUrl: string | null } | null
}

export function MobileAccountView({ initialUser }: MobileAccountViewProps) {
  const t = useTranslations("account")
  const locale = useLocale() as "es" | "en"
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [theme, setTheme] = useState<string>(() => {
    if (typeof window === "undefined") return "light"
    try { return JSON.parse(localStorage.getItem("labrota_theme") || "{}").theme ?? "light" } catch { return "light" }
  })
  const [accent, setAccent] = useState<string>(() => {
    if (typeof window === "undefined") return "#1b4f8a"
    try { return JSON.parse(localStorage.getItem("labrota_theme") || "{}").accentColor ?? "#1b4f8a" } catch { return "#1b4f8a" }
  })

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  function handleTheme(t: string) {
    setTheme(t)
    const saved = JSON.parse(localStorage.getItem("labrota_theme") || "{}")
    saved.theme = t
    localStorage.setItem("labrota_theme", JSON.stringify(saved))
    document.documentElement.dataset.theme = t === "dark" ? "dark" : t === "auto" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "") : ""
  }

  function handleAccent(c: string) {
    setAccent(c)
    const saved = JSON.parse(localStorage.getItem("labrota_theme") || "{}")
    saved.accentColor = c
    localStorage.setItem("labrota_theme", JSON.stringify(saved))
    document.documentElement.style.setProperty("--primary", c)
    document.documentElement.style.setProperty("--ring", c)
    startTransition(async () => {
      await saveUserPreferences({ accentColor: c } as UserPreferences)
    })
  }

  const initials = initialUser?.fullName
    ? initialUser.fullName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : initialUser?.email?.[0]?.toUpperCase() ?? "?"

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      {/* Profile header */}
      <div className="flex items-center gap-3">
        {initialUser?.avatarUrl ? (
          <img src={initialUser.avatarUrl} alt="" className="size-14 rounded-full object-cover" />
        ) : (
          <div className="size-14 rounded-full bg-primary/10 text-primary text-[18px] font-bold flex items-center justify-center">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[16px] font-semibold truncate">{initialUser?.fullName ?? initialUser?.email ?? "—"}</p>
          {initialUser?.fullName && initialUser.email && (
            <p className="text-[13px] text-muted-foreground truncate">{initialUser.email}</p>
          )}
        </div>
      </div>

      {/* Theme */}
      <div className="rounded-xl border border-border bg-background">
        <p className="px-4 pt-3 pb-1 text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
          {locale === "es" ? "Apariencia" : "Appearance"}
        </p>
        <div className="flex items-center gap-1 px-3 pb-3">
          {[
            { key: "light", icon: Sun, label: locale === "es" ? "Claro" : "Light" },
            { key: "dark", icon: Moon, label: locale === "es" ? "Oscuro" : "Dark" },
            { key: "auto", icon: Monitor, label: "Auto" },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => handleTheme(key)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                theme === key ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-muted"
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Accent color */}
      <div className="rounded-xl border border-border bg-background px-4 py-3">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
          {locale === "es" ? "Color de acento" : "Accent color"}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {ACCENT_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => handleAccent(c)}
              className={cn(
                "size-8 rounded-full transition-all",
                accent === c ? "ring-2 ring-offset-2 ring-primary" : "ring-1 ring-border"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      {/* Language */}
      <div className="rounded-xl border border-border bg-background px-4 py-3">
        <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
          {locale === "es" ? "Idioma" : "Language"}
        </p>
        <div className="flex items-center gap-1">
          {[
            { key: "es", label: "Español" },
            { key: "en", label: "English" },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => {
                document.cookie = `locale=${key};path=/;max-age=31536000`
                window.location.reload()
              }}
              className={cn(
                "flex-1 py-2.5 rounded-lg text-[13px] font-medium transition-colors text-center",
                locale === key ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-muted"
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="flex items-center justify-center gap-2 py-3 rounded-xl border border-destructive/20 text-destructive active:bg-destructive/5 transition-colors"
      >
        <LogOut className="size-4" />
        <span className="text-[14px] font-medium">{locale === "es" ? "Cerrar sesión" : "Sign out"}</span>
      </button>
    </div>
  )
}
