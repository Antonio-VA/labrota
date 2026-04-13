"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowLeft, FileDown, FileSpreadsheet } from "lucide-react"
import type { UnpaidLeaveReportData } from "@/app/(clinic)/reports/actions"
import { formatDateWithYear } from "@/lib/format-date"

// ── Unpaid Leave Report View ──────────────────────────────────────────────────

export function UnpaidLeaveReportView({ data, onBack }: { data: UnpaidLeaveReportData; onBack: () => void }) {
  const t = useTranslations("reports")
  const DEPT_COLORS: Record<string, string> = { lab: "#2563eb", andrology: "#059669", admin: "#64748b" }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={onBack}><ArrowLeft className="size-4" /></Button>
        <div>
          <h2 className="text-[14px] font-medium">{t("unpaidLeave")}</h2>
          <p className="text-[12px] text-muted-foreground">{data.orgName} · {data.periodLabel}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <p className="text-[12px] text-muted-foreground uppercase">{t("staffWithUnpaid")}</p>
          <p className="text-[18px] font-semibold mt-1">{data.totalStaff}</p>
        </div>
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <p className="text-[12px] text-muted-foreground uppercase">{t("totalUnpaidDays")}</p>
          <p className="text-[18px] font-semibold mt-1">{data.totalUnpaidDays}</p>
        </div>
      </div>

      {/* Table */}
      {data.rows.length === 0 ? (
        <p className="text-[14px] text-muted-foreground text-center py-8">—</p>
      ) : (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("staffName")}</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{t("department")}</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">{t("unpaidLeaveDays")}</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">{t("unpaidSickDays")}</th>
                <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">{t("totalUnpaidCol")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.staffId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color || DEPT_COLORS[r.department] || "#64748b" }} />
                      <span className="font-medium">{r.staffName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{r.department}</td>
                  <td className="px-4 py-2.5 text-center">{r.unpaidLeaveDays || "—"}</td>
                  <td className="px-4 py-2.5 text-center">{r.unpaidSickDays || "—"}</td>
                  <td className="px-4 py-2.5 text-center font-medium">{r.totalUnpaid}</td>
                </tr>
              ))}
              {/* Totals row */}
              <tr className="bg-muted/30 font-medium">
                <td className="px-4 py-2.5" colSpan={2}>{t("total")}</td>
                <td className="px-4 py-2.5 text-center">{data.rows.reduce((s, r) => s + r.unpaidLeaveDays, 0)}</td>
                <td className="px-4 py-2.5 text-center">{data.rows.reduce((s, r) => s + r.unpaidSickDays, 0)}</td>
                <td className="px-4 py-2.5 text-center">{data.totalUnpaidDays}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Export buttons */}
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => {
          import("@/lib/export-report-pdf").then((m) => m.exportUnpaidLeavePdf(data))
        }}>
          <FileDown className="size-4 mr-1.5" />PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => {
          import("@/lib/export-report-excel").then((m) => m.exportUnpaidLeaveExcel(data))
        }}>
          <FileSpreadsheet className="size-4 mr-1.5" />Excel
        </Button>
      </div>
    </div>
  )
}
