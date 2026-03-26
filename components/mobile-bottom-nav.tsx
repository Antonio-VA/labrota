"use client"

import { usePathname } from "next/navigation"
import { useLocale } from "next-intl"
import { CalendarDays, CalendarRange, Palmtree, User } from "lucide-react"
import { useCanEdit } from "@/lib/role-context"
import { cn } from "@/lib/utils"

const NAV_ITEMS_FULL = [
  { key: "day",     icon: CalendarDays,  href: "/" },
  { key: "week",    icon: CalendarRange,  href: "/mobile-week" },
  { key: "leaves",  icon: Palmtree,      href: "/leaves" },
  { key: "account", icon: User,          href: "/mobile-account" },
] as const

const NAV_ITEMS_VIEWER = [
  { key: "day",     icon: CalendarDays,  href: "/" },
  { key: "leaves",  icon: Palmtree,      href: "/leaves" },
  { key: "account", icon: User,          href: "/mobile-account" },
] as const

const LABELS: Record<string, Record<string, string>> = {
  es: { day: "Día", week: "Semana", leaves: "Ausencias", account: "Cuenta" },
  en: { day: "Day", week: "Week", leaves: "Leave", account: "Account" },
}

export function MobileBottomNav() {
  const locale = useLocale() as "es" | "en"
  const pathname = usePathname()
  const canEdit = useCanEdit()

  const items = canEdit ? NAV_ITEMS_FULL : NAV_ITEMS_VIEWER

  return (
    <>
      {/* Spacer */}
      <div className="h-20 md:hidden shrink-0" />

      {/* Floating glass pill */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 md:hidden pb-[env(safe-area-inset-bottom,0px)]">
        <nav className="flex items-center gap-0.5 px-1.5 py-1.5 rounded-2xl glass-nav">
          {items.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)

            return (
              <a
                key={item.key}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-[3px] py-1.5 px-3.5 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground active:bg-muted/50"
                )}
              >
                <item.icon className="size-5" strokeWidth={isActive ? 2.2 : 1.8} />
                <span className={cn(
                  "text-[10px] leading-none",
                  isActive ? "font-semibold" : "font-medium"
                )}>
                  {LABELS[locale]?.[item.key] ?? LABELS.en[item.key] ?? item.key}
                </span>
              </a>
            )
          })}
        </nav>
      </div>
    </>
  )
}
