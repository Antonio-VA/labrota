"use client"

import { cn } from "@/lib/utils"
import { TECNICA_PILL } from "./constants"
import type { Assignment } from "./types"
import type { ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { Tecnica } from "@/lib/types/database"

export function PersonShiftPill({ assignment, shiftTimes, tecnica, onClick, taskDisabled, simplified }: {
  assignment: Assignment
  shiftTimes: ShiftTimes | null
  tecnica: Tecnica | null
  onClick?: (e: React.MouseEvent) => void
  taskDisabled?: boolean
  simplified?: boolean
}) {
  const { shift_type, is_manual_override: _is_manual_override, function_label } = assignment
  const time = shiftTimes?.[shift_type]

  const cleanLabel = function_label?.startsWith("dept_") ? null : function_label
  const showTask = !taskDisabled && (tecnica || cleanLabel)
  const pillLabel = tecnica ? tecnica.codigo : cleanLabel
  const pillColor = tecnica
    ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-muted border-border text-muted-foreground"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null

  return (
    <div
      onClick={onClick}
      className={cn(
        "w-full rounded select-none flex items-center gap-1.5 px-1.5",
        simplified ? "py-0.5 min-h-[24px] justify-center" : "py-1.5 min-h-[36px] justify-center",
        !onClick ? "cursor-default" : "cursor-pointer hover:bg-muted/50",
      )}
    >
      {simplified ? (
        <span className="text-[13px] font-semibold" style={{ color: "var(--pref-bg)" }}>{shift_type}</span>
      ) : (
        <div className="flex flex-col gap-0 items-center">
          <span className="text-[13px] font-semibold" style={{ color: "var(--pref-bg)" }}>{shift_type}</span>
          {time && <span className="text-[10px] text-muted-foreground tabular-nums leading-tight">{time.start}–{time.end}</span>}
        </div>
      )}
      {showTask && pillLabel && pillColor && (
        <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 ml-auto", pillColor)}>
          {pillLabel}
        </span>
      )}
    </div>
  )
}
