"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { LogOut, UserCog, HelpCircle, Sun, Moon, Monitor } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { applyTheme } from "@/components/account-panel"
import { AccountPanel } from "@/components/account-panel"
import { SupportModal } from "@/components/support-modal"
import { cn } from "@/lib/utils"
import type { User } from "@supabase/supabase-js"

interface InitialUser {
  email: string | null
  fullName: string | null
  avatarUrl: string | null
}

const THEME_OPTION_KEYS = [
  { key: "light" as const, labelKey: "themeLight", icon: Sun },
  { key: "dark" as const, labelKey: "themeDark", icon: Moon },
  { key: "auto" as const, labelKey: "themeSystem", icon: Monitor },
]

export function UserAvatarMenu({ initialUser, variant = "dark" }: { initialUser: InitialUser; variant?: "dark" | "light" }) {
  const t = useTranslations("nav")
  const tu = useTranslations("userMenu")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [fullUser, setFullUser] = useState<User | null>(null)
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark" | "auto">("light")
  const ref = useRef<HTMLDivElement>(null)

  // Read current theme on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("labrota_theme")
      if (raw) {
        const p = JSON.parse(raw)
        if (p.theme) setCurrentTheme(p.theme)
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function openAccount() {
    setOpen(false)
    if (!fullUser) {
      const supabase = createClient()
      supabase.auth.getUser().then(({ data }) => {
        setFullUser(data.user ?? null)
        setAccountOpen(true)
      })
    } else {
      setAccountOpen(true)
    }
  }

  function handleThemeChange(theme: "light" | "dark" | "auto") {
    setCurrentTheme(theme)
    // Read existing prefs to preserve accent color
    let accentColor = "#1b4f8a"
    try {
      const raw = localStorage.getItem("labrota_theme")
      if (raw) {
        const p = JSON.parse(raw)
        if (p.accentColor) accentColor = p.accentColor
      }
    } catch {}
    applyTheme({ theme, accentColor })
  }

  function signOut() {
    const supabase = createClient()
    supabase.auth.signOut().then(() => router.push("/login"))
  }

  const fullName = initialUser.fullName ?? ""
  const firstName = fullName.split(" ")[0] || initialUser.email?.split("@")[0] || ""
  const initials = fullName
    ? fullName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : (initialUser.email ?? "").slice(0, 2).toUpperCase()
  const avatarUrl = initialUser.avatarUrl

  return (
    <div ref={ref} className="relative">
      {avatarUrl ? (
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 hover:opacity-90 transition-opacity p-0 bg-transparent"
          style={{ width: 28, height: 28, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: variant === "light" ? "1.5px solid var(--border)" : "1.5px solid rgba(255,255,255,0.4)" }}
          title={firstName}
        >
          <img src={avatarUrl} alt="Avatar" style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", display: "block" }} />
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          className={cn(
            "size-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 hover:opacity-90 transition-opacity",
            variant === "light" ? "bg-primary/10 text-primary" : "bg-white/20 text-white"
          )}
          style={{ border: variant === "light" ? "1.5px solid var(--border)" : "1.5px solid rgba(255,255,255,0.4)" }}
          title={firstName}
        >
          {initials}
        </button>
      )}

      {open && (
        <div className="absolute right-0 top-10 z-50 w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
          {/* User info */}
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[13px] font-medium truncate">{fullName || firstName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{initialUser.email}</p>
          </div>

          {/* Preferences */}
          <button
            onClick={openAccount}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left hover:bg-accent transition-colors duration-75"
          >
            <UserCog className="size-3.5" />
            {tu("preferences")}
          </button>
          <button
            onClick={() => { setOpen(false); setSupportOpen(true) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left hover:bg-accent transition-colors duration-75"
          >
            <HelpCircle className="size-3.5" />
            {tu("support")}
          </button>

          {/* Theme section */}
          <div className="border-t border-border">
            <p className="px-3 pt-2 pb-1 text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{tu("theme")}</p>
            {THEME_OPTION_KEYS.map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                onClick={() => handleThemeChange(key)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors duration-75"
              >
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="flex-1">{tu(labelKey)}</span>
                <span className={cn(
                  "size-1.5 rounded-full shrink-0 transition-colors",
                  currentTheme === key ? "bg-primary" : "bg-transparent"
                )} />
              </button>
            ))}
          </div>

          {/* Support + Sign out */}
          <div className="border-t border-border">
            <button
              onClick={() => { setOpen(false); setSupportOpen(true) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {t("support") ?? "Soporte"}
            </button>
            <button
              onClick={() => { setOpen(false); signOut() }}
              className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="size-3.5" />
              {t("signOut")}
            </button>
          </div>
        </div>
      )}

      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} user={fullUser} />
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  )
}
