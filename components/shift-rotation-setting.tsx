"use client"

import { useState, useTransition } from "react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import { ArrowRightLeft, RefreshCw, Lock } from "lucide-react"

type RotationMode = "stable" | "weekly" | "daily"

const OPTIONS: { key: RotationMode; label: string; desc: string; icon: typeof Lock }[] = [
  { key: "stable", label: "Estable", desc: "Misma persona, mismo turno cada semana", icon: Lock },
  { key: "weekly", label: "Rotación semanal", desc: "Mismo turno toda la semana, cambia la siguiente", icon: RefreshCw },
  { key: "daily", label: "Rotación diaria", desc: "Cada día un turno diferente dentro de la semana", icon: ArrowRightLeft },
]

export function ShiftRotationSetting({ initialValue }: { initialValue: string }) {
  const [value, setValue] = useState<RotationMode>((initialValue as RotationMode) || "stable")
  const [isPending, startTransition] = useTransition()

  function handleChange(mode: RotationMode) {
    setValue(mode)
    startTransition(async () => {
      const result = await updateLabConfig({ shift_rotation: mode })
      if (result?.error) { toast.error(result.error); return }
      toast.success("Rotación de turnos actualizada")
    })
  }

  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4">
      <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
        Rotación de turnos
      </p>
      <p className="text-[12px] text-muted-foreground mb-3">
        Define cómo se asignan los turnos cuando no hay preferencia de técnica o turno personal.
      </p>
      <div className="flex flex-col gap-2">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon
          const selected = value === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              disabled={isPending}
              onClick={() => handleChange(opt.key)}
              className={cn(
                "flex items-start gap-3 rounded-lg p-3 text-left transition-all duration-200",
                selected
                  ? "bg-primary/5"
                  : "hover:bg-muted/50"
              )}
              style={{ border: `2px solid ${selected ? "var(--primary)" : "var(--border)"}` }}
            >
              <Icon className={cn("size-4 mt-0.5 shrink-0", selected ? "text-primary" : "text-muted-foreground")} />
              <div>
                <p className={cn("text-[14px] font-medium", selected && "text-primary")}>{opt.label}</p>
                <p className="text-[12px] text-muted-foreground">{opt.desc}</p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
