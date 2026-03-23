"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Check, ChevronDown } from "lucide-react"
import { switchOrg as switchOrgAction } from "@/app/(clinic)/org-actions"
import { NotificationBell } from "@/components/notification-panel"
import { UserAvatarMenu } from "@/components/user-avatar-menu"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { User } from "@supabase/supabase-js"

// ── Top bar ───────────────────────────────────────────────────────────────────

export function ClinicTopBar({
  orgName,
  orgLogoUrl,
  allOrgs = [],
  activeOrgId,
}: {
  orgName: string | null
  orgLogoUrl?: string | null
  allOrgs?: { id: string; name: string; logo_url: string | null }[]
  activeOrgId?: string | null
}) {
  const router = useRouter()

  const [logoError, setLogoError]     = useState(false)
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const orgMenuRef                    = useRef<HTMLDivElement>(null)
  const [isSwitching, startSwitch]    = useTransition()
  const [user, setUser]               = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
  }, [])

  useEffect(() => {
    if (!orgMenuOpen) return
    function onMouseDown(e: MouseEvent) {
      if (orgMenuRef.current && !orgMenuRef.current.contains(e.target as Node)) setOrgMenuOpen(false)
    }
    document.addEventListener("mousedown", onMouseDown)
    return () => document.removeEventListener("mousedown", onMouseDown)
  }, [orgMenuOpen])

  return (
    <header className="hidden md:flex h-[52px] shrink-0 items-center border-b border-border bg-background px-4 gap-4">

      {/* Left: org selector */}
      {orgName && (
        allOrgs.length > 1 ? (
          <div className="relative" ref={orgMenuRef}>
            <button
              onClick={() => setOrgMenuOpen((v) => !v)}
              disabled={isSwitching}
              className="flex items-center gap-2 text-[14px] font-medium text-foreground hover:text-foreground/80 transition-colors disabled:opacity-60"
            >
              {orgLogoUrl && !logoError && (
                <img src={orgLogoUrl} alt="" className="h-8 w-auto max-w-[80px] object-contain rounded shrink-0" onError={() => setLogoError(true)} />
              )}
              {orgName}
              <ChevronDown className="size-3.5 opacity-50" />
            </button>
            {orgMenuOpen && (
              <div className="absolute left-0 top-9 z-50 w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
                {allOrgs.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      if (org.id === activeOrgId) { setOrgMenuOpen(false); return }
                      setOrgMenuOpen(false)
                      localStorage.setItem("activeOrgId", org.id)
                      startSwitch(async () => {
                        await switchOrgAction(org.id)
                        window.location.href = "/"
                      })
                    }}
                    className={cn(
                      "flex items-center gap-2 w-full px-4 py-2.5 text-[14px] text-left transition-colors",
                      org.id === activeOrgId
                        ? "bg-accent text-accent-foreground font-medium"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    {org.name}
                    {org.id === activeOrgId && <Check className="size-3.5 ml-auto" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {orgLogoUrl && !logoError && (
              <img src={orgLogoUrl} alt="" className="h-8 w-auto max-w-[80px] object-contain rounded shrink-0" onError={() => setLogoError(true)} />
            )}
            <span className="text-[14px] font-medium text-foreground">{orgName}</span>
          </div>
        )
      )}

      <div className="flex-1" />

      {/* Right: bell + avatar */}
      <div className="flex items-center gap-3">
        <NotificationBell />
        {user && <UserAvatarMenu user={user} />}
      </div>
    </header>
  )
}
