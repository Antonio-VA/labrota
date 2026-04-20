"use client"

import { useState } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/** Pill showing a task technique code — supports hover effects, cross-cell highlighting, and optional remove button */
export function TaskChip({
  label, tecColor, compact, colorChips, forceHover, onHover, onRemove,
}: {
  label: string; tecColor: string; compact?: boolean; colorChips?: boolean
  forceHover?: boolean; onHover?: (code: string | null) => void; onRemove?: () => void
}) {
  const [hov, setHov] = useState(false)
  const active = hov || forceHover
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded pl-1.5 pr-1 font-semibold group/chip transition-colors duration-100 text-foreground/70",
        compact ? "text-[10px] py-0" : "text-[11px] py-0.5",
      )}
      style={{
        borderRadius: 4,
        ...(colorChips && tecColor ? { borderLeft: `3px solid ${tecColor}` } : {}),
        ...(active && tecColor ? { backgroundColor: `${tecColor}40`, color: "var(--foreground)" } : {}),
      }}
      onMouseEnter={() => { setHov(true); onHover?.(label) }}
      onMouseLeave={() => { setHov(false); onHover?.(null) }}
    >
      {label}
      {onRemove ? (
        <button
          className={cn("ml-0.5 leading-none opacity-70 hover:opacity-100 transition-opacity", !active && "invisible")}
          tabIndex={active ? 0 : -1}
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >
          <X className="size-2.5" />
        </button>
      ) : null}
    </span>
  )
}
