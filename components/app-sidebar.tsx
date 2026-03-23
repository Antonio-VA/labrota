"use client"

import { useEffect, useState, useRef } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { CalendarDays, Users, Plane, FlaskConical, BarChart3 } from "lucide-react"
import { applyTheme } from "@/components/account-panel"
import { getUserPreferences } from "@/app/(clinic)/account-actions"
import { useCanEdit } from "@/lib/role-context"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/client"
import type { User } from "@supabase/supabase-js"

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
  disabled,
}: {
  href: string
  icon: React.ElementType
  label: string
  isActive: boolean
  disabled?: boolean
}) {
  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="flex flex-col items-center gap-1.5 py-3 mx-2 rounded-[10px] cursor-not-allowed" />
          }
        >
          <Icon className="size-5 text-slate-300" />
          <span className="text-[11px] font-medium text-slate-300 leading-none">{label}</span>
        </TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <a
            href={href}
            className={cn(
              "flex flex-col items-center gap-1.5 py-3 mx-2 rounded-[10px] transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          />
        }
      >
        <Icon className="size-5" />
        <span className="text-[11px] font-medium leading-none">{label}</span>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}


// ── Sidebar ───────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const t        = useTranslations("nav")
  const pathname = usePathname()

  const [user, setUser]              = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      // Load and apply saved theme preferences
      if (data.user) {
        getUserPreferences().then((prefs) => {
          if (prefs.accentColor || prefs.theme) applyTheme(prefs)
        })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const canEdit = useCanEdit()

  const navItems = canEdit ? [
    { key: "schedule", icon: CalendarDays, href: "/" },
    { key: "staff",    icon: Users,        href: "/staff" },
    { key: "leaves",   icon: Plane,        href: "/leaves" },
    { key: "lab",      icon: FlaskConical, href: "/lab" },
    { key: "reports",  icon: BarChart3,    href: "/reports",  disabled: true },
  ] as const : [
    { key: "schedule", icon: CalendarDays, href: "/" },
  ] as const

  return (
    <nav className="hidden md:flex flex-col w-20 h-full border-r border-border bg-background shrink-0">
      <TooltipProvider delay={300}>
        {/* Nav items */}
        <div className="flex flex-col gap-1 py-3 flex-1">
          {navItems.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)
            return (
              <NavItem
                key={item.key}
                href={item.href}
                icon={item.icon}
                label={t(item.key)}
                isActive={isActive}
                disabled={"disabled" in item && item.disabled}
              />
            )
          })}
        </div>

      </TooltipProvider>
      <div className="py-3 text-center">
        <span className="text-[13px] text-muted-foreground/50 leading-none">
          <span className="font-light">lab</span><span className="font-medium">rota</span>
        </span>
      </div>
    </nav>
  )
}
