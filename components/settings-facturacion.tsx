"use client"

import { Lock } from "lucide-react"

export function SettingsFacturacion({
  billingStart,
  billingEnd,
  billingFee,
}: {
  billingStart: string | null
  billingEnd: string | null
  billingFee: number | null
}) {
  const fmt = (d: string | null) => {
    if (!d) return "—"
    try { return new Date(d + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" }) } catch { return d }
  }

  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-muted-foreground">Inicio</span>
          <span className="text-[14px] font-medium">{fmt(billingStart)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-muted-foreground">Fin</span>
          <span className="text-[14px] font-medium">{fmt(billingEnd)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-muted-foreground">Cuota anual</span>
          <span className="text-[14px] font-medium">{billingFee != null ? `${billingFee.toLocaleString("es-ES")} €` : "—"}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Lock className="size-3" />
        La facturación es gestionada por LabRota. Contacta con soporte para cualquier cambio.
      </p>
    </div>
  )
}
