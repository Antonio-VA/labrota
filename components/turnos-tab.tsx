"use client"

import { useState, useTransition, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { CheckCircle2 } from "lucide-react"
import { ShiftTypesTable } from "@/components/shift-types-table"
import { ShiftRotationSetting } from "@/components/shift-rotation-setting"
import { toast } from "sonner"
import type { ShiftTypeDefinition } from "@/lib/types/database"

export function TurnosTab({ initialTypes, initialRotation, rotaDisplayMode }: {
  initialTypes: ShiftTypeDefinition[]
  initialRotation: string
  rotaDisplayMode?: string
}) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [shiftSaveFn, setShiftSaveFn] = useState<(() => Promise<boolean>) | null>(null)
  const [rotationSaveFn, setRotationSaveFn] = useState<(() => Promise<void>) | null>(null)

  const registerShiftSave = useCallback((fn: () => Promise<boolean>) => setShiftSaveFn(() => fn), [])
  const registerRotationSave = useCallback((fn: () => Promise<void>) => setRotationSaveFn(() => fn), [])

  function handleSaveAll() {
    startTransition(async () => {
      const shiftOk = await shiftSaveFn?.() ?? true
      await rotationSaveFn?.()
      if (shiftOk) {
        setSaved(true)
        toast.success("Cambios guardados")
        setTimeout(() => setSaved(false), 3000)
      } else {
        toast.error("Error al guardar turnos")
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-background px-5 py-4">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Tipos de turno
        </p>
        <ShiftTypesTable
          initialTypes={initialTypes}
          hideSaveButton
          registerSave={registerShiftSave}
          daysReadOnly={rotaDisplayMode === "by_task"}
        />
      </div>

      <ShiftRotationSetting
        initialValue={initialRotation}
        registerSave={registerRotationSave}
      />

      <div className="flex items-center gap-3">
        <Button onClick={handleSaveAll} disabled={isPending}>
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-[13px] text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            Guardado
          </span>
        )}
      </div>
    </div>
  )
}
