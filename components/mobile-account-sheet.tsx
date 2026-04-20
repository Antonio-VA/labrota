"use client"

import { useState, useTransition, useEffect } from "react"
import Image from "next/image"
import { useTranslations } from "next-intl"
import { Sun, Moon, Monitor, LogOut, Cloud, Unplug, RefreshCw, X } from "lucide-react"
import { cn, getInitials } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import {
  getUserProfile, getUserPreferences, getUserOutlookStatus,
  type UserPreferences, type UserOutlookStatus,
} from "@/app/(clinic)/account-actions"
import { syncOutlookForStaff, disconnectOutlook } from "@/app/(clinic)/leaves/outlook-actions"
import { useUserPreferences, resolvePrefs } from "@/hooks/use-user-preferences"
import { toast } from "sonner"
import { Sheet, SheetContent } from "@/components/ui/sheet"

// Module-level cache — profile/prefs rarely change within a session
type AccountCache = {
  user: { email: string | null; fullName: string | null; avatarUrl: string | null } | null
  prefs: UserPreferences
  outlook: UserOutlookStatus | null
}
let _accountCache: AccountCache | null = null

const ACCENT_COLORS = [
  "#1b4f8a", "#2563EB", "#3B82F6",
  "#0D9488", "#059669", "#16A34A", "#65A30D",
  "#EA580C", "#DC2626", "#64748B",
]

interface MobileAccountSheetProps {
  open: boolean
  onClose: () => void
}

