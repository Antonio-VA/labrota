"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { CalendarDays, Calendar, Briefcase, UserCircle } from "lucide-react"
import { useCanEdit } from "@/lib/role-context"
import { cn } from "@/lib/utils"

const NAV_ITEMS_FULL = [
  { key: "day",     icon: CalendarDays, href: "/" },
  { key: "week",    icon: Calendar,     href: "/?view=week" },
  { key: "leaves",  icon: Briefcase,    href: "/leaves" },
  { key: "account", icon: UserCircle,   href: "/settings" },
] as const

const NAV_ITEMS_VIEWER = [
  { key: "day",     icon: CalendarDays, href: "/" },
  { key: "leaves",  icon: Briefcase,    href: "/leaves" },
  { key: "account", icon: UserCircle,   href: "/settings" },
] as const

const LABELS: Record<string, Record<string, string>> = {
  es: { day: "Día", week: "Semana", leaves: "Ausencias", account: "Mi cuenta" },
  en: { day: "Day", week: "Week", leaves: "Leave", account: "Account" },
}

export function MobileBottomNav() {
  const t = useTranslations("nav")
  const locale = useLocale() as "es" | "en"
  const pathname = usePathname()
  const canEdit = useCanEdit()

  const items = canEdit ? NAV_ITEMS_FULL : NAV_ITEMS_VIEWER

  return (
    <>
      {/* Spacer */}
      <div className="h-20 md:hidden shrink-0" />

      {/* Floating glass pill */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 md:hidden">
        <nav
          className="flex items-center gap-1 px-2 py-1.5 rounded-2xl glass-nav"
        >
          {items.map((item) => {
            const isActive = item.href === "/"
              ? pathname === "/" || pathname === ""
              : item.href.startsWith("/?")
              ? pathname === "/"
              : pathname.startsWith(item.href)

            return (
              <a
                key={item.key}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 px-4 rounded-xl transition-all duration-200",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground active:bg-muted/50"
                )}
              >
                <item.icon className={cn("size-[18px]", isActive && "stroke-[2.5px]")} />
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

        {/* Safe area spacer */}
        <div className="h-[env(safe-area-inset-bottom,0px)]" />
      </div>
    </>
  )
}
