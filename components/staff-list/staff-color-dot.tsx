"use client"

import { useState, useRef, useEffect } from "react"
import { cn } from "@/lib/utils"
import { STAFF_COLORS } from "./types"

export function StaffColorDot({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(!open)} className="size-3.5 rounded-full ring-1 ring-border hover:ring-primary cursor-pointer" style={{ backgroundColor: color }} />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-1.5 w-[160px]">
          <div className="grid grid-cols-8 gap-0.5">
            {STAFF_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false) }}
                className={cn("size-3.5 rounded-full hover:scale-125 transition-transform", c === color && "ring-2 ring-primary ring-offset-1")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
