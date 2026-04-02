"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["departamentos", "turnos", "tecnicas", "cobertura", "carga", "generador", "reglas", "plantillas"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABEL_KEYS: Record<TabKey, string> = {
  departamentos: "departments",
  turnos:        "shifts",
  tecnicas:      "tasks",
  cobertura:     "coverage",
  carga:         "workload",
  generador:     "generator",
  reglas:        "rules",
  plantillas:    "templates",
}

export function LabPageTabs({
  cobertura, reglas, generador, plantillas, tecnicas, departamentos, turnos, carga,
}: {
  cobertura:     React.ReactNode
  reglas:        React.ReactNode
  generador:     React.ReactNode
  plantillas:    React.ReactNode
  tecnicas:      React.ReactNode
  departamentos: React.ReactNode
  turnos:        React.ReactNode
  carga:         React.ReactNode
}) {
  const t = useTranslations("labTabs")
  const [active, setActive] = useState<TabKey>("departamentos")
  const content: Record<TabKey, React.ReactNode> = { cobertura, reglas, generador, plantillas, tecnicas, departamentos, turnos, carga }

  return (
    <div className="flex flex-col gap-6 w-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex border-b border-border">
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

      {/* Tab content — all pre-rendered, inactive hidden */}
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
