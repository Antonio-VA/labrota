"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { getAuditLogs, type AuditLogEntry } from "@/app/(clinic)/lab/audit-actions"

const ACTION_LABEL_KEYS: Record<string, string> = {
  rota_generated: "rotaGenerated",
  rota_published: "rotaPublished",
  rota_deleted: "rotaDeleted",
  assignment_changed: "assignmentChanged",
  config_change: "configChange",
  staff_created: "staffCreated",
  staff_updated: "staffUpdated",
  leave_created: "leaveCreated",
  leave_deleted: "leaveDeleted",
  day_regenerated: "dayRegenerated",
  skill_updated: "skillUpdated",
  user_invited: "userInvited",
  user_role_changed: "userRoleChanged",
  user_removed: "userRemoved",
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
  user_invited: "bg-teal-100 text-teal-700",
  user_role_changed: "bg-purple-100 text-purple-700",
  user_removed: "bg-red-100 text-red-700",
}

function summarize(entry: AuditLogEntry, t: ReturnType<typeof useTranslations<"audit">>): string {
  const m = entry.metadata as Record<string, unknown> | null
  switch (entry.action) {
    case "rota_generated":
      return t("weekSummary", { weekStart: String(m?.weekStart ?? "?"), count: String(m?.assignmentCount ?? 0), method: String(m?.method ?? "") })
    case "rota_published":
      return t("schedulePublished")
    case "assignment_changed":
      return `${m?.date ?? ""} · ${m?.shiftType ?? ""} ${m?.functionLabel ? `· ${m.functionLabel}` : ""}`
    case "config_change": {
      const keys = Object.keys(entry.changes ?? {})
      return keys.length > 0 ? keys.join(", ") : t("configuration")
    }
    case "staff_created":
      return `${m?.firstName ?? ""} ${m?.lastName ?? ""} · ${m?.role ?? ""}`
    case "day_regenerated":
      return `${m?.date ?? ""} · ${m?.count ?? 0}`
    default:
      return entry.entity_type ?? ""
  }
}

export function AuditLogViewer() {
  const t = useTranslations("audit")
  const tc = useTranslations("common")
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
          <option value="">{t("allActions")}</option>
          {Object.entries(ACTION_LABEL_KEYS).map(([key, labelKey]) => (
            <option key={key} value={key}>{t(labelKey)}</option>
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
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("dateColumn")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("userColumn")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("actionColumn")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("detailColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">{tc("loading")}</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground italic">{t("noRecords")}</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                  {new Date(log.created_at).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </td>
                <td className="px-3 py-2 truncate max-w-[150px]">{log.user_email ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground")}>
                    {ACTION_LABEL_KEYS[log.action] ? t(ACTION_LABEL_KEYS[log.action]) : log.action}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground truncate max-w-[300px]">{summarize(log, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
