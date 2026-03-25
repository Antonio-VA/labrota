"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { getAuditLogs, type AuditLogEntry } from "@/app/(clinic)/lab/audit-actions"

const ACTION_LABELS: Record<string, string> = {
  rota_generated: "Rota generada",
  rota_published: "Rota publicada",
  rota_deleted: "Rota eliminada",
  assignment_changed: "Asignación modificada",
  config_change: "Configuración actualizada",
  staff_created: "Personal creado",
  staff_updated: "Personal actualizado",
  leave_created: "Ausencia creada",
  leave_deleted: "Ausencia eliminada",
  day_regenerated: "Día regenerado",
  skill_updated: "Habilidad actualizada",
}

const ACTION_COLORS: Record<string, string> = {
  rota_generated: "bg-blue-100 text-blue-700",
  rota_published: "bg-emerald-100 text-emerald-700",
  rota_deleted: "bg-red-100 text-red-700",
  assignment_changed: "bg-amber-100 text-amber-700",
  config_change: "bg-purple-100 text-purple-700",
  staff_created: "bg-teal-100 text-teal-700",
  staff_updated: "bg-teal-100 text-teal-700",
  day_regenerated: "bg-blue-100 text-blue-700",
}

function summarize(entry: AuditLogEntry): string {
  const m = entry.metadata as Record<string, unknown> | null
  switch (entry.action) {
    case "rota_generated":
      return `Semana ${m?.weekStart ?? "?"} · ${m?.assignmentCount ?? 0} asignaciones · ${m?.method ?? ""}`
    case "rota_published":
      return "Horario publicado"
    case "assignment_changed":
      return `${m?.date ?? ""} · Turno ${m?.shiftType ?? ""} ${m?.functionLabel ? `· ${m.functionLabel}` : ""}`
    case "config_change": {
      const keys = Object.keys(entry.changes ?? {})
      return keys.length > 0 ? keys.join(", ") : "Configuración"
    }
    case "staff_created":
      return `${m?.firstName ?? ""} ${m?.lastName ?? ""} · ${m?.role ?? ""}`
    case "day_regenerated":
      return `${m?.date ?? ""} · ${m?.count ?? 0} asignaciones`
    default:
      return entry.entity_type ?? ""
  }
}

export function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  useEffect(() => {
    setLoading(true)
    getAuditLogs({
      action: actionFilter || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
    }).then((data) => { setLogs(data); setLoading(false) })
  }, [actionFilter, dateFrom, dateTo])

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] outline-none"
        >
          <option value="">Todas las acciones</option>
          {Object.entries(ACTION_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-8 text-[13px]" placeholder="Desde" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-8 text-[13px]" placeholder="Hasta" />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Fecha</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Usuario</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Acción</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">Cargando...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground italic">Sin registros</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-3 py-2 truncate max-w-[150px]">{log.user_email ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground")}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-[300px]">{summarize(log)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
