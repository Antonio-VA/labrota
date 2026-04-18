"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { CalendarDays, Users, Briefcase, FlaskConical, BarChart3, Settings } from "lucide-react"
import { getUserPreferences } from "@/app/(clinic)/account-actions"
import { useCanEdit, useViewerStaffId } from "@/lib/role-context"
import { cn } from "@/lib/utils"
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
      <div className="flex flex-col items-center gap-1.5 py-3 mx-2 rounded-[10px] cursor-not-allowed">
        <Icon className="size-5 text-slate-300" />
        <span className="text-[11px] font-medium text-slate-300 leading-none">{label}</span>
      </div>
    )
  }

  return (
    <a
      href={href}
      className={cn(
        "flex flex-col items-center gap-1.5 py-3 mx-2 rounded-[10px] transition-colors",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="size-5" />
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </a>
  )
}


// ── Sidebar ───────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const t        = useTranslations("nav")
  const pathname = usePathname()

  const [_user, setUser]              = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      // Apply accent color + font scale only — do NOT touch data-theme here,
      // SSR + the inline <script> in layout.tsx already set it correctly.
      // Calling applyTheme here would flash the theme on every navigation.
      if (data.user) {
        getUserPreferences().then((prefs) => {
          const root = document.documentElement
          if (prefs.accentColor) {
            root.style.setProperty("--primary", prefs.accentColor)
            root.style.setProperty("--ring", prefs.accentColor)
            root.style.setProperty("--sidebar-primary", prefs.accentColor)
            root.style.setProperty("--sidebar-ring", prefs.accentColor)
            root.style.setProperty("--header-bg", prefs.accentColor)
          }
          if (prefs.fontScale && prefs.fontScale !== "m") {
            const scale = prefs.fontScale === "s" ? "0.9" : prefs.fontScale === "l" ? "1.1" : "1"
            root.style.setProperty("--font-scale", scale)
            root.style.fontSize = `calc(14px * ${scale})`
          }
        })
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  const canEdit = useCanEdit()
  const viewerStaffId = useViewerStaffId()

  const navItems = canEdit ? [
    { key: "schedule", icon: CalendarDays, href: "/schedule" },
    { key: "lab",      icon: FlaskConical, href: "/lab" },
    { key: "staff",    icon: Users,        href: "/staff" },
    { key: "leaves",   icon: Briefcase,        href: "/leaves" },
    { key: "reports",  icon: BarChart3,    href: "/reports" },
    { key: "settings", icon: Settings,     href: "/settings" },
  ] as const : viewerStaffId ? [
    { key: "schedule", icon: CalendarDays, href: "/schedule" },
    { key: "leaves",   icon: Briefcase,        href: "/leaves" },
  ] as const : [
    { key: "schedule", icon: CalendarDays, href: "/schedule" },
  ] as const

  return (
    <nav className="hidden lg:flex flex-col w-20 h-full border-r border-border bg-background shrink-0">
        {/* Nav items */}
        <div className="flex flex-col gap-1 py-3 flex-1">
          {navItems.map((item) => {
            const isActive = item.href === "/schedule"
              ? pathname === "/schedule"
              : pathname.startsWith(item.href)
            return (
              <NavItem
                key={item.key}
                href={item.href}
                icon={item.icon}
                label={t(item.key)}
                isActive={isActive}
                disabled={"disabled" in item ? !!(item as { disabled?: boolean }).disabled : false}
              />
            )
          })}
        </div>
      <div className="flex flex-col items-center gap-2 pb-3">
        <span className="text-[17px] leading-none" style={{ color: "var(--muted-foreground)", opacity: 0.35, textShadow: "0 1px 0 rgba(255,255,255,0.4), 0 -1px 0 rgba(0,0,0,0.1)" }}>
          <span className="font-light">lab</span><span className="font-medium">rota</span>
        </span>
      </div>
    </nav>
  )
}
