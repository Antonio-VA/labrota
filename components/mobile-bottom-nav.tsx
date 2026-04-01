"use client"

import { usePathname, useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { CalendarDays, CalendarRange, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect, useRef, useCallback } from "react"
import { useCanEdit, useViewerStaffId } from "@/lib/role-context"

type NavItem = { key: string; icon: React.ElementType; href: string }

const BASE_ITEMS: NavItem[] = [
  { key: "day",  icon: CalendarDays,  href: "/" },
  { key: "week", icon: CalendarRange, href: "/mobile-week" },
]

const LEAVES_ITEM: NavItem = { key: "leaves", icon: Briefcase, href: "/leaves" }

const LABELS: Record<string, Record<string, string>> = {
  es: { day: "Día", week: "Semana", leaves: "Ausencias" },
  en: { day: "Day", week: "Week", leaves: "Leave" },
}

export function MobileBottomNav() {
  const locale = useLocale() as "es" | "en"
  const pathname = usePathname()
  const canEdit = useCanEdit()
  const viewerStaffId = useViewerStaffId()

  const showLeaves = canEdit || !!viewerStaffId
  const navItems = showLeaves ? [...BASE_ITEMS, LEAVES_ITEM] : BASE_ITEMS
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
  const [activeKey, setActiveKey] = useState<string | null>(null)
  useEffect(() => { setActiveKey(null) }, [pathname])

  const handleTap = useCallback((key: string, href: string) => {
    setActiveKey(key)
    router.push(href)
  }, [router])

  return (
    <div
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-40 lg:hidden transition-all duration-300 ease-out",
        visible ? "bottom-3 opacity-100" : "bottom-[-90px] opacity-0",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <nav className="flex items-center gap-0 px-4 py-2 rounded-full glass-nav-pop">
        {navItems.map((item) => {
          const routeActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const isActive = activeKey ? activeKey === item.key : routeActive
          return (
            <button
              key={item.key}
              onTouchStart={() => handleTap(item.key, item.href)}
              onClick={(e) => {
                if (activeKey === item.key) return
                handleTap(item.key, item.href)
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-1 w-[80px] py-1.5 rounded-full transition-none",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
              )}
            >
              {item.key === "day" ? (
                <div className="relative size-[26px]">
                  <svg width="26" height="26" viewBox="0 0 26 26" fill="none" stroke="currentColor" strokeWidth={isActive ? 1.7 : 1.3} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3.5" width="20" height="20" rx="3" />
                    <line x1="3" y1="10" x2="23" y2="10" />
                  </svg>
                  <span className={cn(
                    "absolute left-0 right-0 flex items-center justify-center text-[10px] font-bold leading-none tabular-nums",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )} style={{ top: "10px", height: "13.5px" }}>
                    {new Date().getDate()}
                  </span>
                </div>
              ) : (
                <item.icon className="size-[26px]" strokeWidth={isActive ? 2 : 1.5} />
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
