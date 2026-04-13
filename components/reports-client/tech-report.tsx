"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowLeft, FileDown, FileSpreadsheet } from "lucide-react"
import type { TechReportData } from "@/app/(clinic)/reports/actions"
import { formatDateWithYear } from "@/lib/format-date"

// ── Tech Coverage Report View ────────────────────────────────────────────────

export function TechReportView({ data, onBack }: { data: TechReportData; onBack: () => void }) {
  const t = useTranslations("reports")

  async function exportPdf() {
    const { exportTechReportPdf } = await import("@/lib/export-report-pdf")
    exportTechReportPdf(data)
  }
  async function exportExcel() {
    const { exportTechReportExcel } = await import("@/lib/export-report-excel")
    exportTechReportExcel(data)
  }

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
        <h2 className="text-[18px] font-medium">{t("taskCoverage")}</h2>
        <p className="text-[13px] text-muted-foreground">{data.orgName} · {data.periodLabel}</p>
      </div>

      <div className="flex gap-4 text-[13px] text-muted-foreground">
        <span>{t("totalDays")}: <strong className="text-foreground">{data.totalDays}</strong></span>
        <span>{t("configuredTasks")}: <strong className="text-foreground">{data.techniqueCount}</strong></span>
        <span>{t("daysWithGaps")}: <strong className="text-foreground">{data.daysWithGaps}</strong></span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("task")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("daysCovered")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("daysUncovered")}</th>
              <th className="px-3 py-2 font-medium text-muted-foreground w-[180px]">{t("coveragePct")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("qualifiedStaff")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={r.codigo}
                className={cn(
                  "border-b border-border last:border-0",
                  r.coveragePct === 0 && "bg-red-50 dark:bg-red-950/20",
                  r.coveragePct > 0 && r.coveragePct < 80 && "bg-amber-50 dark:bg-amber-950/20"
                )}
              >
                <td className="px-3 py-2 font-medium">{r.nombre}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.daysCovered}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.daysUncovered}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          r.coveragePct >= 80 ? "bg-emerald-500" : r.coveragePct > 0 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${r.coveragePct}%` }}
                      />
                    </div>
                    <span className="text-[12px] tabular-nums w-10 text-right">{r.coveragePct}%</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.qualifiedStaff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        {t("techReportFooter")}
      </p>
    </div>
  )
}
