"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["cobertura", "reglas", "parametros", "tecnicas", "departamentos", "turnos", "plantillas"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABEL_KEYS: Record<TabKey, string> = {
  cobertura:     "coverage",
  reglas:        "rules",
  parametros:    "parameters",
  tecnicas:      "tasks",
  departamentos: "departments",
  turnos:        "shifts",
  plantillas:    "templates",
}

export function LabPageTabs({
  cobertura, reglas, parametros, plantillas, tecnicas, departamentos, turnos,
}: {
  cobertura:     React.ReactNode
  reglas:        React.ReactNode
  parametros:    React.ReactNode
  plantillas:    React.ReactNode
  tecnicas:      React.ReactNode
  departamentos: React.ReactNode
  turnos:        React.ReactNode
}) {
  const t = useTranslations("labTabs")
  const [active, setActive] = useState<TabKey>("cobertura")
  const content: Record<TabKey, React.ReactNode> = { cobertura, reglas, parametros, plantillas, tecnicas, departamentos, turnos }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Tab bar */}
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
            {t(TAB_LABEL_KEYS[key])}
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
