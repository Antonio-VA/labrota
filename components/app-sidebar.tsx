"use client"

import { useEffect, useTransition, useState } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { usePathname, useRouter } from "next/navigation"
import { CalendarDays, Users, Plane, FlaskConical, BarChart3, Settings, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip"
import { createClient } from "@/lib/supabase/client"
import { setLocale } from "@/lib/locale-action"
import type { User } from "@supabase/supabase-js"

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
            <div className="flex flex-col items-center gap-1.5 py-2 mx-2 rounded-[8px] cursor-not-allowed" />
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
              "flex flex-col items-center gap-1.5 py-2 mx-2 rounded-[8px] transition-colors",
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
  const router   = useRouter()
  const locale   = useLocale()

  const [isPending, startTransition] = useTransition()
  const [user, setUser]              = useState<User | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  function toggleLocale() {
    const next = locale === "es" ? "en" : "es"
    startTransition(async () => {
      await setLocale(next as "es" | "en")
      router.refresh()
    })
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push("/login")
  }

  function firstName() {
    const name = (user?.user_metadata?.full_name as string | undefined) ?? ""
    if (name) return name.split(" ")[0]
    return (user?.email ?? "").split("@")[0]
  }

  function initials() {
    const name = (user?.user_metadata?.full_name as string | undefined) ?? ""
    if (name) return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    return (user?.email ?? "").slice(0, 2).toUpperCase()
  }

  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? null

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
      <TooltipProvider delay={300}>
        {/* Nav items */}
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

        {/* Bottom: account section */}
        <div className="border-t border-border py-3 flex flex-col items-center gap-2 px-2">
          {/* Language pill */}
          <button
            onClick={toggleLocale}
            disabled={isPending}
            className="rounded-full border border-border px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/20 tracking-widest transition-colors disabled:opacity-50"
            title={locale === "es" ? "Switch to English" : "Cambiar a Español"}
          >
            {locale === "es" ? "EN" : "ES"}
          </button>

          {user && (
            <>
              {/* Avatar */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className="size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-semibold shrink-0 overflow-hidden cursor-default" />
                  }
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
                  ) : (
                    initials()
                  )}
                </TooltipTrigger>
                <TooltipContent side="right">{firstName()}</TooltipContent>
              </Tooltip>

              {/* First name */}
              <span className="text-[10px] text-muted-foreground truncate w-full text-center leading-none px-1">
                {firstName()}
              </span>

              {/* Sign out */}
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      onClick={signOut}
                      className="flex items-center justify-center size-7 rounded-md text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                    />
                  }
                >
                  <LogOut className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="right">Cerrar sesión</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>
      </TooltipProvider>
    </nav>
  )
}
