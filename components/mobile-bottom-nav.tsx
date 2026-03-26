"use client"

import { usePathname } from "next/navigation"
import { useLocale } from "next-intl"
import { CalendarDays, CalendarRange, Briefcase, User } from "lucide-react"
import { useCanEdit } from "@/lib/role-context"
import { cn } from "@/lib/utils"
import { useState, useEffect, useRef } from "react"

const NAV_ITEMS_FULL = [
  { key: "day",     icon: CalendarDays,   href: "/" },
  { key: "week",    icon: CalendarRange,  href: "/mobile-week" },
  { key: "leaves",  icon: Briefcase,      href: "/leaves" },
  { key: "account", icon: User,           href: "/mobile-account" },
] as const

const NAV_ITEMS_VIEWER = [
  { key: "day",     icon: CalendarDays,   href: "/" },
  { key: "leaves",  icon: Briefcase,      href: "/leaves" },
  { key: "account", icon: User,           href: "/mobile-account" },
] as const

const LABELS: Record<string, Record<string, string>> = {
  es: { day: "Día", week: "Semana", leaves: "Ausencias", account: "Cuenta" },
  en: { day: "Day", week: "Week", leaves: "Leave", account: "Account" },
}

export function MobileBottomNav() {
  const locale = useLocale() as "es" | "en"
  const pathname = usePathname()
  const canEdit = useCanEdit()
  const [visible, setVisible] = useState(true)
  const lastScrollY = useRef(0)

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY
      if (y > lastScrollY.current + 8 && y > 40) {
        setVisible(false)
      } else if (y < lastScrollY.current - 4) {
        setVisible(true)
      }
      lastScrollY.current = y
    }
    // Also listen on all scrollable containers
    const els = document.querySelectorAll("[class*='overflow-auto'], [class*='overflow-y-auto']")
    const handlers: Array<() => void> = []
    els.forEach((el) => {
      const h = () => {
        const y = el.scrollTop
        if (y > lastScrollY.current + 8 && y > 40) setVisible(false)
        else if (y < lastScrollY.current - 4) setVisible(true)
        lastScrollY.current = y
      }
      el.addEventListener("scroll", h, { passive: true })
      handlers.push(() => el.removeEventListener("scroll", h))
    })
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      window.removeEventListener("scroll", onScroll)
      handlers.forEach((h) => h())
    }
  }, [])

  const items = canEdit ? NAV_ITEMS_FULL : NAV_ITEMS_VIEWER

  return (
    <div
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-40 md:hidden transition-all duration-300 ease-out",
        visible ? "bottom-5 opacity-100" : "bottom-[-80px] opacity-0"
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <nav className="flex items-center gap-0.5 px-2 py-2 rounded-[20px] glass-nav">
        {items.map((item) => {
          const isActive = item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href)

          return (
            <a
              key={item.key}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-[3px] py-2 px-4 rounded-2xl transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground active:bg-muted/40"
              )}
            >
              <item.icon className="size-[22px]" strokeWidth={isActive ? 2.2 : 1.7} />
              <span className={cn(
                "text-[11px] leading-none",
                isActive ? "font-semibold" : "font-medium"
              )}>
                {LABELS[locale]?.[item.key] ?? LABELS.en[item.key] ?? item.key}
              </span>
            </a>
          )
        })}
      </nav>
    </div>
  )
}
