"use client"

import { usePathname, useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { CalendarDays, CalendarRange } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect, useRef, useCallback } from "react"

const NAV_ITEMS = [
  { key: "day",  icon: CalendarDays,  href: "/" },
  { key: "week", icon: CalendarRange, href: "/mobile-week" },
] as const

const LABELS: Record<string, Record<string, string>> = {
  es: { day: "Día", week: "Semana" },
  en: { day: "Day", week: "Week" },
}

export function MobileBottomNav() {
  const locale = useLocale() as "es" | "en"
  const pathname = usePathname()
  const [visible, setVisible] = useState(true)
  const lastScrollY = useRef(0)

  useEffect(() => {
    function onScroll() {
      const y = window.scrollY
      if (y > lastScrollY.current + 8 && y > 40) setVisible(false)
      else if (y < lastScrollY.current - 4) setVisible(true)
      lastScrollY.current = y
    }
    const els = document.querySelectorAll("[class*='overflow-auto'], [class*='overflow-y-auto']")
    const cleanups: Array<() => void> = []
    els.forEach((el) => {
      const h = () => {
        const y = el.scrollTop
        if (y > lastScrollY.current + 8 && y > 40) setVisible(false)
        else if (y < lastScrollY.current - 4) setVisible(true)
        lastScrollY.current = y
      }
      el.addEventListener("scroll", h, { passive: true })
      cleanups.push(() => el.removeEventListener("scroll", h))
    })
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => { window.removeEventListener("scroll", onScroll); cleanups.forEach((c) => c()) }
  }, [])

  const router = useRouter()
  const [tapped, setTapped] = useState<string | null>(null)
  useEffect(() => { setTapped(null) }, [pathname])

  return (
    <div
      className={cn(
        "fixed right-4 z-40 lg:hidden transition-all duration-300 ease-out",
        visible ? "bottom-3 opacity-100" : "bottom-[-80px] opacity-0",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <nav className="flex items-center gap-0 px-2.5 py-1 rounded-full glass-nav-pop">
        {NAV_ITEMS.map((item) => {
          const isActive = (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) || tapped === item.key
          return (
            <button
              key={item.key}
              onClick={() => {
                setTapped(item.key)
                router.push(item.href)
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-[2px] w-[70px] py-2 rounded-full transition-colors duration-100",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground active:text-primary active:bg-primary/10"
              )}
            >
              {item.key === "day" ? (
                <div className="relative size-6 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 1.8 : 1.4} strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className={cn("relative top-[3px] text-[10px] font-bold leading-none", isActive ? "text-primary" : "text-muted-foreground")}>
                    {new Date().getDate()}
                  </span>
                </div>
              ) : (
                <item.icon className="size-[22px]" strokeWidth={isActive ? 2.2 : 1.7} />
              )}
              <span className={cn("text-[11px] leading-none", isActive ? "font-semibold" : "font-medium")}>
                {LABELS[locale]?.[item.key] ?? item.key}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
