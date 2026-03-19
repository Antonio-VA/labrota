"use client"

import { useTranslations, useLocale } from "next-intl"
import { usePathname } from "next/navigation"
import Image from "next/image"
import { CalendarDays, Users, Plane, FlaskConical, BarChart3, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { setLocale } from "@/lib/locale-action"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import type { User } from "@supabase/supabase-js"

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

// ── User footer ───────────────────────────────────────────────────────────────

function SidebarFooter() {
  const locale = useLocale()
  const router = useRouter()
  const [user, setUser]       = useState<User | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  function initials(u: User) {
    const name = (u.user_metadata?.full_name as string | undefined) ?? ""
    if (name) return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    return (u.email ?? "").slice(0, 2).toUpperCase()
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  async function toggleLocale() {
    const next = locale === "es" ? "en" : "es"
    startTransition(async () => {
      await setLocale(next as "es" | "en")
      router.refresh()
    })
  }

  if (!user) return null

  return (
    <div className="border-t border-border flex flex-col items-center gap-2 py-3">
      {/* Language toggle */}
      <button
        onClick={toggleLocale}
        disabled={isPending}
        className="text-[10px] font-semibold text-gray-400 hover:text-gray-700 tracking-widest transition-colors"
        title={locale === "es" ? "Switch to English" : "Cambiar a Español"}
      >
        {locale === "es" ? "EN" : "ES"}
      </button>

      {/* Avatar */}
      <div
        title={user.user_metadata?.full_name as string ?? user.email ?? ""}
        className="flex size-8 items-center justify-center rounded-full bg-primary text-[11px] font-medium text-primary-foreground"
      >
        {initials(user)}
      </div>

      {/* Sign out */}
      <button
        onClick={signOut}
        className="text-gray-400 hover:text-destructive transition-colors"
        title="Cerrar sesión"
      >
        <LogOut className="size-4" />
      </button>
    </div>
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
    <nav className="hidden md:flex flex-col w-20 h-screen border-r border-border bg-background shrink-0">
      {/* Logo */}
      <div className="flex items-center justify-center h-16 border-b border-border shrink-0">
        <a href="/">
          <Image
            src="/brand/logo-icon.svg"
            alt="LabRota"
            width={40}
            height={40}
            priority
          />
        </a>
      </div>

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

      {/* Footer */}
      <SidebarFooter />
    </nav>
  )
}
