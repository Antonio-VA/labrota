"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import { CheckCircle2, AlertCircle } from "lucide-react"
import type { LabConfig } from "@/lib/types/database"

function FieldRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-8 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[14px] font-medium">{label}</span>
        {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function BiopsiaConfig({ config }: { config: LabConfig }) {
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [values, setValues] = useState({
    biopsy_conversion_rate: config.biopsy_conversion_rate ?? 0.5,
    biopsy_day5_pct: config.biopsy_day5_pct ?? 0.5,
    biopsy_day6_pct: config.biopsy_day6_pct ?? 0.5,
  })

  function save() {
    startTransition(async () => {
      const result = await updateLabConfig(values)
      setStatus(result.error ? "error" : "success")
      if (!result.error) setTimeout(() => setStatus("idle"), 3000)
    })
  }

  return (
    <div className="rounded-lg border border-border bg-background px-5">
      <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">Biopsias</p>
      <p className="text-[13px] text-muted-foreground mb-3">Previsión de biopsias a partir de punciones programadas.</p>
      <div className="flex flex-col gap-0">
        <FieldRow label="Tasa de conversión punción → biopsia" hint="Porcentaje de punciones que resultan en biopsia">
          <div className="flex items-center gap-1.5">
            <Input
              type="number" min={0} max={100} step={1}
              value={Math.round(values.biopsy_conversion_rate * 100)}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 0 && v <= 100) setValues((p) => ({ ...p, biopsy_conversion_rate: v / 100 }))
              }}
              disabled={isPending}
              className="w-16 text-center"
            />
            <span className="text-[13px] text-muted-foreground">%</span>
          </div>
        </FieldRow>
        <FieldRow label="Distribución día 5 / día 6" hint="Distribución estimada entre día 5 y día 6 post-punción">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">D5</span>
              <Input
                type="number" min={0} max={100} step={5}
                value={Math.round(values.biopsy_day5_pct * 100)}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 0 && v <= 100) setValues((p) => ({ ...p, biopsy_day5_pct: v / 100, biopsy_day6_pct: (100 - v) / 100 }))
                }}
                disabled={isPending}
                className="w-14 text-center"
              />
            </div>
            <span className="text-muted-foreground">/</span>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">D6</span>
              <Input
                type="number" min={0} max={100} step={5}
                value={Math.round(values.biopsy_day6_pct * 100)}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 0 && v <= 100) setValues((p) => ({ ...p, biopsy_day6_pct: v / 100, biopsy_day5_pct: (100 - v) / 100 }))
                }}
                disabled={isPending}
                className="w-14 text-center"
              />
            </div>
            <span className="text-[11px] text-muted-foreground">%</span>
          </div>
        </FieldRow>
      </div>
      <div className="flex items-center gap-3 py-3">
        <Button type="button" size="sm" onClick={save} disabled={isPending}>
          {isPending ? "Guardando..." : "Guardar"}
        </Button>
        {status === "success" && <CheckCircle2 className="size-4 text-emerald-600" />}
        {status === "error" && <AlertCircle className="size-4 text-destructive" />}
      </div>
    </div>
  )
}
