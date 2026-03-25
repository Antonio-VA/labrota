"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["cobertura", "notas", "reglas", "plantillas", "tecnicas", "departamentos", "turnos", "historial"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABELS: Record<TabKey, string> = {
  cobertura:     "Cobertura",
  reglas:        "Reglas",
  plantillas:    "Plantillas",
  tecnicas:      "Tareas",
  departamentos: "Departamentos",
  turnos:        "Turnos",
  notas:         "Notas",
  historial:     "Historial",
}

export function LabPageTabs({
  cobertura, reglas, plantillas, tecnicas, departamentos, turnos, notas, historial,
}: {
  cobertura:     React.ReactNode
  reglas:        React.ReactNode
  plantillas:    React.ReactNode
  tecnicas:      React.ReactNode
  departamentos: React.ReactNode
  turnos:        React.ReactNode
  notas:         React.ReactNode
  historial:     React.ReactNode
}) {
  const [active, setActive] = useState<TabKey>("cobertura")
  const content: Record<TabKey, React.ReactNode> = { cobertura, reglas, plantillas, tecnicas, departamentos, turnos, notas, historial }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Tab bar */}
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
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Tab content — fixed width container, all pre-rendered */}
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
