"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function AdminToggle({
  label,
  desc,
  value,
  onChange,
  disabled,
  activeColor = "emerald",
}: {
  label: string
  desc: string
  value: boolean
  onChange: (v: boolean) => void
  disabled: boolean
  activeColor?: "emerald" | "amber"
}) {
  const on = activeColor === "amber" ? "bg-amber-500" : "bg-emerald-500"
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[14px] font-medium">{label}</p>
        <p className="text-[12px] text-muted-foreground">{desc}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
          value ? on : "bg-muted-foreground/20"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
            value ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  )
}

export function SaveAllButton({
  onClick,
  pending,
  savingLabel,
  saveLabel,
}: {
  onClick: () => void
  pending: boolean
  savingLabel: string
  saveLabel: string
}) {
  return (
    <div className="pt-3">
      <Button onClick={onClick} disabled={pending} size="lg" className="w-fit">
        {pending ? savingLabel : saveLabel}
      </Button>
    </div>
  )
}
