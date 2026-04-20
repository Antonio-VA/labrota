"use client"

import { Fragment } from "react"
import { Plane } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RotaDay } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { DraggableOffStaff, DroppableCell } from "../dnd-wrappers"
import type { Assignment } from "../types"

export function ShiftGridOffRow({
  localDays, staffList, onLeaveByDate, overId, isPublished,
  colorChips, hoveredStaffId, setHovered, staffColorMap,
  roleBorder, roleOrder, onChipClick,
}: {
  localDays: RotaDay[]
  staffList: StaffWithSkills[]
  onLeaveByDate: Record<string, string[]>
  overId: string | null
  isPublished: boolean
  colorChips?: boolean
  hoveredStaffId: string | null
  setHovered: (id: string | null) => void
  staffColorMap: Record<string, string>
  roleBorder: Record<string, string>
  roleOrder: Record<string, number>
  onChipClick: (assignment: Assignment, date: string) => void
}) {
  function renderChip(s: StaffWithSkills, date: string, onLeave: boolean) {
    const isHov = hoveredStaffId === s.id
    const fallbackBorder = onLeave ? "var(--muted-foreground)" : (roleBorder[s.role] ?? "#94A3B8")
    const chip = (
      <div
        onClick={() => onChipClick({ staff_id: s.id } as Assignment, date)}
        onMouseEnter={() => setHovered(s.id)}
        onMouseLeave={() => setHovered(null)}
        className={cn(
          "flex items-center gap-1 py-0.5 text-[11px] font-medium w-full bg-card text-muted-foreground border cursor-pointer transition-colors duration-150",
          onLeave && "select-none",
          colorChips ? "border-border" : "border-transparent",
        )}
        style={{
          borderLeft: colorChips ? `3px solid ${isHov && staffColorMap[s.id] ? staffColorMap[s.id] : fallbackBorder}` : undefined,
          borderRadius: 4, paddingLeft: 5, paddingRight: 6,
          ...(isHov && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : {}),
        }}
      >
        <span className={cn("truncate", onLeave && "italic")}>{s.first_name} {s.last_name[0]}.</span>
        {onLeave && <Plane className="size-3 shrink-0 ml-auto text-muted-foreground/40" />}
      </div>
    )
    return onLeave ? chip : (
      <DraggableOffStaff staffId={s.id} date={date} disabled={isPublished}>
        {chip}
      </DraggableOffStaff>
    )
  }

  return (
    <div className="grid grid-cols-[80px_repeat(7,1fr)]">
      <div className="flex flex-col items-end justify-center px-2.5 py-2 bg-muted">
        <span className="text-[10px] text-muted-foreground leading-tight font-medium uppercase tracking-wide">OFF</span>
      </div>
      {localDays.map((day) => {
        const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
        const leaveIds = new Set(onLeaveByDate[day.date] ?? [])
        const offCellId = `OFF-${day.date}`

        const allOff = staffList.filter((s) => !assignedIds.has(s.id))
        const onLeaveStaff = allOff.filter((s) => leaveIds.has(s.id))
          .sort((a, b) => a.last_name.localeCompare(b.last_name))
        const availableOff = allOff.filter((s) => !leaveIds.has(s.id))
          .sort((a, b) => (roleOrder[a.role] ?? 9) - (roleOrder[b.role] ?? 9))

        return (
          <DroppableCell
            key={day.date}
            id={offCellId}
            isOver={overId === offCellId}
            isPublished={isPublished}
            className="p-1.5 flex flex-col gap-1 border-l border-border bg-background"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)",
              backgroundSize: "10px 10px",
            }}
          >
            {onLeaveStaff.map((s) => (
              <Fragment key={`leave-${s.id}`}>{renderChip(s, day.date, true)}</Fragment>
            ))}
            {availableOff.map((s) => (
              <Fragment key={`off-${s.id}`}>{renderChip(s, day.date, false)}</Fragment>
            ))}
          </DroppableCell>
        )
      })}
    </div>
  )
}
