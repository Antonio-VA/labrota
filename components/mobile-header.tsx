"use client"

import { useState, useRef, useEffect, useTransition } from "react"
import Image from "next/image"
import { ChevronLeft, ChevronRight, ChevronDown, Check, Star, Bell, User } from "lucide-react"
import { switchOrg as switchOrgAction, setDefaultOrg } from "@/app/(clinic)/org-actions"
import { NotificationBell } from "@/components/notification-panel"
import { SwapBell } from "@/components/swap-panel"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { MobileAccountSheet } from "@/components/mobile-account-sheet"
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
  const [accountSheetOpen, setAccountSheetOpen] = useState(false)
  const [isSwitching, startSwitch] = useTransition()
  const [switchingTo, setSwitchingTo] = useState<string | null>(null)
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
      <header id="mobile-header" className="flex lg:hidden h-14 shrink-0 items-center px-3 gap-2.5" style={{ backgroundColor: "var(--header-bg)" }}>
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
            <Image src={orgLogoUrl} alt="" width={28} height={28} className="size-7 object-cover rounded-md shrink-0 border-[1.5px] border-white/40" onError={() => setLogoError(true)} />
          ) : (
            <span className="size-7 rounded-lg bg-white/15 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
              {orgInitials}
            </span>
          )}
          <span className="text-[15px] font-medium text-white">{orgName ?? ""}</span>
          {hasMultipleOrgs && <ChevronDown className="size-3.5 text-white/60 shrink-0" />}
        </button>

        <div className="flex-1" />

        {/* Right: notifications + account — white icons on navy */}
        <div className="flex items-center gap-3 [&_button]:text-white/70 [&_button:hover]:text-white">
          <SwapBell large />
          <NotificationBell large />
          <button
            onClick={() => setAccountSheetOpen(true)}
            className="size-11 flex items-center justify-center rounded-full text-white/70 hover:text-white active:bg-white/10 transition-colors"
          >
            <User className="size-6" />
          </button>
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
                      setSwitchingTo(org.name)
                      setSheetOpen(false)
                      startSwitch(async () => {
                        await switchOrgAction(org.id)
                        sessionStorage.removeItem("labrota_current_date")
                        sessionStorage.removeItem("labrota_view")
                        window.location.href = "/?_=" + Date.now()
                      })
                    }}
                    className="flex items-center gap-3 flex-1 min-w-0 text-left"
                  >
                    {org.logo_url ? (
                      <>
                        <Image src={org.logo_url} alt="" width={32} height={32} className="h-8 w-8 rounded-lg object-cover shrink-0" onError={(e) => { (e.currentTarget as HTMLElement).style.display = "none"; ((e.currentTarget as HTMLElement).nextElementSibling as HTMLElement)?.style.removeProperty("display") }} />
                        <span className="size-8 rounded-lg bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0" style={{ display: "none" }}>
                          {initials}
                        </span>
                      </>
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

      <MobileAccountSheet open={accountSheetOpen} onClose={() => setAccountSheetOpen(false)} />

      {/* Full-screen loading overlay when switching org */}
      {switchingTo && (
        <div className="fixed inset-0 z-[100] bg-background/90 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="size-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-[14px] font-medium text-foreground">{switchingTo}</p>
        </div>
      )}
    </>
  )
}
