"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { Plus } from "lucide-react"
import { useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"
import { ROLE_BORDER, ROLE_ORDER } from "./constants"

// ── Droppable shift row ───────────────────────────────────────────────────────

export function DroppableShiftRow({
  shiftCode, children, className,
}: {
  shiftCode: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `shift-${shiftCode}` })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-accent")}>
      {children}
    </div>
  )
}

export function DroppableOffSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: "off-section" })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-accent/50")}>
      {children}
    </div>
  )
}

// ── Add person dropdown ────────────────────────────────────────────────────────

export function AddPersonButton({
  shift, available, onAdd, disabled,
}: {
  shift: ShiftType
  available: StaffWithSkills[]
  onAdd: (staffId: string) => void
  disabled: boolean
}) {
  const tAdd = useTranslations("common")
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

  if (disabled || available.length === 0) return null

  const sorted = [...available].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[12px] text-primary/60 hover:text-primary transition-colors py-0.5 px-1 rounded"
      >
        <Plus className="size-3" />
        {tAdd("add")}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-border bg-background shadow-lg py-1 max-h-56 overflow-y-auto">
          {sorted.map((s) => (
            <button
              key={s.id}
              onClick={() => { setOpen(false); onAdd(s.id) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              <span className="w-0.5 h-4 shrink-0 rounded-full" style={{ background: ROLE_BORDER[s.role] ?? "#94A3B8" }} />
              <span className="text-[13px] truncate flex-1">{s.first_name} {s.last_name}</span>
              {s.preferred_shift === shift && (
                <span className="text-[10px] text-muted-foreground shrink-0">pref.</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
