"use client"

import { useState, useRef } from "react"
import { createPortal } from "react-dom"
import { X, Plus, Users } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "./constants"
import { StaffSelector } from "./staff-selector"

export function TaskCell({
  tecnica, date, assignments, staffList, leaveStaffIds, conflictStaffIds,
  isPublished, isWholeTeamOverride,
  onAssign: _onAssign, onRemove, onAssignSilent, onRemoveSilent,
  onOptimisticAdd, onOptimisticRemove, onToggleWholeTeam, onRefresh,
  compact = false, staffColorMap, colorBorders = true, onChipClick,
}: {
  tecnica: Tecnica; date: string; assignments: Assignment[]
  staffList: StaffWithSkills[]; leaveStaffIds: Set<string>; conflictStaffIds: Set<string>
  isPublished: boolean; isWholeTeamOverride?: boolean
  onAssign: (staffId: string, tecnicaCodigo: string, date: string) => void
  onRemove: (assignmentId: string) => void
  onAssignSilent: (staffId: string, tecnicaCodigo: string, date: string) => Promise<unknown>
  onRemoveSilent: (assignmentId: string) => Promise<unknown>
  onOptimisticAdd: (staffId: string, functionLabel: string, date: string) => void
  onOptimisticRemove: (assignmentId: string) => void
  onToggleWholeTeam: (tecnicaCodigo: string, date: string, current: boolean) => void
  onRefresh: () => void; compact?: boolean
  staffColorMap: Record<string, string>; colorBorders?: boolean
  onChipClick?: (staffId: string) => void
}) {
  const [selectorOpen, setSelectorOpen] = useState(false)
  const cellRef = useRef<HTMLDivElement>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const isWholeTeam = isWholeTeamOverride ?? assignments.some((a) => a.whole_team)
  const assignedStaffIds = new Set(assignments.map((a) => a.staff_id))

  function openSelector() {
    if (isPublished) return
    const rect = cellRef.current?.getBoundingClientRect()
    if (rect) {
      const top = Math.min(rect.bottom + 4, window.innerHeight - 60)
      const left = Math.min(rect.left, window.innerWidth - 232)
      setPopupPos({ top, left })
    }
    setSelectorOpen(true)
  }

  const { hoveredStaffId, setHovered } = useStaffHover()

  return (
    <div ref={cellRef} className={cn("relative flex items-center gap-0.5 group/cell flex-wrap min-w-0 overflow-hidden", compact ? "min-h-[28px] p-0.5" : "min-h-[36px] p-1")}>
      {assignments.map((a) => {
        const onLeave = leaveStaffIds.has(a.staff_id)
        const hasConflict = conflictStaffIds.has(a.staff_id)
        const isHovered = hoveredStaffId === a.staff_id
        const staffColor = staffColorMap[a.staff_id]
        return (
          <Tooltip key={a.id}>
            <TooltipTrigger render={
              <span
                onMouseEnter={() => setHovered(a.staff_id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onChipClick?.(a.staff_id)}
                className={cn(
                  "inline-flex items-center gap-0.5 rounded pl-2 pr-1.5 py-1 text-[11px] font-semibold group/chip transition-colors duration-150",
                  onChipClick && "cursor-pointer",
                  onLeave ? "bg-muted text-muted-foreground opacity-60" :
                  hasConflict ? "bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                  "bg-white text-slate-700 dark:bg-slate-800 dark:text-slate-100"
                )}
                style={{
                  ...(colorBorders ? { borderLeft: `3px solid ${staffColor || "#94A3B8"}` } : {}),
                  borderRadius: 4,
                  ...(isHovered && staffColor ? { backgroundColor: staffColor, color: "#1e293b" } : {}),
                }}
              >
                {`${a.staff.first_name[0]}${a.staff.last_name[0]}`}
                {!isPublished && (
                  <button onClick={(e) => { e.stopPropagation(); onRemove(a.id) }} className="opacity-0 group-hover/chip:opacity-100 hover:text-destructive transition-opacity">
                    <X className="size-2.5" />
                  </button>
                )}
              </span>
            } />
            <TooltipContent side="right">
              {a.staff.first_name} {a.staff.last_name}
              {onLeave && " · De baja hoy"}
              {hasConflict && ` · Asignado a múltiples tareas`}
            </TooltipContent>
          </Tooltip>
        )
      })}
      {isWholeTeam && (
        <Tooltip>
          <TooltipTrigger render={
            <button onClick={() => openSelector()} className="inline-flex items-center gap-1 rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
              <Users className="size-2.5" />All
            </button>
          } />
          <TooltipContent side="right">Todo el equipo</TooltipContent>
        </Tooltip>
      )}
      {!isPublished && (
        <div onClick={() => openSelector()} className="flex-1 min-w-[20px] h-full flex items-center justify-center cursor-pointer opacity-0 group-hover/cell:opacity-100 transition-opacity">
          <Plus className="size-3 text-muted-foreground" />
        </div>
      )}
      {selectorOpen && popupPos && createPortal(
        <div style={{ position: "fixed", top: popupPos.top, left: popupPos.left, zIndex: 200 }}>
          <StaffSelector
            open={selectorOpen}
            onClose={() => { setSelectorOpen(false); setPopupPos(null) }}
            onAdd={(staffId) => { onOptimisticAdd(staffId, tecnica.codigo, date); onAssignSilent(staffId, tecnica.codigo, date).then(onRefresh) }}
            onRemoveStaff={(staffId) => { const a = assignments.find((x) => x.staff_id === staffId); if (a) { onOptimisticRemove(a.id); onRemoveSilent(a.id).then(onRefresh) } }}
            onToggleWholeTeam={() => onToggleWholeTeam(tecnica.codigo, date, isWholeTeam)}
            tecnica={tecnica} availableStaff={staffList}
            assignedStaffIds={assignedStaffIds} leaveStaffIds={leaveStaffIds}
            isWholeTeam={isWholeTeam} allowWholeTeam={true}
          />
        </div>,
        document.body
      )}
    </div>
  )
}
