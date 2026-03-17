"use client"

import { CalendarDays, Bot, Users, FlaskConical } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

export type MobileTab = "schedule" | "chat"

interface Props {
  activeTab: MobileTab
  onTabChange: (tab: MobileTab) => void
}

export function MobileBottomNav({ activeTab, onTabChange }: Props) {
  const t = useTranslations("nav")

  const activeItems: { tab: MobileTab; icon: React.ElementType; label: string }[] = [
    { tab: "schedule", icon: CalendarDays, label: t("schedule") },
    { tab: "chat",     icon: Bot,          label: "AI" },
  ]

  const disabledItems: { icon: React.ElementType; label: string }[] = [
    { icon: Users,        label: t("staff") },
    { icon: FlaskConical, label: t("lab") },
  ]

  return (
    <nav className="md:hidden flex items-stretch border-t border-border bg-background h-14 shrink-0">
      {activeItems.map(({ tab, icon: Icon, label }) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={cn(
            "flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] transition-colors",
            activeTab === tab
              ? "text-primary font-medium"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="size-[18px]" />
          <span>{label}</span>
        </button>
      ))}

      {disabledItems.map(({ icon: Icon, label }) => (
        <div
          key={label}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground/30 select-none"
        >
          <Icon className="size-[18px]" />
          <span>{label}</span>
        </div>
      ))}
    </nav>
  )
}
