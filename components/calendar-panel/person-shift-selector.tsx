"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import type { Assignment } from "./types"
import type { ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { ShiftTypeDefinition } from "@/lib/types/database"

export function PersonShiftSelector({ assignment, shiftTimes, shiftTypes, isPublished, onShiftChange, simplified, isOff }: {
  assignment: Assignment
  shiftTimes: ShiftTimes | null
  shiftTypes: ShiftTypeDefinition[]
  isPublished: boolean
  onShiftChange: (shift: string) => void
  simplified?: boolean
  isOff?: boolean
}) {
  const [open, setOpen] = useState(false)
  const trigRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ top: 0, left: 0 })

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (trigRef.current?.contains(e.target as Node)) return
      if (dropRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  useEffect(() => {
    if (!open || !trigRef.current) return
    const rect = trigRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 2, left: rect.left })
  }, [open])

  const time = shiftTimes?.[assignment.shift_type]
  const activeShifts = shiftTypes.filter((st) => st.active !== false)

  return (
    <div ref={trigRef} className="w-full">
      <div
        onClick={isPublished ? undefined : () => setOpen((v) => !v)}
        className={cn("w-full rounded select-none flex items-center justify-center px-1.5", simplified ? "py-0.5 min-h-[24px]" : "py-1.5 min-h-[36px]", !isPublished && "cursor-pointer hover:bg-muted/50")}
      >
        {isOff ? (
          <span className="text-[12px] text-muted-foreground font-semibold">OFF</span>
        ) : simplified ? (
          <span className="text-[13px] font-semibold" style={{ color: "var(--pref-bg)" }}>{assignment.shift_type}</span>
        ) : (
          <div className="flex flex-col gap-0 items-center">
            <span className="text-[13px] font-semibold" style={{ color: "var(--pref-bg)" }}>{assignment.shift_type}</span>
            {time && <span className="text-[10px] text-muted-foreground tabular-nums leading-tight">{time.start}–{time.end}</span>}
          </div>
        )}
      </div>
      {open && createPortal(
        <div ref={dropRef} className="fixed z-[9999] w-36 rounded-lg border border-border bg-background shadow-lg py-1" style={{ top: pos.top, left: pos.left }}>
          {activeShifts.map((st) => (
            <button
              key={st.code}
              onClick={() => { onShiftChange(st.code); setOpen(false) }}
              className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[13px] text-left hover:bg-accent transition-colors", st.code === assignment.shift_type && "font-semibold text-primary bg-primary/5")}
            >
              <span className="w-4 shrink-0">{st.code === assignment.shift_type ? "✓" : ""}</span>
              <span>{st.code}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{st.start_time}–{st.end_time}</span>
            </button>
          ))}
          <div className="h-px bg-border mx-2 my-1" />
          <button
            onClick={() => {
              onShiftChange("")
              setOpen(false)
            }}
            className="flex items-center w-full px-3 py-1.5 text-[13px] text-left text-muted-foreground hover:bg-accent transition-colors font-medium"
          >
            OFF
          </button>
        </div>,
        document.body
      )}
    </div>
  )
}
