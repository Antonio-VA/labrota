"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["cobertura", "reglas", "plantillas", "tecnicas", "departamentos", "turnos"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABELS: Record<TabKey, string> = {
  cobertura:     "Cobertura",
  reglas:        "Reglas",
  plantillas:    "Plantillas",
  tecnicas:      "Técnicas",
  departamentos: "Departamentos",
  turnos:        "Turnos",
}

export function LabPageTabs({
  cobertura, reglas, plantillas, tecnicas, departamentos, turnos,
}: {
  cobertura:     React.ReactNode
  reglas:        React.ReactNode
  plantillas:    React.ReactNode
  tecnicas:      React.ReactNode
  departamentos: React.ReactNode
  turnos:        React.ReactNode
}) {
  const [active, setActive] = useState<TabKey>("cobertura")
  const content: Record<TabKey, React.ReactNode> = { cobertura, reglas, plantillas, tecnicas, departamentos, turnos }

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border -mb-2 overflow-x-auto">
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

      {/* Tab content */}
      <div className="min-h-[400px]">{content[active]}</div>
    </div>
  )
}
