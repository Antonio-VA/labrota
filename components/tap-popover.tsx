"use client"

import { useState, useRef, useEffect, type ReactNode } from "react"
import { cn } from "@/lib/utils"

export function TapPopover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    // Auto-close after 3s
    const timer = setTimeout(() => setOpen(false), 3000)
    return () => { document.removeEventListener("mousedown", handler); clearTimeout(timer) }
  }, [open])

  return (
    <div ref={ref} className="relative inline-flex">
      <div onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}>
        {trigger}
      </div>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-[200] bg-foreground text-background rounded-lg px-3 py-1.5 text-[12px] whitespace-nowrap shadow-lg">
          {children}
          <div className="absolute top-full left-1/2 -translate-x-1/2 size-2 -mt-1 rotate-45 bg-foreground" />
        </div>
      )}
    </div>
  )
}
