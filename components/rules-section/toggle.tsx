"use client"

import { cn } from "@/lib/utils"

export function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block size-4 rounded-full bg-white shadow ring-0 transition-transform",
        checked ? "translate-x-4" : "translate-x-0"
      )} />
    </button>
  )
}
