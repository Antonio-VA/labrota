"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { toggleLeaveRequests } from "@/app/(clinic)/settings/actions"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"

function FeatureToggle({ label, description, enabled, onToggle, disabled }: {
  label: string; description: string; enabled: boolean; onToggle: () => void; disabled: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-[14px] font-medium">{label}</p>
        <p className="text-[12px] text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={disabled}
        onClick={onToggle}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50",
          enabled ? "bg-emerald-500" : "bg-muted-foreground/20"
        )}
      >
        <span className={cn(
          "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          enabled ? "translate-x-5" : "translate-x-0"
        )} />
      </button>
    </div>
  )
}

export function SettingsFuncionalidades({
  displayMode,
  enableLeaveRequests,
  enableNotes,
  enableTaskInShift,
}: {
  displayMode: "by_shift" | "by_task"
  enableLeaveRequests: boolean
  enableNotes: boolean
  enableTaskInShift: boolean
}) {
  const [leaveRequests, setLeaveRequests] = useState(enableLeaveRequests)
  const [notes, setNotes] = useState(enableNotes)
  const [taskInShift, setTaskInShift] = useState(enableTaskInShift)
  const [isPending, startTransition] = useTransition()

  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
      {/* Display mode — read only */}
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

      <FeatureToggle
        label="Solicitud de ausencias"
        description="Permite al personal solicitar vacaciones y ausencias desde la app"
        enabled={leaveRequests}
        disabled={isPending}
        onToggle={() => {
          const val = !leaveRequests
          setLeaveRequests(val)
          startTransition(async () => {
            const result = await toggleLeaveRequests(val)
            if (result.error) { toast.error(result.error); setLeaveRequests(!val) }
          })
        }}
      />

      <div className="h-px bg-border" />

      <FeatureToggle
        label="Notas en el horario"
        description="Añade notas diarias al pie del horario (instrucciones, recordatorios)"
        enabled={notes}
        disabled={isPending}
        onToggle={() => {
          const val = !notes
          setNotes(val)
          startTransition(async () => {
            const result = await updateLabConfig({ enable_notes: val })
            if (result.error) { toast.error(result.error); setNotes(!val) }
          })
        }}
      />

      {displayMode === "by_shift" && (<>
        <div className="h-px bg-border" />

        <FeatureToggle
          label="Asignación de tareas en horario por turno"
          description="Permite asignar tareas o subdepartamentos a cada persona dentro de su turno. Actívalo solo si tu laboratorio necesita este nivel de detalle."
          enabled={taskInShift}
          disabled={isPending}
          onToggle={() => {
            const val = !taskInShift
            setTaskInShift(val)
            startTransition(async () => {
              const result = await updateLabConfig({ enable_task_in_shift: val } as any)
              if (result.error) { toast.error(result.error); setTaskInShift(!val) }
            })
          }}
        />
      </>)}
    </div>
  )
}
