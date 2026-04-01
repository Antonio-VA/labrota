"use client"

import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react"
import { createPortal } from "react-dom"

export function TapPopover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: string } | null>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const triggerCenter = rect.left + rect.width / 2
    // Clamp so the popover stays ~180px wide inside the viewport with 8px margin
    const halfPop = 90
    const margin = 8
    const clamped = Math.max(halfPop + margin, Math.min(triggerCenter, vw - halfPop - margin))
    // Move arrow to point at the actual trigger center
    const arrowPct = ((triggerCenter - clamped) / (halfPop * 2) + 0.5) * 100
    setPos({
      top: rect.top + window.scrollY,
      left: clamped + window.scrollX,
      arrowLeft: `${Math.max(12, Math.min(88, arrowPct))}%`,
    })
  }, [open])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent | TouchEvent) {
      const target = e.target as Node
      if (popoverRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    document.addEventListener("touchstart", handler)
    const timer = setTimeout(() => setOpen(false), 3000)
    return () => {
      document.removeEventListener("mousedown", handler)
      document.removeEventListener("touchstart", handler)
      clearTimeout(timer)
    }
  }, [open])

  return (
    <>
      <div ref={triggerRef} className="inline-flex" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}>
        {trigger}
      </div>
      {open && pos && createPortal(
        <div
          ref={popoverRef}
          className="fixed z-[9999] bg-foreground text-background rounded-lg px-3 py-1.5 text-[12px] whitespace-nowrap shadow-lg pointer-events-auto"
          style={{
            top: pos.top - 8,
            left: pos.left,
            transform: "translate(-50%, -100%)",
          }}
        >
          {children}
          <div
            className="absolute top-full size-2 -mt-1 rotate-45 bg-foreground"
            style={{ left: pos.arrowLeft, transform: "translateX(-50%) rotate(45deg)" }}
          />
        </div>,
        document.body
      )}
    </>
  )
}
