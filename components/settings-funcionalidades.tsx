"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toggleLeaveRequests } from "@/app/(clinic)/settings/actions"

export function SettingsFuncionalidades({
  displayMode,
  enableLeaveRequests,
}: {
  displayMode: "by_shift" | "by_task"
  enableLeaveRequests: boolean
}) {
  const [leaveRequests, setLeaveRequests] = useState(enableLeaveRequests)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
      {/* Display mode — read only for clinic admins */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[14px] font-medium">Modo de horario</p>
          <p className="text-[12px] text-muted-foreground">
            {displayMode === "by_shift"
              ? "Por turno — el personal se asigna a turnos"
              : "Por tarea — el personal se asigna a procedimientos"}
          </p>
        </div>
        <span className={cn(
          "px-3 py-1 rounded-md text-[13px] font-medium",
          displayMode === "by_task" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"
        )}>
          {displayMode === "by_task" ? "Por tarea" : "Por turno"}
        </span>
      </div>
      <p className="text-[11px] text-muted-foreground -mt-2">Contacta con soporte para cambiar el modo de horario.</p>

      <div className="h-px bg-border" />

      {/* Leave requests */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[14px] font-medium">Solicitud de ausencias</p>
          <p className="text-[12px] text-muted-foreground">
            Permite al personal solicitar vacaciones y ausencias desde la app
          </p>
        </div>
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            const val = !leaveRequests
            setLeaveRequests(val)
            startTransition(async () => {
              const result = await toggleLeaveRequests(val)
              if (result.error) { toast.error(result.error); setLeaveRequests(!val) }
            })
          }}
          className={cn(
            "relative w-10 h-6 rounded-full transition-colors shrink-0 disabled:opacity-50",
            leaveRequests ? "bg-primary" : "bg-muted-foreground/20"
          )}
        >
          <span className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform",
            leaveRequests ? "translate-x-[18px]" : "translate-x-0.5"
          )} />
        </button>
      </div>
    </div>
  )
}
