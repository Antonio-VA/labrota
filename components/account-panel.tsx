"use client"

import { useState, useEffect, useTransition } from "react"
import { useRef } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { X, Sun, Moon, Monitor, Check, Camera, Cloud, Unplug, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getUserPreferences,
  getUserDepartment,
  saveUserPreferences,
  uploadAvatar,
  getUserOutlookStatus,
  type UserPreferences,
  type UserOutlookStatus,
} from "@/app/(clinic)/account-actions"
import { syncOutlookForStaff, disconnectOutlook } from "@/app/(clinic)/leaves/outlook-actions"
import { applyTheme } from "@/lib/apply-theme"
import { writeLocaleCookie } from "@/lib/locale-cookie"
import type { User } from "@supabase/supabase-js"

const ACCENT_COLORS = [
  { key: "blue",    hex: "#1b4f8a", labelKey: "accentBlue" },
  { key: "royal",   hex: "#2563EB", labelKey: "accentBlue" },
  { key: "teal",    hex: "#0D9488", labelKey: "accentEmerald" },
  { key: "emerald", hex: "#059669", labelKey: "accentEmerald" },
  { key: "green",   hex: "#16A34A", labelKey: "accentEmerald" },
  { key: "orange",  hex: "#EA580C", labelKey: "accentAmber" },
  { key: "red",     hex: "#DC2626", labelKey: "accentRose" },
  { key: "slate",   hex: "#64748B", labelKey: "accentSlate" },
]

const THEME_OPTION_KEYS: { key: UserPreferences["theme"]; labelKey: string; icon: React.ReactNode }[] = [
  { key: "light", labelKey: "themeLight",      icon: <Sun className="size-4 transition-transform duration-200 ease-out group-hover/btn:scale-125 group-hover/btn:-translate-y-0.5" /> },
  { key: "dark",  labelKey: "themeDark",     icon: <Moon className="size-4 transition-transform duration-200 ease-out group-hover/btn:scale-125 group-hover/btn:-translate-y-0.5" /> },
  { key: "auto",  labelKey: "themeAuto", icon: <Monitor className="size-4 transition-transform duration-200 ease-out group-hover/btn:scale-125 group-hover/btn:-translate-y-0.5" /> },
]

