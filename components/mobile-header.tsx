"use client"

import { useState, useRef, useEffect, useTransition } from "react"
import { ChevronLeft, ChevronRight, ChevronDown, Check, Star, Bell, User } from "lucide-react"
import { switchOrg as switchOrgAction, setDefaultOrg } from "@/app/(clinic)/org-actions"
import { NotificationBell } from "@/components/notification-panel"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"

interface MobileHeaderProps {
  orgName: string | null
  orgLogoUrl?: string | null
  allOrgs?: { id: string; name: string; logo_url: string | null }[]
  activeOrgId?: string | null
  defaultOrgId?: string | null
  // Date nav — controlled from parent
  dateLabel?: string
  onPrev?: () => void
  onNext?: () => void
}

export function MobileHeader({
  orgName, orgLogoUrl, allOrgs = [], activeOrgId, defaultOrgId,
  dateLabel, onPrev, onNext,
}: MobileHeaderProps) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [isSwitching, startSwitch] = useTransition()
  const [localDefault, setLocalDefault] = useState(defaultOrgId ?? null)
  const [logoError, setLogoError] = useState(false)
  const hasMultipleOrgs = allOrgs.length > 1

  function handleSetDefault(orgId: string) {
    const next = localDefault === orgId ? null : orgId
    setLocalDefault(next)
    setDefaultOrg(next)
  }

  // Org chip
  const orgInitials = orgName
    ? orgName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?"

  return (
    <>
      <header id="mobile-header" className="flex lg:hidden h-14 shrink-0 items-center border-b border-border bg-background px-3 gap-2.5">
        {/* Left: org chip */}
        <button
          onClick={() => hasMultipleOrgs && setSheetOpen(true)}
          disabled={!hasMultipleOrgs || isSwitching}
          className={cn(
            "flex items-center gap-2 min-w-0",
            hasMultipleOrgs && "active:opacity-70"
          )}
        >
          {orgLogoUrl && !logoError ? (
            <img src={orgLogoUrl} alt="" className="h-7 w-auto max-w-[56px] object-contain rounded shrink-0" onError={() => setLogoError(true)} />
          ) : (
            <span className="size-7 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
              {orgInitials}
            </span>
          )}
          <span className="text-[15px] font-medium">{orgName ?? ""}</span>
          {hasMultipleOrgs && <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />}
        </button>

        <div className="flex-1" />

        {/* Right: notifications + account */}
        <div className="flex items-center gap-1">
          <NotificationBell />
          <a
            href="/mobile-account"
            className="size-10 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:bg-muted transition-colors"
          >
            <User className="size-5" />
          </a>
        </div>
      </header>

      {/* Lab switcher bottom sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl max-h-[70dvh] p-0">
          {/* Drag handle */}
          <div className="flex justify-center py-2">
            <div className="w-8 h-1 rounded-full bg-muted-foreground/20" />
          </div>
          <p className="text-[14px] font-medium px-4 pb-2">Cambiar laboratorio</p>
          <div className="overflow-y-auto pb-[env(safe-area-inset-bottom,8px)]">
            {allOrgs.map((org) => {
              const isActive = org.id === activeOrgId
              const isDefault = localDefault === org.id
              const initials = org.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
              return (
                <div
                  key={org.id}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 transition-colors active:bg-accent",
                    isActive && "bg-accent/50"
                  )}
                >
                  <button
                    onClick={() => {
                      if (isActive) { setSheetOpen(false); return }
                      setSheetOpen(false)
                      startSwitch(async () => {
                        await switchOrgAction(org.id)
                        window.location.href = "/"
                      })
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    {org.logo_url ? (
                      <img src={org.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover shrink-0" />
                    ) : (
                      <span className="size-8 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                        {initials}
                      </span>
                    )}
                    <span className="text-[14px] font-medium truncate">{org.name}</span>
                  </button>
                  {isActive && <Check className="size-4 text-primary shrink-0" />}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleSetDefault(org.id) }}
                    className="shrink-0 p-1"
                  >
                    <Star className={cn(
                      "size-4 transition-colors",
                      isDefault ? "text-amber-400 fill-amber-400" : "text-muted-foreground/40"
                    )} />
                  </button>
                </div>
              )
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
