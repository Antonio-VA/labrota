"use client"

import { useTranslations } from "next-intl"
import { usePathname } from "next/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar"
import Image from "next/image"
import { CalendarDays, Users, CalendarOff, FlaskConical, BarChart3, Settings } from "lucide-react"
import { LanguageToggle } from "@/components/language-toggle"
import { UserMenu } from "@/components/user-menu"

export function AppSidebar() {
  const t = useTranslations("nav")
  const pathname = usePathname()

  const navItems = [
    { key: "schedule", icon: CalendarDays, href: "/" },
    { key: "staff",    icon: Users,        href: "/staff" },
    { key: "leaves",   icon: CalendarOff,  href: "/leaves" },
    { key: "lab",      icon: FlaskConical, href: "/lab" },
    { key: "reports",  icon: BarChart3,    href: "/reports" },
  ] as const

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Logo */}
      <SidebarHeader className="px-5 py-4 border-b border-sidebar-border group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-3">
        <a href="/" className="flex items-center">
          <Image
            src="/brand/logo-wordmark.svg"
            alt="LabRota"
            width={110}
            height={23}
            priority
            className="group-data-[collapsible=icon]:hidden"
          />
          <Image
            src="/brand/logo-icon.svg"
            alt="LabRota"
            width={24}
            height={24}
            className="hidden group-data-[collapsible=icon]:block mx-auto"
          />
        </a>
      </SidebarHeader>

      {/* Nav */}
      <SidebarContent className="py-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton
                      render={<a href={item.href} />}
                      className={
                        isActive
                          ? "bg-accent text-accent-foreground font-medium"
                          : "text-foreground hover:bg-muted"
                      }
                    >
                      <item.icon className="size-4 shrink-0" />
                      <span>{t(item.key)}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer — settings, language, user */}
      <SidebarFooter className="border-t border-sidebar-border px-2 py-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<a href="/settings" />}
              className={
                pathname.startsWith("/settings")
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-foreground hover:bg-muted"
              }
            >
              <Settings className="size-4 shrink-0" />
              <span>{t("settings")}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <div className="flex items-center justify-between px-2 pt-1 group-data-[collapsible=icon]:hidden">
          <UserMenu />
          <LanguageToggle />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
