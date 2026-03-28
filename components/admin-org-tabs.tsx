"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["configuracion", "usuarios", "funcionalidades", "facturacion", "implementacion"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABELS: Record<TabKey, string> = {
  configuracion: "Configuración",
  usuarios: "Usuarios",
  funcionalidades: "Funcionalidades",
  facturacion: "Facturación",
  implementacion: "Implementación",
}

export function AdminOrgTabs({
  configuracion, usuarios, funcionalidades, facturacion, implementacion,
}: {
  configuracion: React.ReactNode
  usuarios: React.ReactNode
  funcionalidades: React.ReactNode
  facturacion: React.ReactNode
  implementacion: React.ReactNode
}) {
  const [active, setActive] = useState<TabKey>("configuracion")
  const content: Record<TabKey, React.ReactNode> = { configuracion, usuarios, funcionalidades, facturacion, implementacion }

  return (
    <div className="flex flex-col gap-6 w-full">
      <div className="flex border-b border-border -mb-2 overflow-x-auto">
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
            {TAB_LABELS[key]}
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