export function MobileAccountSheet({ open, onClose }: MobileAccountSheetProps) {
  const t = useTranslations("account")
  const [isPending, startTransition] = useTransition()
  const [avatarImgError, setAvatarImgError] = useState(false)
  const [user, setUser] = useState(_accountCache?.user ?? null)
  const [outlook, setOutlook] = useState(_accountCache?.outlook ?? null)
  const [loading, setLoading] = useState(!_accountCache)
  const [loaded, setLoaded] = useState(!!_accountCache)

  const { prefs, update } = useUserPreferences(resolvePrefs(_accountCache?.prefs))

  // Fetch data when sheet opens (once per session; re-seeds from module cache on remount)
  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-open */
  useEffect(() => {
    if (!open || loaded) return
    setLoading(true)
    Promise.all([getUserProfile(), getUserPreferences(), getUserOutlookStatus()]).then(([u, p, o]) => {
      const resolvedPrefs = resolvePrefs(p)
      _accountCache = { user: u, prefs: resolvedPrefs, outlook: o }
      setUser(u)
      update(resolvedPrefs, { persist: false })
      setOutlook(o)
      setLoading(false)
      setLoaded(true)
    })
  }, [open, loaded, update])
  /* eslint-enable react-hooks/set-state-in-effect */

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  const initials = getInitials(user?.fullName) ?? user?.email?.[0]?.toUpperCase() ?? "?"

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="p-0 flex flex-col w-full max-w-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0 border-b border-border">
          <button
            onClick={onClose}
            className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-muted"
          >
            <X className="size-4" />
          </button>
          <span className="text-[15px] font-semibold">
            {t("settings")}
          </span>
          <div className="size-8" aria-hidden />
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-3 px-4 py-3 animate-pulse">
              <div className="h-14 rounded-xl bg-muted" />
              <div className="h-[180px] rounded-xl bg-muted" />
              <div className="h-24 rounded-xl bg-muted" />
            </div>
          ) : (
            <div className="flex flex-col gap-3 px-4 py-3 pb-10">

              {/* Profile */}
              <div className="flex items-center gap-3 py-1">
                {user?.avatarUrl && !avatarImgError ? (
                  <Image src={user.avatarUrl} alt="" width={44} height={44} className="size-11 rounded-full object-cover shrink-0" onError={() => setAvatarImgError(true)} />
                ) : (
                  <div className="size-11 rounded-full bg-primary/10 text-primary text-[16px] font-bold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold truncate">{user?.fullName ?? user?.email ?? "—"}</p>
                  {user?.fullName && user.email && (
                    <p className="text-[12px] text-muted-foreground truncate">{user.email}</p>
                  )}
                </div>
              </div>

              {/* Preferences card */}
              <div className="rounded-xl border border-border bg-background overflow-hidden">

                {/* Appearance */}
                <div className="px-4 pt-3 pb-2.5">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
                    {t("appearance")}
                  </p>
                  <div className="flex items-center gap-1">
                    {[
                      { key: "light" as const, icon: Sun, label: t("themeLight") },
                      { key: "dark" as const, icon: Moon, label: t("themeDark") },
                      { key: "auto" as const, icon: Monitor, label: "Auto" },
                    ].map(({ key, icon: Icon, label }) => (
                      <button
                        key={key}
                        onClick={() => update({ theme: key })}
                        className={cn(
                          "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium transition-colors",
                          prefs.theme === key ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-muted"
                        )}
                      >
                        <Icon className="size-3.5" />{label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border mx-4" />

                {/* Accent color */}
                <div className="px-4 pt-3 pb-2.5">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
                    {t("accentColor")}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {ACCENT_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => update({ accentColor: c })}
                        className={cn(
                          "size-7 rounded-full transition-all",
                          prefs.accentColor === c ? "ring-2 ring-offset-1 ring-primary" : "ring-1 ring-border"
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="h-px bg-border mx-4" />

                {/* Language */}
                <div className="px-4 pt-3 pb-2.5">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
                    {t("language")}
                  </p>
                  <div className="flex items-center gap-1">
                    {[
                      { key: "browser" as const, label: t("browserLocale") },
                      { key: "es" as const, label: "Español" },
                      { key: "en" as const, label: "English" },
                    ].map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => update({ locale: key })}
                        className={cn(
                          "flex-1 py-2 rounded-lg text-[12px] font-medium text-center transition-colors",
                          prefs.locale === key ? "bg-primary/10 text-primary" : "text-muted-foreground active:bg-muted"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Outlook */}
                {outlook?.available && (
                  <>
                    <div className="h-px bg-border mx-4" />
                    <div className="px-4 pt-3 pb-2.5">
                      <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-2">
                        {t("outlookSyncTitle")}
                      </p>
                      {outlook.connected ? (
                        <div className="flex items-center gap-2">
                          <div className="size-7 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center shrink-0">
                            <Cloud className="size-3.5 text-emerald-600 dark:text-emerald-400" />
                          </div>
                          <p className="text-[12px] font-medium flex-1 min-w-0 truncate">
                            {outlook.email ?? t("connected")}
                          </p>
                          <button
                            onClick={() => {
                              if (!outlook.staffId) return
                              startTransition(async () => {
                                const r = await syncOutlookForStaff(outlook.staffId!)
                                if (r.errors.length > 0) toast.error(r.errors[0])
                                else toast.success(t("leavesSynced", { count: r.created + r.updated }))
                                getUserOutlookStatus().then(setOutlook)
                              })
                            }}
                            disabled={isPending}
                            className="p-1.5 rounded-lg active:bg-muted text-muted-foreground"
                          >
                            <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
                          </button>
                          <button
                            onClick={() => {
                              if (!outlook.staffId) return
                              startTransition(async () => {
                                await disconnectOutlook(outlook.staffId!, true)
                                toast.success(t("outlookDisconnected"))
                                getUserOutlookStatus().then(setOutlook)
                              })
                            }}
                            disabled={isPending}
                            className="p-1.5 rounded-lg active:bg-muted text-muted-foreground"
                          >
                            <Unplug className="size-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            if (outlook.staffId && outlook.orgId) {
                              window.location.href = `/api/outlook-auth?staffId=${outlook.staffId}&orgId=${outlook.orgId}`
                            }
                          }}
                          className="flex items-center gap-2 w-full rounded-lg border border-dashed border-border px-3 py-2.5 active:bg-muted/50"
                        >
                          <Cloud className="size-3.5 text-primary shrink-0" />
                          <p className="text-[12px] font-medium">
                            {t("connectOutlook")}
                          </p>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Support + Sign out */}
              <div className="rounded-xl border border-border bg-background overflow-hidden">
                <a
                  href="mailto:support@labrota.app"
                  className="flex items-center px-4 py-3.5 text-[14px] text-muted-foreground active:bg-muted border-b border-border"
                >
                  {t("support")}
                </a>
                <button
                  onClick={signOut}
                  className="flex items-center gap-2 w-full px-4 py-3.5 text-[14px] font-medium text-destructive active:bg-destructive/5"
                >
                  <LogOut className="size-4" />
                  {t("signOut")}
                </button>
              </div>

            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
