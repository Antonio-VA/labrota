"use client"

import { useState, useTransition, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { CheckCircle2 } from "lucide-react"
import { ShiftTypesTable } from "@/components/shift-types-table"
import { toast } from "sonner"
import type { ShiftTypeDefinition, Department } from "@/lib/types/database"

export function TurnosTab({ initialTypes, rotaDisplayMode, departments }: {
  initialTypes: ShiftTypeDefinition[]
  rotaDisplayMode?: string
  departments?: Department[]
}) {
  const t = useTranslations("turnos")
  const tc = useTranslations("common")
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [shiftSaveFn, setShiftSaveFn] = useState<(() => Promise<boolean>) | null>(null)

  const registerShiftSave = useCallback((fn: () => Promise<boolean>) => setShiftSaveFn(() => fn), [])

  function handleSaveAll() {
    startTransition(async () => {
      const shiftOk = await shiftSaveFn?.() ?? true
      if (shiftOk) {
        setSaved(true)
        toast.success(t("changesSaved"))
        setTimeout(() => setSaved(false), 3000)
      } else {
        toast.error(t("saveError"))
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-background px-5 py-4">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide mb-3">
          {t("shiftTypes")}
        </p>
        <ShiftTypesTable
          initialTypes={initialTypes}
          hideSaveButton
          registerSave={registerShiftSave}
          departments={rotaDisplayMode === "by_task" ? departments : undefined}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSaveAll} disabled={isPending}>
          {isPending ? tc("saving") : tc("save")}
        </Button>
        {saved && (
          <span className="flex items-center gap-1.5 text-[13px] text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            {tc("saved")}
          </span>
        )}
      </div>
    </div>
  )
}
