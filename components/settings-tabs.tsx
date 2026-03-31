"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["organizacion", "funcionalidades", "facturacion", "usuarios", "implementacion", "historial"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABEL_KEYS: Record<TabKey, string> = {
  organizacion:     "organisation",
  funcionalidades:  "features",
  facturacion:      "billing",
  usuarios:         "users",
  implementacion:   "implementation",
  historial:        "history",
}

export function SettingsTabs({
  organizacion, funcionalidades, facturacion, usuarios, implementacion, historial,
}: {
  organizacion:     React.ReactNode
  funcionalidades:  React.ReactNode
  facturacion:      React.ReactNode
  usuarios:         React.ReactNode
  implementacion:   React.ReactNode
  historial:        React.ReactNode
}) {
  const t = useTranslations("settingsTabs")
  const [active, setActive] = useState<TabKey>("organizacion")
  const content: Record<TabKey, React.ReactNode> = { organizacion, funcionalidades, facturacion, usuarios, implementacion, historial }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex border-b border-border -mb-2">
        {TAB_KEYS.map((key) => (
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
        {TAB_KEYS.map((key) => (
          <div key={key} className={key !== active ? "hidden" : undefined}>
            {content[key]}
          </div>
        ))}
      </div>
    </div>
  )
}
