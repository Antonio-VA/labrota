"use client"

import { Lock } from "lucide-react"
import { Input } from "@/components/ui/input"

export type Billing = {
  start: string | null
  end: string | null
  fee: number | null
}

export function BillingSection({
  billing,
  setBilling,
  disabled,
}: {
  billing: Billing
  setBilling: React.Dispatch<React.SetStateAction<Billing>>
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-muted-foreground">Inicio</label>
            <Input
              type="date"
              value={billing.start ?? ""}
              onChange={(e) => setBilling((p) => ({ ...p, start: e.target.value || null }))}
              disabled={disabled}
              className="w-40 h-8 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-muted-foreground">Renovación</label>
            <Input
              type="date"
              value={billing.end ?? ""}
              onChange={(e) => setBilling((p) => ({ ...p, end: e.target.value || null }))}
              disabled={disabled}
              className="w-40 h-8 text-[13px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-muted-foreground">Cuota anual (€)</label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} step={100}
                value={billing.fee ?? ""}
                onChange={(e) => setBilling((p) => ({ ...p, fee: e.target.value ? parseFloat(e.target.value) : null }))}
                disabled={disabled}
                className="w-28 h-8 text-[13px]"
              />
              {(!billing.fee || billing.fee === 0) && (
                <span className="text-[11px] text-emerald-600 font-medium">Prueba gratuita</span>
              )}
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Lock className="size-3" />
          Solo visible y editable por super admin. Los administradores de la clínica no ven esta sección.
        </p>
      </div>
    </div>
  )
}
