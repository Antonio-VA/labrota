"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { LogOut, UserCog, HelpCircle } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AccountPanel } from "@/components/account-panel"
import { SupportModal } from "@/components/support-modal"
import type { User } from "@supabase/supabase-js"

interface InitialUser {
  email: string | null
  fullName: string | null
  avatarUrl: string | null
}

export function UserAvatarMenu({ initialUser }: { initialUser: InitialUser }) {
  const t = useTranslations("nav")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [fullUser, setFullUser] = useState<User | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  // Lazy-load full User only when account panel is needed
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
      <button
        onClick={() => setOpen((o) => !o)}
        className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-semibold shrink-0 overflow-hidden hover:opacity-90 transition-opacity"
        title={firstName}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-48 rounded-xl border border-border bg-background shadow-lg overflow-hidden">
          <div className="px-3 py-2.5 border-b border-border">
            <p className="text-[13px] font-medium truncate">{firstName}</p>
            <p className="text-[11px] text-muted-foreground truncate">{initialUser.email}</p>
          </div>
          <button
            onClick={openAccount}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left hover:bg-muted/50 transition-colors"
          >
            <UserCog className="size-3.5" />
            Mi cuenta
          </button>
          <button
            onClick={() => { setOpen(false); setSupportOpen(true) }}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left hover:bg-muted/50 transition-colors"
          >
            <HelpCircle className="size-3.5" />
            Soporte
          </button>
          <button
            onClick={() => { setOpen(false); signOut() }}
            className="flex items-center gap-2 w-full px-3 py-2 text-[13px] text-left text-destructive hover:bg-destructive/5 transition-colors"
          >
            <LogOut className="size-3.5" />
            {t("signOut")}
          </button>
        </div>
      )}

      <AccountPanel open={accountOpen} onClose={() => setAccountOpen(false)} user={fullUser} />
      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
    </div>
  )
}