export function AccountPanel({ open, onClose, user }: {
  open: boolean
  onClose: () => void
  user: User | null
}) {
  const t = useTranslations("account")
  const tc = useTranslations("common")
  const to = useTranslations("outlook")
  const [prefs, setPrefs] = useState<UserPreferences>(() => {
    if (typeof window === "undefined") return { locale: "browser", theme: "light", accentColor: "#1b4f8a" }
    try {
      const saved = JSON.parse(localStorage.getItem("labrota_theme") || "{}")
      return { locale: "browser", theme: saved.theme ?? "light", accentColor: saved.accentColor ?? "#1b4f8a" }
    } catch { return { locale: "browser", theme: "light", accentColor: "#1b4f8a" } }
  })
  const [loadedLocale, setLoadedLocale] = useState<UserPreferences["locale"]>("browser")
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [department, setDepartment] = useState<string | null>(null)
  const [outlook, setOutlook] = useState<UserOutlookStatus>({ available: false, connected: false, email: null, lastSyncedAt: null, staffId: null, orgId: null })

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-open */
  useEffect(() => {
    if (!open || !user) return
    setLoading(true)
    Promise.all([getUserPreferences(), getUserDepartment(), getUserOutlookStatus()]).then(([p, dept, ol]) => {
      setPrefs({
        locale: p.locale ?? "browser",
        theme: p.theme ?? "light",
        accentColor: p.accentColor ?? "#1b4f8a",
        timeFormat: p.timeFormat ?? "24h",
        firstDayOfWeek: p.firstDayOfWeek ?? 0,
      })
      setLoadedLocale(p.locale ?? "browser")
      setDepartment(dept)
      setOutlook(ol)
      setLoading(false)
    })
  }, [open, user])
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSave() {
    // Apply theme immediately — don't wait for server save
    applyTheme(prefs)
    startTransition(async () => {
      const result = await saveUserPreferences(prefs)
      if (result.error) { toast.error(result.error); return }
      if (prefs.locale && prefs.locale !== loadedLocale) {
        writeLocaleCookie(prefs.locale)
        window.location.href = "/"
        return
      }
      toast.success(t("saved"))
      onClose()
    })
  }

  const firstName = (user?.user_metadata?.full_name as string)?.split(" ")[0] ?? ""
  const initials = firstName ? firstName.slice(0, 2).toUpperCase() : (user?.email ?? "").slice(0, 2).toUpperCase()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    (user?.user_metadata?.avatar_url as string) ?? null
  )
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const fd = new FormData()
    fd.append("avatar", file)
    const result = await uploadAvatar(fd)
    setUploading(false)
    if (result.error) { toast.error(result.error); return }
    if (result.url) { setAvatarUrl(result.url); toast.success(t("photoUpdated")) }
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-[60]" onClick={onClose} />}

      <div className={cn(
        "fixed right-0 top-0 bottom-0 z-[70] bg-background text-foreground border-l border-border shadow-xl",
        "flex flex-col transition-transform duration-200 ease-out w-[360px]",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
          <p className="text-[15px] font-medium">{t("title")}</p>
          <button onClick={onClose} className="size-7 flex items-center justify-center rounded hover:bg-muted transition-all duration-200 ease-out">
            <X className="size-4 text-slate-500 transition-transform duration-200 ease-out hover:scale-110 hover:rotate-90" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Profile */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-3">{t("profile")}</p>
            <div className="flex items-center gap-3 mb-3">
              {/* Avatar with upload */}
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="relative size-14 rounded-full shrink-0 overflow-hidden group"
                style={{ background: prefs.accentColor ?? "#1b4f8a" }}
              >
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="Avatar" width={56} height={56} className="size-full object-cover" onError={() => setAvatarUrl(null)} />
                ) : (
                  <span className="flex items-center justify-center size-full text-[18px] font-bold text-white">{initials}</span>
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 ease-out">
                  <Camera className="size-4 text-white transition-transform duration-200 ease-out group-hover:scale-110" />
                </div>
                {uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-[10px] text-white font-medium">…</span>
                  </div>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              <div className="min-w-0">
                <p className="text-[14px] font-medium truncate">{user?.user_metadata?.full_name ?? "—"}</p>
                <p className="text-[12px] text-muted-foreground truncate">{user?.email ?? "—"}</p>
                {department && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {department === "admin" ? t("administrator") : department === "lab" ? "Embriología" : department === "andrology" ? "Andrología" : department}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">{t("clickToChangePhoto")}</p>
              </div>
            </div>
          </div>

          {/* Language */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-3">{t("language")}</p>
            <select
              value={prefs.locale}
              onChange={(e) => setPrefs((p) => ({ ...p, locale: e.target.value as NonNullable<UserPreferences["locale"]> }))}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="browser">{t("browserDefault")}</option>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
          </div>

          {/* Appearance — Theme */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-3">{t("appearance")}</p>

            <p className="text-[12px] text-muted-foreground font-medium mb-2">{t("mode")}</p>
            <div className="flex gap-2 mb-4">
              {THEME_OPTION_KEYS.map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => {
                    const next = { ...prefs, theme: opt.key }
                    setPrefs(next as typeof prefs)
                    applyTheme(next as UserPreferences)
                  }}
                  className={cn(
                    "group/btn flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-all duration-200 ease-out text-[12px] hover:shadow-sm",
                    prefs.theme === opt.key
                      ? "border-primary bg-primary/5 text-primary font-medium"
                      : "border-border text-muted-foreground hover:bg-muted hover:border-border/80"
                  )}
                >
                  {opt.icon}
                  {t(opt.labelKey)}
                </button>
              ))}
            </div>

            <p className="text-[12px] text-muted-foreground font-medium mb-2">{t("accentColor")}</p>
            <div className="flex gap-2 flex-wrap mb-4">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setPrefs((p) => ({ ...p, accentColor: c.hex }))}
                  title={t(c.labelKey)}
                  className={cn(
                    "size-8 rounded-full border-2 flex items-center justify-center transition-all duration-200 ease-out",
                    prefs.accentColor === c.hex
                      ? "border-foreground scale-110"
                      : "border-transparent hover:scale-125 hover:shadow-sm"
                  )}
                  style={{ background: c.hex }}
                >
                  {prefs.accentColor === c.hex && <Check className="size-3.5 text-white transition-transform duration-200 ease-out" />}
                </button>
              ))}
            </div>

            <FontScaleSlider value={prefs.fontScale ?? "m"} onChange={(v) => { setPrefs((p) => ({ ...p, fontScale: v })); applyTheme({ ...prefs, fontScale: v }) }} />
          </div>

          {/* Preferences — time format + first day */}
          <div className="px-5 py-4 border-b border-border">
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-3">{t("preferences")}</p>

            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-medium">{t("timeFormat")}</span>
              <div className="flex rounded-lg border border-input overflow-hidden">
                {(["24h", "12h"] as const).map((fmt) => (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setPrefs((p) => ({ ...p, timeFormat: fmt }))}
                    className={cn(
                      "px-3 py-1 text-[12px] font-medium transition-colors",
                      prefs.timeFormat === fmt
                        ? "bg-primary text-primary-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-muted"
                    )}
                  >
                    {fmt === "24h" ? "24h" : "12h"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium">{t("firstDayOfWeek")}</span>
              <select
                value={prefs.firstDayOfWeek ?? 0}
                onChange={(e) => setPrefs((p) => ({ ...p, firstDayOfWeek: parseInt(e.target.value, 10) }))}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] outline-none focus-visible:border-ring"
              >
                <option value={0}>{t("monday")}</option>
                <option value={6}>{t("sunday")}</option>
                <option value={5}>{t("saturday")}</option>
              </select>
            </div>
          </div>

          {/* Outlook sync — only show when feature is available AND user is linked to staff */}
          {loading ? (
            <div className="px-5 py-4 border-b border-border">
              <div className="h-3 w-32 rounded bg-muted/50 animate-pulse mb-3" />
              <div className="h-12 rounded-lg bg-muted/50 animate-pulse" />
            </div>
          ) : outlook.available && outlook.staffId ? (
            <div className="px-5 py-4 border-b border-border">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide mb-3">{to("panelTitle")}</p>
              {outlook.connected ? (
                <div className="flex items-center gap-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20 px-3 py-2.5">
                  <Cloud className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">{to("connected")}</p>
                    <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400/70 truncate">{outlook.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      startTransition(async () => {
                        const r = await syncOutlookForStaff(outlook.staffId!)
                        if (r.errors.length > 0) toast.error(r.errors[0])
                        else toast.success(to("syncSuccess", { count: r.created + r.updated }))
                        getUserOutlookStatus().then(setOutlook)
                      })
                    }}
                    disabled={isPending}
                    className="p-1.5 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 transition-colors"
                    title={to("syncNow")}
                  >
                    <Cloud className="size-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      startTransition(async () => {
                        await disconnectOutlook(outlook.staffId!, true)
                        toast.success(to("featureDisabled"))
                        getUserOutlookStatus().then(setOutlook)
                      })
                    }}
                    disabled={isPending}
                    className="p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 text-muted-foreground hover:text-destructive transition-colors"
                    title={to("disconnectOutlook")}
                  >
                    <Unplug className="size-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    window.location.href = `/api/outlook-auth?staffId=${outlook.staffId}&orgId=${outlook.orgId}`
                  }}
                  className="flex items-center gap-3 w-full rounded-lg border border-border bg-muted/30 px-3 py-3 hover:bg-primary/5 hover:border-primary/40 transition-all group"
                >
                  <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                    <Cloud className="size-4 text-primary" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <p className="text-[13px] font-medium">{to("connectOutlook")}</p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{to("featureDescription")}</p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground shrink-0 group-hover:text-primary transition-colors" />
                </button>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 shrink-0 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>{tc("cancel")}</Button>
          <Button size="sm" onClick={handleSave} disabled={isPending || loading}>
            {isPending ? tc("saving") : tc("save")}
          </Button>
        </div>
      </div>
    </>
  )
}

