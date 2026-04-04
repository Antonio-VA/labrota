"use client"

import type React from "react"
import { useState } from "react"
import { Hourglass } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Tecnica } from "@/lib/types/database"
import { useStaffHover } from "@/components/staff-hover-context"
import { ROLE_BORDER, TECNICA_PILL } from "./constants"
import { DEFAULT_DEPT_MAPS } from "./constants"

// ── Staff chip (Vista por persona) ────────────────────────────────────────────

export function StaffChip({ first, last, role, isOverride, hasTrainee, notes, shiftTime, onClick, isDragging, onDragStart, onDragEnd }: {
  first: string; last: string; role: string; isOverride: boolean; hasTrainee: boolean
  notes?: string | null; shiftTime?: string
  onClick?: (e: React.MouseEvent) => void
  isDragging?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}) {
  return (
    <div
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={cn(
        "flex flex-col py-1 text-[12px] select-none bg-background text-foreground border border-border",
        onClick && "cursor-pointer hover:bg-muted/50 active:opacity-80",
        onDragStart && "cursor-grab",
        isDragging && "opacity-40",
      )}
      style={{ borderLeft: `3px solid ${ROLE_BORDER[role] ?? "#94A3B8"}`, borderRadius: 4, paddingLeft: 6, paddingRight: 8 }}
    >
      {shiftTime && (
        <span className="text-[10px] text-muted-foreground font-medium leading-none mb-0.5">{shiftTime}</span>
      )}
      <div className="flex items-center gap-1.5">
        <span className="truncate font-medium">{first} {last[0]}.</span>
        {hasTrainee && (
          <span className="ml-0.5 text-[9px] bg-primary/10 text-primary rounded px-1 font-semibold shrink-0">S</span>
        )}
      </div>
      {notes && (
        <span className="text-[10px] italic text-muted-foreground leading-none mt-0.5 truncate">{notes}</span>
      )}
    </div>
  )
}

// ── Shift badge (Vista por turno — compact inline pill) ───────────────────────

export type ShiftBadgeProps = {
  first: string; last: string; role: string; isOverride: boolean; readOnly?: boolean
  functionLabel?: string | null
  tecnica?: Tecnica | null
  compact?: boolean
  borderColor?: string
  isTrainingTecnica?: boolean
  colorChips?: boolean
  staffId?: string
  staffColor?: string
  departments?: import("@/lib/types/database").Department[]
  trainingTecCode?: string | null
}

export function ShiftBadge({ first, last, role, isOverride, functionLabel, tecnica, compact = false, borderColor, isTrainingTecnica, colorChips = true, readOnly, staffId, staffColor, departments = [], trainingTecCode }: ShiftBadgeProps) {
  const { hoveredStaffId, setHovered } = useStaffHover()
  const [pillHovered, setPillHovered] = useState(false)
  // Resolve department code to abbreviation for pill display
  const deptMatch = functionLabel ? departments.find((d) => d.code === functionLabel) : null
  const pillLabel = tecnica ? tecnica.codigo : (deptMatch ? deptMatch.abbreviation : (functionLabel ?? null))
  const pillColor = !colorChips
    ? "bg-slate-100 border-border text-muted-foreground"
    : tecnica
    ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : deptMatch
    ? null // use inline style for dept color
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-muted border-border text-muted-foreground"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null
  const deptPillStyle = deptMatch ? { backgroundColor: `${deptMatch.colour}15`, borderColor: `${deptMatch.colour}40`, color: deptMatch.colour } : undefined
  const crossHovered = !!(staffId && hoveredStaffId === staffId && staffColor)
  const showPill = pillHovered || crossHovered

  return (
    <div
      className={cn(
        "group flex items-center gap-1.5 rounded border font-medium w-full text-foreground transition-all duration-100",
        compact ? "py-0.5 px-1.5 min-h-[24px] text-[11px]" : "py-1 px-2 min-h-[28px] text-[13px]",
        showPill ? "border-border bg-background" : "border-transparent bg-transparent",
      )}
      style={{
        borderLeft: colorChips
          ? `3px solid ${staffColor ?? borderColor ?? DEFAULT_DEPT_MAPS.border[role] ?? "#94A3B8"}`
          : undefined,
        borderRadius: 4,
        ...(crossHovered ? { backgroundColor: staffColor, color: "#1e293b" } : {}),
      }}
      onMouseEnter={() => { setPillHovered(true); staffId && setHovered(staffId) }}
      onMouseLeave={() => { setPillHovered(false); staffId && setHovered(null) }}
    >
      <span className="truncate">{first} {last[0]}.</span>
      {trainingTecCode && (
        <span className={cn("inline-flex items-center gap-0.5 shrink-0 text-amber-600", compact ? "text-[8px]" : "text-[9px]", !pillLabel && "ml-auto")}>
          <Hourglass className="size-2" />
          {trainingTecCode}
        </span>
      )}
      {pillLabel && (pillColor || deptPillStyle) ? (
        <span
          className={cn("font-semibold px-1 py-0.5 rounded border ml-auto shrink-0 inline-flex items-center gap-0.5", compact ? "text-[8px]" : "text-[9px]", pillColor)}
          style={deptPillStyle}
        >
          {isTrainingTecnica && <Hourglass className="size-2 text-amber-500" />}
          {pillLabel}
        </span>
      ) : !readOnly ? (
        <span className="text-[9px] font-medium text-muted-foreground/40 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-100">
          + Task
        </span>
      ) : null}
    </div>
  )
}
