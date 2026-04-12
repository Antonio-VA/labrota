"use client"

import { Hourglass } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

export function SkillOverflow({ skills, skillLabel, maxVisible, variant, skillOrder }: {
  skills: { skill: string; level: string }[]
  skillLabel: (code: string) => string
  maxVisible: number
  variant: "certified" | "training"
  skillOrder?: Record<string, number>
}) {
  const sorted = skillOrder
    ? [...skills].sort((a, b) => (skillOrder[a.skill] ?? 999) - (skillOrder[b.skill] ?? 999))
    : skills
  const visible  = sorted.slice(0, maxVisible)
  const overflow = sorted.slice(maxVisible)

  const badgeClass = variant === "training"
    ? "shrink-0 inline-flex items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
    : "shrink-0 inline-flex items-center rounded border border-border bg-background px-1.5 py-0.5 text-[11px] font-medium text-foreground"

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visible.map((sk) => (
        <span key={sk.skill} className={badgeClass}>
          {variant === "training" && <Hourglass className="size-2.5 text-amber-500 shrink-0" />}
          {skillLabel(sk.skill)}
        </span>
      ))}
      {overflow.length > 0 && (
        <Tooltip>
          <TooltipTrigger render={
            <span className="shrink-0 inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground cursor-default">
              +{overflow.length}
            </span>
          } />
          <TooltipContent side="top">
            {overflow.map((sk) => skillLabel(sk.skill)).join(", ")}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  )
}