// ── Font scale slider (shared between dropdown + panel) ──────────────────────

const FONT_SCALE_KEYS = [
  { key: "s" as const, labelKey: "fontSmall" },
  { key: "m" as const, labelKey: "fontNormal" },
  { key: "l" as const, labelKey: "fontLarge" },
]

export function FontScaleSlider({ value, onChange }: { value: "s" | "m" | "l"; onChange: (v: "s" | "m" | "l") => void }) {
  const t = useTranslations("account")
  const idx = FONT_SCALE_KEYS.findIndex((s) => s.key === value)
  return (
    <div>
      <p className="text-[12px] text-muted-foreground font-medium mb-2">{t("fontSize")}</p>
      <div className="flex items-center gap-3">
        <span className="text-[11px] text-muted-foreground font-medium">A</span>
        <div className="flex-1 flex items-center">
          {FONT_SCALE_KEYS.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onChange(s.key)}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <div className={cn(
                "size-3 rounded-full border-2 transition-all duration-200 ease-out",
                i === idx ? "bg-primary border-primary scale-125" : "bg-background border-border hover:border-primary/50 hover:scale-110"
              )} />
              <span className={cn(
                "transition-all",
                s.key === "s" ? "text-[11px]" : s.key === "l" ? "text-[15px]" : "text-[13px]",
                i === idx ? "text-foreground font-medium" : "text-muted-foreground"
              )}>
                {t(s.labelKey)}
              </span>
            </button>
          ))}
        </div>
        <span className="text-[16px] text-muted-foreground font-medium">A</span>
      </div>
    </div>
  )
}

export { applyTheme } from "@/lib/apply-theme"
