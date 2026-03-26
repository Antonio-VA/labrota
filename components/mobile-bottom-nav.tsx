"use client"

import { usePathname } from "next/navigation"
import { useLocale } from "next-intl"
import { CalendarDays, CalendarRange } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect, useRef, useCallback } from "react"

const NAV_ITEMS = [
  { key: "week", icon: CalendarRange, href: "/mobile-week" },
  { key: "day",  icon: CalendarDays,  href: "/" },
] as const

const LABELS: Record<string, Record<string, string>> = {
  es: { day: "Día", week: "Semana" },
  en: { day: "Day", week: "Week" },
}

export function MobileBottomNav() {
  const locale = useLocale() as "es" | "en"
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const [docked, setDocked] = useState(false)
  const lastScrollY = useRef(0)

  const checkScroll = useCallback((scrollEl: Element | Window) => {
    let y: number, maxY: number
    if (scrollEl === window) {
      y = window.scrollY
      maxY = document.documentElement.scrollHeight - window.innerHeight
    } else {
      const el = scrollEl as Element
      y = el.scrollTop
      maxY = el.scrollHeight - el.clientHeight
    }
    const atBottom = maxY > 0 && y >= maxY - 10
    setDocked(atBottom)
    if (atBottom) {
      setVisible(true)
    } else if (y > lastScrollY.current + 8 && y > 40) {
      setVisible(false)
    } else if (y < lastScrollY.current - 4) {
      setVisible(true)
    }
    lastScrollY.current = y
  }, [])

  useEffect(() => {
    const onWindowScroll = () => checkScroll(window)
    window.addEventListener("scroll", onWindowScroll, { passive: true })
    const els = document.querySelectorAll("[class*='overflow-auto'], [class*='overflow-y-auto']")
    const cleanups: Array<() => void> = []
    els.forEach((el) => {
      const h = () => checkScroll(el)
      el.addEventListener("scroll", h, { passive: true })
      cleanups.push(() => el.removeEventListener("scroll", h))
    })
    return () => {
      window.removeEventListener("scroll", onWindowScroll)
      cleanups.forEach((c) => c())
    }
  }, [checkScroll])

  const navContent = NAV_ITEMS.map((item) => {
    const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
    return (
      <a
        key={item.key}
        href={item.href}
        className={cn(
          "flex flex-col items-center justify-center gap-[3px] w-16 py-2 rounded-2xl transition-all duration-200",
          isActive
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground active:bg-muted/40"
        )}
      >
        <item.icon className="size-[22px]" strokeWidth={isActive ? 2.2 : 1.7} />
        <span className={cn("text-[11px] leading-none", isActive ? "font-semibold" : "font-medium")}>
          {LABELS[locale]?.[item.key] ?? item.key}
        </span>
      </a>
    )
  })

  return (
    <div
      className={cn(
        "fixed z-40 md:hidden transition-all duration-300 ease-out",
        docked ? "bottom-0 left-0 right-0" : "left-1/2 -translate-x-1/2",
        !docked && !visible && "bottom-[-80px] opacity-0",
        !docked && visible && "bottom-3 opacity-100",
      )}
      style={!docked ? { paddingBottom: "env(safe-area-inset-bottom, 0px)" } : undefined}
    >
      <nav className={cn(
        "flex items-center glass-nav transition-all duration-300",
        docked ? "justify-around py-1.5 rounded-none" : "gap-1 px-2 py-2 rounded-[20px]"
      )}>
        {navContent}
      </nav>
      {docked && <div className="h-[env(safe-area-inset-bottom,0px)] glass-nav" style={{ borderRadius: 0 }} />}
    </div>
  )
}
