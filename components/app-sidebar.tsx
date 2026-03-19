"use client"

import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import { CalendarDays, Users, Plane, FlaskConical, BarChart3, Settings } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"

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
            <div className="flex flex-col items-center gap-1 py-2.5 mx-2 rounded-[8px] cursor-not-allowed" />
          }
        >
          <Icon className="size-6 text-slate-300" />
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
              "flex flex-col items-center gap-1 py-2.5 mx-2 rounded-[8px] transition-colors",
              isActive
                ? "bg-blue-100 text-blue-700"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
            )}
          />
        }
      >
        <Icon className="size-6" />
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

  const navItems = [
    { key: "schedule", icon: CalendarDays, href: "/" },
    { key: "staff",    icon: Users,        href: "/staff" },
    { key: "leaves",   icon: Plane,        href: "/leaves" },
    { key: "lab",      icon: FlaskConical, href: "/lab" },
    { key: "reports",  icon: BarChart3,    href: "/reports",  disabled: true },
    { key: "settings", icon: Settings,     href: "/settings", disabled: true },
  ] as const

  return (
    <nav className="hidden md:flex flex-col w-20 h-full border-r border-border bg-background shrink-0">
      {/* Nav items */}
      <TooltipProvider delay={300}>
        <div className="flex flex-col gap-0.5 py-3 flex-1">
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
    </nav>
  )
}
