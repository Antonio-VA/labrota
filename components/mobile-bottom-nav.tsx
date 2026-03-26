"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { CalendarDays, Users, Briefcase, UserCircle } from "lucide-react"
import { useCanEdit } from "@/lib/role-context"
import { cn } from "@/lib/utils"

const NAV_ITEMS_FULL = [
  { key: "schedule", icon: CalendarDays, href: "/" },
  { key: "staff",    icon: Users,        href: "/staff" },
  { key: "leaves",   icon: Briefcase,    href: "/leaves" },
  { key: "account",  icon: UserCircle,   href: "/settings" },
] as const

const NAV_ITEMS_VIEWER = [
  { key: "schedule", icon: CalendarDays, href: "/" },
  { key: "leaves",   icon: Briefcase,    href: "/leaves" },
  { key: "account",  icon: UserCircle,   href: "/settings" },
] as const

export function MobileBottomNav() {
  const t = useTranslations("nav")
  const pathname = usePathname()
  const canEdit = useCanEdit()

  const items = canEdit ? NAV_ITEMS_FULL : NAV_ITEMS_VIEWER

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden bg-background border-t border-border">
      <div className="flex items-center justify-around h-14">
        {items.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href)
          return (
            <a
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 py-1.5 px-3 transition-colors",
                isActive ? "text-primary" : "text-muted-foreground"
              )}
            >
              <item.icon className="size-5" />
              <span className="text-[10px] font-medium leading-none">{t(item.key)}</span>
            </a>
          )
        })}
      </div>
      {/* Safe area padding for iPhone home indicator */}
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </nav>
  )
}
