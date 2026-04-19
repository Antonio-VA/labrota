"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"
import { LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

function initials(user: User): string {
  const email = user.email ?? ""
  const name = (user.user_metadata?.full_name as string | undefined) ?? ""
  if (name) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

function displayName(user: User): string {
  return (user.user_metadata?.full_name as string | undefined) ?? user.email ?? ""
}

export function UserMenu() {
  const t = useTranslations("nav")
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  if (!user) return null

  return (
    <div className="flex items-center gap-2 px-2 py-2">
      {/* Avatar */}
      <Tooltip>
        <TooltipTrigger render={
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground cursor-default">
            {initials(user)}
          </div>
        } />
        <TooltipContent side="right">{displayName(user)}</TooltipContent>
      </Tooltip>

      {/* Name / email */}
      <p className="flex-1 truncate text-[14px] text-foreground leading-tight">
        {displayName(user)}
      </p>

      {/* Sign out */}
      <Tooltip>
        <TooltipTrigger render={
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={signOut}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="size-3.5" />
          </Button>
        } />
        <TooltipContent side="right">{t("signOut")}</TooltipContent>
      </Tooltip>
    </div>
  )
}
