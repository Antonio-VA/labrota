"use client"

import { Fragment, useEffect, useRef, useState } from "react"
import { MoreHorizontal, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { MenuItem } from "../types"

export function OverflowMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (items.length === 0) return null

  return (
    <div ref={ref} className="relative">
      <Button variant="outline" size="icon-sm" onClick={() => setOpen((o) => !o)} aria-label="More options">
        <MoreHorizontal className="size-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1">
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.dividerBefore && <div className="h-px bg-border my-1" />}
              {item.sectionLabel && <p className="px-4 pt-1.5 pb-0.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{item.sectionLabel}</p>}
              <button
                onClick={() => { item.onClick(); if (!item.active && item.active !== false) setOpen(false) }}
                disabled={item.disabled}
                className={cn(
                  "flex items-center gap-2 w-full px-4 py-2 text-[14px] text-left transition-colors duration-75 disabled:opacity-50",
                  item.destructive ? "text-destructive hover:bg-destructive/10" : "hover:bg-accent"
                )}
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.active && <CheckCircle2 className="size-3.5 text-primary shrink-0" />}
              </button>
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
