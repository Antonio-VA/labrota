"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

export function DropdownPanel({
  open, onClose, children, className,
}: {
  open: boolean
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-50 bottom-full mb-2 rounded-xl border border-border bg-background shadow-lg p-3 min-w-[220px]",
        className
      )}
    >
      {children}
    </div>
  )
}

export function HeaderPopover({
  label, active, children,
}: {
  label: string
  active?: boolean
  children: (close: () => void) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  return (
    <div ref={ref} className="relative group/hdr flex items-center gap-0.5 min-w-0">
      <span className={cn("text-[13px] font-medium truncate", active ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      <button
        onClick={() => setOpen(v => !v)}
        className={cn("shrink-0 p-0.5 rounded transition-opacity", active ? "opacity-100 text-primary" : "opacity-0 group-hover/hdr:opacity-100 text-muted-foreground hover:text-foreground")}
      >
        <ChevronDown className={cn("size-3 transition-transform duration-150", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[160px]">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
