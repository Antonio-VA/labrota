"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["regional", "cobertura", "reglas", "plantillas", "tecnicas", "departamentos", "turnos"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABELS: Record<TabKey, string> = {
  regional:      "Regional",
  cobertura:     "Cobertura",
  reglas:        "Reglas",
  plantillas:    "Plantillas",
  tecnicas:      "Técnicas",
  departamentos: "Departamentos",
  turnos:        "Turnos",
}

export function LabPageTabs({
  regional, cobertura, reglas, plantillas, tecnicas, departamentos, turnos,
}: {
  regional:      React.ReactNode
  cobertura:     React.ReactNode
  reglas:        React.ReactNode
  plantillas:    React.ReactNode
  tecnicas:      React.ReactNode
  departamentos: React.ReactNode
  turnos:        React.ReactNode
}) {
  const [active, setActive] = useState<TabKey>("regional")
  const content: Record<TabKey, React.ReactNode> = { regional, cobertura, reglas, plantillas, tecnicas, departamentos, turnos }

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

      {/* Tab content — min-height prevents layout shift from scrollbar toggling */}
      <div className="min-h-[400px]">{content[active]}</div>
    </div>
  )
}
