"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { Check, ChevronDown, Star, Loader2 } from "lucide-react"
import { switchOrg as switchOrgAction, setDefaultOrg } from "@/app/(clinic)/org-actions"
import { NotificationBell } from "@/components/notification-panel"
import { SwapBell } from "@/components/swap-panel"
import { UserAvatarMenu } from "@/components/user-avatar-menu"
import { cn } from "@/lib/utils"

interface InitialUser {
  email: string | null
  fullName: string | null
  avatarUrl: string | null
}

export function ClinicTopBar({
  orgName,
  orgLogoUrl,
  allOrgs = [],
  activeOrgId,
  defaultOrgId,
  initialUser,
}: {
  orgName: string | null
  orgLogoUrl?: string | null
  allOrgs?: { id: string; name: string; logo_url: string | null }[]
  activeOrgId?: string | null
  defaultOrgId?: string | null
  initialUser?: InitialUser | null
}) {
  const [logoError, setLogoError]     = useState(false)
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const orgMenuRef                    = useRef<HTMLDivElement>(null)
  const [isSwitching, startSwitch]    = useTransition()
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
  const [localDefault, setLocalDefault] = useState(defaultOrgId ?? null)

  useEffect(() => {
    if (!orgMenuOpen) return
    function onMouseDown(e: MouseEvent) {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) setOrgMenuOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [orgMenuOpen])

  function handleSetDefault(orgId: string) {
    const next = localDefault === orgId ? null : orgId
    setLocalDefault(next)
    setDefaultOrg(next)
  }

  return (
    <>
      <header className="hidden lg:flex h-[52px] shrink-0 items-center px-4 gap-4" style={{ backgroundColor: "var(--header-bg)" }}>

        {/* Left: org selector */}
        {orgName && (
          allOrgs.length > 1 ? (
            <div className="relative" ref={orgMenuRef}>
              <button
                onClick={() => setOrgMenuOpen((v) => !v)}
                disabled={isSwitching}
                className="flex items-center gap-2 text-[14px] font-medium text-white/90 hover:text-white hover:bg-white/15 rounded-lg px-2.5 py-1.5 -mx-2.5 -my-1.5 transition-colors disabled:opacity-60"
              >
                {orgLogoUrl && !logoError && (
                  <img src={orgLogoUrl} alt="" className="size-7 object-cover rounded-md shrink-0" style={{ border: "1.5px solid rgba(255,255,255,0.4)" }} onError={() => setLogoError(true)} />
                )}
                <span data-org-name>{switchingTo ?? orgName}</span>
                <ChevronDown className="size-3.5 text-white/60" />
              </button>
              {orgMenuOpen && (
                <div className="absolute left-0 top-9 z-50 w-60 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
                  {allOrgs.map((org) => (
                    <div
                      key={org.id}
                      className={cn(
                        "flex items-center gap-2 w-full px-4 py-2.5 text-[14px] transition-colors group/org",
                        org.id === activeOrgId
                          ? "bg-accent text-accent-foreground font-medium"
                          : "hover:bg-accent/60 text-foreground"
                      )}
                    >
                      <button
                        onClick={() => {
                          if (org.id === activeOrgId) { setOrgMenuOpen(false); return }
                          setOrgMenuOpen(false)
                          setSwitchingTo(org.name)
                          localStorage.setItem("activeOrgId", org.id)
                          startSwitch(async () => {
                            await switchOrgAction(org.id)
                            // Clear stale calendar state so the new org loads fresh
                            sessionStorage.removeItem("labrota_current_date")
                            sessionStorage.removeItem("labrota_view")
                            // Force full reload — cache-bust to prevent serving stale page
                            window.location.href = "/?_=" + Date.now()
                          })
                        }}
                        className="flex-1 text-left truncate"
                      >
                        {org.name}
                      </button>
                      {org.id === activeOrgId && <Check className="size-3.5 shrink-0 text-primary" />}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSetDefault(org.id) }}
                        className={cn(
                          "shrink-0 p-0.5",
                          localDefault === org.id ? "" : "opacity-0 group-hover/org:opacity-100 transition-opacity"
                        )}
                        title={localDefault === org.id ? "Quitar como predeterminado" : "Establecer como predeterminado"}
                      >
                        <Star className={cn(
                          "size-3.5 transition-colors",
                          localDefault === org.id
                            ? "text-amber-400 fill-amber-400"
                            : "text-muted-foreground/30 hover:text-amber-400"
                        )} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {orgLogoUrl && !logoError && (
                <img src={orgLogoUrl} alt="" className="h-8 w-auto max-w-[80px] object-contain rounded shrink-0" onError={() => setLogoError(true)} />
              )}
              <span className="text-[14px] font-medium text-white/90" data-org-name>{orgName}</span>
            </div>
          )
        )}

        <div className="flex-1" />

        {/* Right: swaps + bell + avatar */}
        <div className="flex items-center gap-3 header-icons">
          <div className="flex items-center gap-0.5">
            <SwapBell />
            <NotificationBell />
          </div>
          {initialUser && <UserAvatarMenu initialUser={initialUser} />}
        </div>
      </header>

      {/* Full-screen loading overlay when switching org */}
      {switchingTo && (
        <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center gap-3">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-[14px] font-medium text-foreground">{switchingTo}</p>
        </div>
      )}
    </>
  )
}
