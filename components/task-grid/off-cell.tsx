"use client"

import { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { Plus, CalendarX } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaDay } from "@/app/(clinic)/rota/actions"
import { useStaffHover } from "@/components/staff-hover-context"
import { LEAVE_ICON_MAP } from "./constants"

export function OffCell({ date, day: _day, unassigned, onLeave, staffList, assignedIds: _assignedIds, isPublished, onMakeOff, staffColorMap, leaveTypeByStaff, onChipClick }: {
  date: string; day: RotaDay
  unassigned: StaffWithSkills[]; onLeave: StaffWithSkills[]
  staffList: StaffWithSkills[]; assignedIds: Set<string>
  isPublished: boolean
  onMakeOff: (staffId: string) => Promise<void>
  staffColorMap: Record<string, string>
  leaveTypeByStaff?: Record<string, string>
  onChipClick?: (staffId: string) => void
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const cellRef = useRef<HTMLDivElement>(null)
  const [popupPos, setPopupPos] = useState<{ top: number; left: number } | null>(null)
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pickerOpen) return
    function handler(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [pickerOpen])

  const offIds = new Set(unassigned.map((s) => s.id))
  const leaveIds = new Set(onLeave.map((s) => s.id))
  const nonLeaveStaff = staffList.filter((s) => !leaveIds.has(s.id))

  function openPicker() {
    if (isPublished) return
    const rect = cellRef.current?.getBoundingClientRect()
    if (rect) {
      const popupH = 260; const popupW = 224
      const top = Math.max(8, Math.min(rect.top - 4, window.innerHeight - popupH - 8))
      const left = Math.min(rect.left, window.innerWidth - popupW - 8)
      setPopupPos({ top, left })
    }
    setPickerOpen(true)
  }

  async function toggleOff(s: StaffWithSkills) {
    if (busy.has(s.id)) return
    setBusy((prev) => new Set(prev).add(s.id))
    await onMakeOff(s.id)
    setBusy((prev) => { const next = new Set(prev); next.delete(s.id); return next })
  }

  const { hoveredStaffId, setHovered } = useStaffHover()
  const isSat = new Date(date + "T12:00:00").getDay() === 6

  return (
    <div
      ref={cellRef}
      className="border-r last:border-r-0 border-border p-1 flex flex-wrap gap-0.5 items-start content-start min-h-[36px] group/off"
      style={{
        backgroundImage: "radial-gradient(circle, #cbd5e1 1px, transparent 1px)",
        backgroundSize: "8px 8px",
        ...(isSat ? { borderLeftWidth: 1, borderLeftStyle: "dashed", borderLeftColor: "var(--border)" } : {}),
      }}
    >
      {onLeave.map((s) => {
        const isHovered = hoveredStaffId === s.id
        const leaveType = leaveTypeByStaff?.[s.id] ?? "other"
        const LeaveIcon = LEAVE_ICON_MAP[leaveType] ?? CalendarX
        return (
          <Tooltip key={s.id}>
            <TooltipTrigger render={
              <span
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onChipClick?.(s.id)}
                className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-1 text-[11px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 transition-colors duration-150", onChipClick && "cursor-pointer")}
                style={isHovered && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : undefined}
              >
                <LeaveIcon className="size-2.5" />{`${s.first_name[0]}${s.last_name[0]}`}
              </span>
            } />
            <TooltipContent side="right">{s.first_name} {s.last_name} · De baja</TooltipContent>
          </Tooltip>
        )
      })}
      {unassigned.map((s) => {
        const isHov = hoveredStaffId === s.id
        return (
          <Tooltip key={s.id}>
            <TooltipTrigger render={
              <span
                onMouseEnter={() => setHovered(s.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => onChipClick?.(s.id)}
                className={cn("inline-flex items-center rounded px-1.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors duration-150 bg-background", onChipClick && "cursor-pointer")}
                style={isHov && staffColorMap[s.id] ? { backgroundColor: staffColorMap[s.id], color: "#1e293b" } : undefined}
              >
                {`${s.first_name[0]}${s.last_name[0]}`}
              </span>
            } />
            <TooltipContent side="right">{s.first_name} {s.last_name} · Sin asignar</TooltipContent>
          </Tooltip>
        )
      })}
      {!isPublished && (
        <div onClick={openPicker} className="flex-1 min-w-[20px] h-full flex items-center justify-center cursor-pointer opacity-0 group-hover/off:opacity-100 transition-opacity">
          <Plus className="size-3 text-muted-foreground" />
        </div>
      )}
      {pickerOpen && popupPos && createPortal(
        <div ref={popRef} style={{ position: "fixed", top: popupPos.top, left: popupPos.left, zIndex: 200 }}>
          <div className="bg-background border border-border rounded-lg shadow-lg w-56 overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <span className="text-[11px] font-medium text-muted-foreground">Marcar OFF para este día</span>
            </div>
            <div className="max-h-52 overflow-y-auto py-1">
              {onLeave.length > 0 && (
                <>
                  {onLeave.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-[12px] opacity-40">
                      <span className="size-4 rounded border border-red-300 bg-red-100 flex items-center justify-center text-[9px] text-red-600 shrink-0">✓</span>
                      <span className="text-[10px] font-semibold text-muted-foreground w-5 shrink-0">{`${s.first_name[0]}${s.last_name[0]}`}</span>
                      <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
                      <span className="text-[9px] text-red-500 shrink-0">Baja</span>
                    </div>
                  ))}
                  <div className="h-px bg-border mx-2 my-1" />
                </>
              )}
              {nonLeaveStaff.map((s) => {
                const isOff = offIds.has(s.id)
                const isBusy = busy.has(s.id)
                return (
                  <button key={s.id} disabled={isBusy} onClick={() => toggleOff(s)} className={cn("flex items-center gap-2 w-full px-3 py-1.5 text-[12px] text-left transition-colors", isBusy ? "opacity-40" : "hover:bg-muted/50")}>
                    <span className={cn("size-4 rounded border flex items-center justify-center text-[9px] shrink-0 transition-colors", isOff ? "bg-primary border-primary text-primary-foreground" : "border-border bg-background")}>{isOff && "✓"}</span>
                    <span className="text-[10px] font-semibold text-muted-foreground w-5 shrink-0">{`${s.first_name[0]}${s.last_name[0]}`}</span>
                    <span className="flex-1 truncate">{s.first_name} {s.last_name}</span>
                    {isOff && <span className="text-[9px] text-muted-foreground shrink-0">OFF</span>}
                    {!isOff && <span className="text-[9px] text-muted-foreground/50 shrink-0">Asignado</span>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
