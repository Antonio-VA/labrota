"use client"

import { CheckCircle2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"

export function SettingsImplementation({
  status,
}: {
  status: {
    hasRegion: boolean
    departmentCount: number
    shiftCount: number
    taskCount: number
    staffCount: number
    hasRota: boolean
    rotaCount: number
  }
}) {
  const steps = [
    { label: "Crear organización", desc: "Organización registrada", done: true },
    { label: "Configurar región", desc: "País y región configurados", done: status.hasRegion },
    { label: "Añadir departamentos", desc: `${status.departmentCount} departamento${status.departmentCount !== 1 ? "s" : ""}`, done: status.departmentCount > 0 },
    { label: "Añadir turnos", desc: `${status.shiftCount} turno${status.shiftCount !== 1 ? "s" : ""}`, done: status.shiftCount > 0 },
    { label: "Añadir tareas", desc: `${status.taskCount} tarea${status.taskCount !== 1 ? "s" : ""}`, done: status.taskCount > 0 },
    { label: "Añadir equipo", desc: `${status.staffCount} persona${status.staffCount !== 1 ? "s" : ""} activa${status.staffCount !== 1 ? "s" : ""}`, done: status.staffCount > 0 },
    { label: "Generar primera rota", desc: status.hasRota ? `${status.rotaCount} horario${status.rotaCount !== 1 ? "s" : ""}` : "Aún sin horarios", done: status.hasRota },
  ]
  const allDone = steps.every((s) => s.done)
  const completedCount = steps.filter((s) => s.done).length

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      {allDone ? (
        <div className="px-4 py-4 flex items-center gap-2">
          <CheckCircle2 className="size-5 text-emerald-500" />
          <span className="text-[14px] font-medium text-emerald-600">Implementación completada</span>
        </div>
      ) : (
        <>
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <span className="text-[12px] text-muted-foreground">{completedCount}/{steps.length} pasos completados</span>
          </div>
          <div className="divide-y divide-border/50">
            {steps.map((step, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                {step.done ? (
                  <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                ) : (
                  <Circle className="size-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                )}
                <div>
                  <p className={cn("text-[13px] font-medium", step.done ? "text-foreground" : "text-muted-foreground")}>{step.label}</p>
                  <p className="text-[11px] text-muted-foreground">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
