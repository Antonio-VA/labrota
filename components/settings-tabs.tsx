"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const BASE_TAB_KEYS = ["organizacion", "funcionalidades", "facturacion", "usuarios", "notificaciones", "implementacion", "historial"] as const
type TabKey = typeof BASE_TAB_KEYS[number]

const TAB_LABEL_KEYS: Record<TabKey, string> = {
  organizacion:     "organisation",
  funcionalidades:  "features",
  facturacion:      "billing",
  usuarios:         "users",
  notificaciones:   "notifications",
  implementacion:   "implementation",
  historial:        "history",
}

export function SettingsTabs({
  organizacion, funcionalidades, facturacion, usuarios, notificaciones, implementacion, historial,
}: {
  organizacion:     React.ReactNode
  funcionalidades:  React.ReactNode
  facturacion:      React.ReactNode
  usuarios:         React.ReactNode
  notificaciones?:  React.ReactNode
  implementacion:   React.ReactNode
  historial:        React.ReactNode
}) {
  const t = useTranslations("settingsTabs")
  const [active, setActive] = useState<TabKey>("organizacion")
  const content: Record<TabKey, React.ReactNode> = { organizacion, funcionalidades, facturacion, usuarios, notificaciones: notificaciones ?? null, implementacion, historial }

  // Filter out tabs with no content (e.g. notificaciones for non-admins)
  const tabKeys = BASE_TAB_KEYS.filter((key) => content[key] !== null)

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex border-b border-border -mb-2 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabKeys.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={cn(
              "px-4 py-2 text-[14px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              active === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t(TAB_LABEL_KEYS[key])}
          </button>
        ))}
      </div>
      <div className="w-full">
        {tabKeys.map((key) => (
          <div key={key} className={key !== active ? "hidden" : undefined}>
            {content[key]}
          </div>
        ))}
      </div>
    </div>
  )
}
