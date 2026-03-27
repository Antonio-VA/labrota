"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

const TAB_KEYS = ["configuration", "defaults"] as const
type TabKey = typeof TAB_KEYS[number]

const TAB_LABELS: Record<TabKey, string> = {
  configuration: "Configuration & Users",
  defaults: "Defaults & History",
}

export function AdminOrgTabs({
  configuration, defaults,
}: {
  configuration: React.ReactNode
  defaults: React.ReactNode
}) {
  const [active, setActive] = useState<TabKey>("configuration")
  const content: Record<TabKey, React.ReactNode> = { configuration, defaults }

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
