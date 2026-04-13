"use client"

import { cn } from "@/lib/utils"
import { DAYS, DAY_LABELS } from "./constants"

export function DayPicker({
  selected,
  onChange,
  variant = "solid",
}: {
  selected: string[]
  onChange: (days: string[]) => void
  variant?: "solid" | "soft"
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {DAYS.map((day) => {
        const active = selected.includes(day)
        return (
          <button
            key={day}
            type="button"
            onClick={() =>
              onChange(
                active
                  ? selected.filter((d) => d !== day)
                  : [...selected, day]
              )
            }
            className={cn(
              "size-9 rounded-full border text-[13px] font-medium transition-colors",
              active
                ? variant === "soft"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-primary bg-primary text-white"
                : "border-border bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {DAY_LABELS[day]}
          </button>
        )
      })}
    </div>
  )
}
