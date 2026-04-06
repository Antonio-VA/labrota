"use client"

import { useState, useEffect } from "react"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { formatDateTime, formatDateTimeDetailed } from "@/lib/format-date"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { X, ChevronLeft, ChevronRight } from "lucide-react"
import { getAuditLogs, type AuditLogEntry } from "@/app/(clinic)/lab/audit-actions"

const PAGE_SIZE = 25

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
  const locale = useLocale()
  const dateFmt = locale as "es" | "en"
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionFilter, setActionFilter] = useState("")
  const [userFilter, setUserFilter] = useState("")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [page, setPage] = useState(0)
  const [detail, setDetail] = useState<AuditLogEntry | null>(null)

  useEffect(() => {
    setLoading(true)
    setPage(0)
    getAuditLogs({
      action: actionFilter || undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      limit: 500, // fetch more, paginate client-side
    }).then((data) => { setLogs(data); setLoading(false) })
  }, [actionFilter, dateFrom, dateTo])

  // Client-side user filter
  const filtered = userFilter
    ? logs.filter((l) => l.user_email?.toLowerCase().includes(userFilter.toLowerCase()))
    : logs

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  // Unique users for filter
  const uniqueUsers = [...new Set(logs.map((l) => l.user_email).filter(Boolean))] as string[]

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-[12px] outline-none"
        >
          <option value="">{t("allActions")}</option>
          {Object.entries(ACTION_LABEL_KEYS).map(([key, labelKey]) => (
            <option key={key} value={key}>{t(labelKey)}</option>
          ))}
        </select>
        <select
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-[12px] outline-none max-w-[180px]"
        >
          <option value="">{t("allUsers")}</option>
          {uniqueUsers.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-32 h-8 text-[12px]" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-32 h-8 text-[12px]" />
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
            ) : paged.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground italic">{t("noRecords")}</td></tr>
            ) : paged.map((log) => (
              <tr
                key={log.id}
                className="border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer"
                onClick={() => setDetail(log)}
              >
                <td className="px-3 py-2 text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatDateTime(log.created_at, dateFmt)}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-[12px] text-muted-foreground">
            {t("records", { count: filtered.length, page: page + 1, total: totalPages })}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="size-8 flex items-center justify-center rounded-md border border-input text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="size-8 flex items-center justify-center rounded-md border border-input text-muted-foreground hover:text-foreground disabled:opacity-30"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Detail popup */}
      {detail && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setDetail(null)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[480px] max-h-[80vh] overflow-y-auto p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", ACTION_COLORS[detail.action] ?? "bg-muted text-muted-foreground")}>
                  {ACTION_LABEL_KEYS[detail.action] ? t(ACTION_LABEL_KEYS[detail.action]) : detail.action}
                </span>
                <span className="text-[12px] text-muted-foreground tabular-nums">
                  {formatDateTimeDetailed(detail.created_at, dateFmt)}
                </span>
              </div>
              <button onClick={() => setDetail(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground w-16 shrink-0">{t("userLabel")}</span>
                <span className="text-[13px] font-medium">{detail.user_email ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground w-16 shrink-0">{t("typeLabel")}</span>
                <span className="text-[13px]">{detail.entity_type ?? "—"}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-muted-foreground w-16 shrink-0">{t("summaryLabel")}</span>
                <span className="text-[13px]">{summarize(detail, t)}</span>
              </div>
            </div>

            {detail.metadata && Object.keys(detail.metadata).length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[12px] font-medium text-muted-foreground">{t("metadata")}</p>
                <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(detail.metadata, null, 2)}
                </pre>
              </div>
            )}

            {detail.changes && Object.keys(detail.changes).length > 0 && (
              <div className="flex flex-col gap-1">
                <p className="text-[12px] font-medium text-muted-foreground">{t("changes")}</p>
                <pre className="text-[11px] bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                  {JSON.stringify(detail.changes, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
