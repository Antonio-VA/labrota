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

  // Show leaves tab for admins/managers, or viewers with a linked staff
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
  // Tracks which button the user tapped — lights up instantly, clears when route resolves
  const [activeKey, setActiveKey] = useState<string | null>(null)
  useEffect(() => { setActiveKey(null) }, [pathname])

  const handleTap = useCallback((key: string, href: string) => {
    // Instant visual switch: set active key synchronously before navigation
    setActiveKey(key)
    router.push(href)
  }, [router])

  return (
    <div
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-40 lg:hidden transition-all duration-300 ease-out",
        visible ? "bottom-3 opacity-100" : "bottom-[-80px] opacity-0",
      )}
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <nav className="flex items-center gap-0 px-2.5 py-1.5 rounded-full glass-nav-pop">
        {navItems.map((item) => {
          // Active if: user just tapped this one, OR route matches and nothing else was tapped
          const routeActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
          const isActive = activeKey ? activeKey === item.key : routeActive
          return (
            <button
              key={item.key}
              // onTouchStart fires the instant the finger contacts — no waiting for lift
              onTouchStart={() => handleTap(item.key, item.href)}
              // onClick for non-touch (desktop fallback)
              onClick={(e) => {
                // Prevent double-fire on touch devices (touchstart already handled it)
                if (activeKey === item.key) return
                handleTap(item.key, item.href)
              }}
              className={cn(
                "flex flex-col items-center justify-center gap-[2px] w-[70px] py-2 rounded-full transition-none",
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
              )}
            >
              {item.key === "day" ? (
                <div className="relative size-6 flex items-center justify-center">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={isActive ? 1.8 : 1.4} strokeLinecap="round" strokeLinejoin="round" className="absolute inset-0">
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className={cn("relative top-[2px] text-[10px] font-bold leading-none", isActive ? "text-primary" : "text-muted-foreground")}>
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
