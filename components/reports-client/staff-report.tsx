"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowLeft, FileDown, FileSpreadsheet } from "lucide-react"
import type { StaffReportData } from "@/app/(clinic)/reports/actions"
import { formatDateWithYear } from "@/lib/format-date"

// ── Staff Report View ────────────────────────────────────────────────────────

export function StaffReportView({ data, onBack }: { data: StaffReportData; onBack: () => void }) {
  const t = useTranslations("reports")

  async function exportPdf() {
    const { exportStaffReportPdf } = await import("@/lib/export-report-pdf")
    exportStaffReportPdf(data)
  }
  async function exportExcel() {
    const { exportStaffReportExcel } = await import("@/lib/export-report-excel")
    exportStaffReportExcel(data)
  }

  const colHeader = data.mode === "by_task" ? t("assignments") : t("shifts")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> {t("back")}
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf}><FileDown className="size-3.5 mr-1.5" />PDF</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="size-3.5 mr-1.5" />Excel</Button>
        </div>
      </div>

      <div>
        <h2 className="text-[18px] font-medium">{t("staffSummary")}</h2>
        <p className="text-[13px] text-muted-foreground">{data.orgName} · {data.periodLabel}</p>
      </div>

      <div className="flex gap-4 text-[13px] text-muted-foreground">
        <span>{t("totalDays")}: <strong className="text-foreground">{data.totalDays}</strong></span>
        <span>{t("meanLabel", { column: colHeader.toLowerCase() })}: <strong className="text-foreground">{data.meanAssignments}</strong></span>
        <span>{t("activeStaff")}: <strong className="text-foreground">{data.activeStaff}</strong></span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("staff")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("department")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{colHeader}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("daysOff")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("absence")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("vsMean")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const threshold = data.meanAssignments * 0.3
              const isHigh = r.vsMean > threshold
              const isLow = r.vsMean < -threshold
              return (
                <tr
                  key={r.staffId}
                  className={cn(
                    "border-b border-border last:border-0",
                    isHigh && "bg-amber-50 dark:bg-amber-950/20",
                    isLow && "bg-blue-50 dark:bg-blue-950/20"
                  )}
                >
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.color && <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />}
                      {r.firstName} {r.lastName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.department}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.assignments}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.daysOff}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.daysLeave}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-medium", isHigh && "text-amber-700", isLow && "text-blue-700")}>
                    {r.vsMean > 0 ? "+" : ""}{r.vsMean}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        {t("staffReportFooter")}
      </p>
    </div>
  )
}
