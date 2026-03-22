"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["turnos", "configuracion", "reglas", "tecnicas", "plantillas"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABELS: Record<TabKey, string> = {
  turnos:        "Turnos",
  configuracion: "Configuración",
  reglas:        "Reglas",
  tecnicas:      "Técnicas",
  plantillas:    "Plantillas",
}

export function LabPageTabs({
  turnos, configuracion, reglas, tecnicas, plantillas,
}: {
  turnos:        React.ReactNode
  configuracion: React.ReactNode
  reglas:        React.ReactNode
  tecnicas:      React.ReactNode
  plantillas:    React.ReactNode
}) {
  const [active, setActive] = useState<TabKey>("turnos")
  const content: Record<TabKey, React.ReactNode> = { turnos, configuracion, reglas, tecnicas, plantillas }

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border -mb-2">
        {TAB_KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setActive(key)}
            className={cn(
              "px-4 py-2 text-[14px] font-medium border-b-2 -mb-px transition-colors",
              active === key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>{content[active]}</div>
    </div>
  )
}
