"use client"

import { cn } from "@/lib/utils"

export function TabStrip<Step extends string>({
  steps, labels, current, setCurrent, isWizard,
}: {
  steps: Step[]
  labels: Record<Step, string>
  current: Step
  setCurrent: (s: Step) => void
  isWizard: boolean
}) {
  const stepIndex = steps.indexOf(current)

  if (isWizard) {
    return (
      <div className="flex items-center gap-2 -mb-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className={cn("h-px w-6", i <= stepIndex ? "bg-primary" : "bg-border")} />}
            <button
              type="button"
              onClick={() => i <= stepIndex && setCurrent(s)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors",
                i === stepIndex
                  ? "bg-primary text-primary-foreground"
                  : i < stepIndex
                  ? "bg-primary/10 text-primary cursor-pointer"
                  : "bg-muted text-muted-foreground cursor-default"
              )}
            >
              <span className="size-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-semibold">{i + 1}</span>
              {labels[s]}
            </button>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="flex gap-0 border-b border-border -mb-2">
      {steps.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setCurrent(s)}
          className={cn(
            "px-4 py-2 text-[14px] font-medium border-b-2 -mb-px transition-colors",
            current === s ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}
        >
          {labels[s]}
        </button>
      ))}
    </div>
  )
}
