"use client"

import { useState, useRef, useEffect, useLayoutEffect, useCallback, type ReactNode } from "react"
import { createPortal } from "react-dom"

export function TapPopover({ trigger, children }: { trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  // Calculate position when opening
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.top + window.scrollY,
      left: rect.left + rect.width / 2,
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
          <div className="absolute top-full left-1/2 -translate-x-1/2 size-2 -mt-1 rotate-45 bg-foreground" />
        </div>,
        document.body
      )}
    </>
  )
}
