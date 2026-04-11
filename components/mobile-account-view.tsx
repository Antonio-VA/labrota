"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { Sun, Moon, Monitor, LogOut, Cloud, Unplug, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { saveUserPreferences, getUserOutlookStatus, type UserPreferences, type UserOutlookStatus } from "@/app/(clinic)/account-actions"
import { syncOutlookForStaff, disconnectOutlook } from "@/app/(clinic)/leaves/outlook-actions"
import { applyTheme } from "@/components/account-panel"
import { toast } from "sonner"

const ACCENT_COLORS = [
  "#1b4f8a", "#2563EB", "#3B82F6",
  "#0D9488", "#059669", "#16A34A", "#65A30D",
  "#EA580C", "#DC2626", "#64748B",
]

interface MobileAccountViewProps {
  initialUser: { email: string | null; fullName: string | null; avatarUrl: string | null } | null
  initialPrefs: UserPreferences
  initialOutlook: UserOutlookStatus
}

export function MobileAccountView({ initialUser, initialPrefs, initialOutlook }: MobileAccountViewProps) {
  const locale = useLocale() as "es" | "en"
  const [isPending, startTransition] = useTransition()
  const [avatarImgError, setAvatarImgError] = useState(false)
  const [prefs, setPrefs] = useState<UserPreferences>({
    theme: initialPrefs.theme ?? "light",
    accentColor: initialPrefs.accentColor ?? "#1b4f8a",
    locale: initialPrefs.locale ?? "browser",
  })
  const [outlook, setOutlook] = useState<UserOutlookStatus>(initialOutlook)

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  function handleSave() {
    startTransition(async () => {
      // Apply visual changes immediately
      applyTheme(prefs)

      // Handle locale: set/clear cookie
      if (prefs.locale === "browser") {
        document.cookie = "locale=;path=/;max-age=0"
      } else {
        document.cookie = `locale=${prefs.locale};path=/;max-age=31536000`
      }

      await saveUserPreferences(prefs)
      toast.success(locale === "es" ? "Preferencias guardadas" : "Preferences saved")

      // Reload if locale changed (next-intl needs a fresh page)
      const currentLocaleCookie = document.cookie.split(";")
        .find((c) => c.trim().startsWith("locale="))?.split("=")[1] ?? "browser"
      const localeChanged = currentLocaleCookie !== (prefs.locale ?? "browser")
      if (localeChanged) {
        window.location.reload()
      }
    })
  }

  const initials = initialUser?.fullName
    ? initialUser.fullName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : initialUser?.email?.[0]?.toUpperCase() ?? "?"

  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      {/* Profile header */}
      <div className="flex items-center gap-3">
        {initialUser?.avatarUrl && !avatarImgError ? (
          <img src={initialUser.avatarUrl} alt="" className="size-14 rounded-full object-cover" onError={() => setAvatarImgError(true)} />
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
                { key: "light" as const, icon: Sun, label: locale === "es" ? "Claro" : "Light" },
                { key: "dark"  as const, icon: Moon, label: locale === "es" ? "Oscuro" : "Dark" },
                { key: "auto"  as const, icon: Monitor, label: "Auto" },
              ].map(({ key, icon: Icon, label }) => (
                <button
                  key={key}
                  onClick={() => setPrefs((p) => ({ ...p, theme: key }))}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-[13px] font-medium transition-colors",
                    prefs.theme === key ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-muted"
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
                  onClick={() => setPrefs((p) => ({ ...p, accentColor: c }))}
                  className={cn(
                    "size-8 rounded-full transition-all",
                    prefs.accentColor === c ? "ring-2 ring-offset-2 ring-primary" : "ring-1 ring-border"
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
                { key: "browser" as const, label: locale === "es" ? "Navegador" : "Browser" },
                { key: "es"      as const, label: "Español" },
                { key: "en"      as const, label: "English" },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setPrefs((p) => ({ ...p, locale: key }))}
                  className={cn(
                    "flex-1 py-2.5 rounded-lg text-[13px] font-medium transition-colors text-center",
                    prefs.locale === key ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Outlook sync */}
          {outlook.available && (
            <div className="rounded-xl border border-border bg-background px-4 py-3">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
                {locale === "es" ? "Sincronización Outlook" : "Outlook Sync"}
              </p>
              {outlook.connected ? (
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center size-9 rounded-full bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
                    <Cloud className="size-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium">{locale === "es" ? "Conectado" : "Connected"}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{outlook.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      if (!outlook.staffId) return
                      startTransition(async () => {
                        const r = await syncOutlookForStaff(outlook.staffId!)
                        if (r.errors.length > 0) toast.error(r.errors[0])
                        else toast.success(locale === "es" ? `${r.created + r.updated} ausencias sincronizadas` : `${r.created + r.updated} leaves synced`)
                        getUserOutlookStatus().then(setOutlook)
                      })
                    }}
                    disabled={isPending}
                    className="p-2 rounded-lg active:bg-muted text-muted-foreground"
                  >
                    <RefreshCw className={cn("size-4", isPending && "animate-spin")} />
                  </button>
                  <button
                    onClick={() => {
                      if (!outlook.staffId) return
                      startTransition(async () => {
                        await disconnectOutlook(outlook.staffId!, true)
                        toast.success(locale === "es" ? "Outlook desconectado" : "Outlook disconnected")
                        getUserOutlookStatus().then(setOutlook)
                      })
                    }}
                    disabled={isPending}
                    className="p-2 rounded-lg active:bg-muted text-muted-foreground"
                  >
                    <Unplug className="size-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (outlook.staffId && outlook.orgId) {
                      window.location.href = `/api/outlook-auth?staffId=${outlook.staffId}&orgId=${outlook.orgId}`
                    }
                  }}
                  className="flex items-center gap-2.5 w-full rounded-lg border border-dashed border-border px-3 py-3 active:bg-muted/50 transition-colors"
                >
                  <Cloud className="size-4 text-primary shrink-0" />
                  <div className="text-left">
                    <p className="text-[13px] font-medium">{locale === "es" ? "Conectar Outlook" : "Connect Outlook"}</p>
                    <p className="text-[11px] text-muted-foreground">{locale === "es" ? "Sincroniza ausencias automáticamente" : "Auto-sync your out-of-office events"}</p>
                  </div>
                </button>
              )}
            </div>
          )}

          {/* Save */}
          <button
            onClick={handleSave}
            disabled={isPending}
            className="py-3 rounded-xl bg-primary text-primary-foreground text-[14px] font-semibold active:opacity-80 disabled:opacity-50 transition-opacity"
          >
            {isPending ? (locale === "es" ? "Guardando…" : "Saving…") : (locale === "es" ? "Guardar" : "Save")}
          </button>

      {/* Support */}
      <a
        href="mailto:support@labrota.app"
        className="flex items-center justify-center gap-2 py-3 rounded-xl border border-border text-muted-foreground active:bg-muted transition-colors"
      >
        <span className="text-[14px] font-medium">{locale === "es" ? "Soporte" : "Support"}</span>
      </a>

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
