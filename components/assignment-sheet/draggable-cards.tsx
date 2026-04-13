"use client"

import { useState, useEffect, useRef } from "react"
import { useTranslations } from "next-intl"
import { X, Plus, CalendarX } from "lucide-react"
import { formatTime } from "@/lib/format-time"
import { useDraggable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import type { StaffWithSkills, ShiftType, ShiftTypeDefinition, Tecnica } from "@/lib/types/database"
import type { RotaDay } from "@/app/(clinic)/rota/actions"
import { ROLE_BORDER, TECNICA_PILL } from "./constants"
import { AssignmentPopover } from "./assignment-popover"

type Assignment = RotaDay["assignments"][0]

// ── Draggable staff card ───────────────────────────────────────────────────────

export function DraggableCard({
  assignment, tecnica, staffSkills, tecnicas,
  onRemove, disabled, isPublished, enableTaskInShift,
  onFunctionSave, onTecnicaSave,
}: {
  assignment: Assignment
  tecnica: Tecnica | null
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  onRemove: () => void
  disabled: boolean
  isPublished: boolean
  enableTaskInShift: boolean
  onFunctionSave: (id: string, label: string | null) => void
  onTecnicaSave: (id: string, tecnicaId: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: assignment.id,
    disabled,
  })

  const pillLabel = tecnica ? tecnica.codigo : (assignment.function_label ?? null)
  const pillColor = tecnica ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-slate-50 border-border text-slate-500"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0 : 1, borderLeft: `3px solid ${ROLE_BORDER[assignment.staff.role] ?? "#94A3B8"}`, borderRadius: 4 }}
      className={cn(
        "flex items-center gap-2.5 pl-3 pr-2 py-1.5 min-h-[34px] text-[13px] bg-background text-foreground border border-border",
        !disabled && "cursor-grab"
      )}
      {...listeners}
      {...attributes}
    >
      <AssignmentPopover
        assignment={assignment}
        staffSkills={staffSkills}
        tecnicas={tecnicas}
        onFunctionSave={onFunctionSave}
        onTecnicaSave={onTecnicaSave}
        isPublished={isPublished}
        enableTaskInShift={enableTaskInShift}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-medium truncate leading-tight">
            {assignment.staff.first_name} {assignment.staff.last_name}
          </span>
          {pillLabel && pillColor && (
            <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 leading-tight", pillColor)}>
              {pillLabel}
            </span>
          )}
        </div>
      </AssignmentPopover>

      {!disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 p-1 -mr-1 rounded text-muted-foreground/30 hover:text-destructive hover:bg-red-50 transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Shift picker for OFF chips ────────────────────────────────────────────────

function ShiftPickerButton({ shiftTypes, onSelect, timeFormat = "24h" }: { shiftTypes: ShiftTypeDefinition[]; onSelect: (shift: ShiftType) => void; timeFormat?: string }) {
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

  if (shiftTypes.length === 1) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(shiftTypes[0].code) }}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0"
      >
        <Plus className="size-3 opacity-40 hover:opacity-100 transition-opacity" />
      </button>
    )
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Plus className="size-3 opacity-40 hover:opacity-100 transition-opacity" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-border bg-background shadow-lg py-1 w-28">
          {shiftTypes.map((st) => (
            <button
              key={st.code}
              onClick={(e) => { e.stopPropagation(); onSelect(st.code); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors text-[12px]"
            >
              <span className="font-medium">{st.code}</span>
              <span className="text-muted-foreground text-[10px]">{formatTime(st.start_time, timeFormat)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Draggable OFF staff chip ───────────────────────────────────────────────────

export function DraggableOffChip({
  staff, shiftTypes, onAddToShift, disabled, onLeave, timeFormat = "24h",
}: {
  staff: StaffWithSkills
  shiftTypes: ShiftTypeDefinition[]
  onAddToShift: (staffId: string, shift: ShiftType) => void
  disabled: boolean
  onLeave: boolean
  timeFormat?: string
}) {
  const tLeave = useTranslations("mySchedule")
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `off-${staff.id}`,
    disabled: disabled || onLeave,
  })

  return (
    <div
      ref={setNodeRef}
      style={{
        opacity: isDragging ? 0 : 1,
        borderLeft: onLeave ? "3px solid #FBBF24" : undefined,
        borderRadius: 4,
      }}
      {...(onLeave ? {} : listeners)}
      {...(onLeave ? {} : attributes)}
      className={cn(
        "flex items-center gap-1.5 py-1 px-2 text-[13px] font-medium border border-border rounded",
        onLeave
          ? "text-muted-foreground/50 cursor-not-allowed select-none bg-amber-500/5 border-amber-500/20"
          : disabled
          ? "text-muted-foreground cursor-default bg-background"
          : "text-foreground cursor-grab hover:bg-primary/5 transition-colors bg-background"
      )}
    >
      <span className="truncate flex-1">{staff.first_name} {staff.last_name[0]}.</span>
      {onLeave ? (
        <span className="text-[10px] shrink-0 flex items-center gap-1"><CalendarX className="size-3" />{tLeave("leave")}</span>
      ) : !disabled && shiftTypes.length > 0 ? (
        <ShiftPickerButton shiftTypes={shiftTypes} onSelect={(shift) => onAddToShift(staff.id, shift)} timeFormat={timeFormat} />
      ) : null}
    </div>
  )
}
