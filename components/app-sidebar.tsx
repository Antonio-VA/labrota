"use client"

import { useTranslations, useLocale } from "next-intl"
import { usePathname, useRouter } from "next/navigation"
import { CalendarDays, Users, Plane, FlaskConical, BarChart3, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"

// ── Nav item ──────────────────────────────────────────────────────────────────

function NavItem({
  href,
  icon: Icon,
  label,
  isActive,
  disabled,
  tooltip,
}: {
  href: string
  icon: React.ElementType
  label: string
  isActive: boolean
  disabled?: boolean
  tooltip?: string
}) {
  if (disabled) {
    return (
      <div
        className="flex flex-col items-center gap-1 py-2.5 mx-1.5 rounded-xl cursor-not-allowed"
        title={tooltip}
      >
        <Icon className="size-6 text-gray-300" />
        <span className="text-[11px] font-medium text-gray-300 leading-none">{label}</span>
      </div>
    )
  }

  return (
    <a
      href={href}
      className={cn(
        "flex flex-col items-center gap-1 py-2.5 mx-1.5 rounded-xl transition-colors",
        isActive
          ? "bg-blue-100 text-blue-700"
          : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
      )}
    >
      <Icon className="size-6" />
      <span className="text-[11px] font-medium leading-none">{label}</span>
    </a>
  )
}

// ── Sign-out button ───────────────────────────────────────────────────────────

function SignOutButton() {
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <button
      onClick={signOut}
      className="flex flex-col items-center gap-1 py-2.5 mx-1.5 rounded-xl text-gray-400 hover:text-destructive transition-colors"
      title="Cerrar sesión"
    >
      <LogOut className="size-6" />
      <span className="text-[11px] font-medium leading-none">
        {/* label intentionally empty — icon is self-explanatory in a compact sidebar */}
      </span>
    </button>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export function AppSidebar() {
  const t        = useTranslations("nav")
  const locale   = useLocale()
  const pathname = usePathname()

  const comingSoon = locale === "es" ? "Próximamente" : "Coming soon"

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
      {/* Nav */}
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
              tooltip={"disabled" in item && item.disabled ? comingSoon : undefined}
            />
          )
        })}
      </div>

      {/* Sign out */}
      <div className="border-t border-border py-2">
        <SignOutButton />
      </div>
    </nav>
  )
}
