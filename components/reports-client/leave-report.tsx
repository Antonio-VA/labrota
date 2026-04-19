"use client"

import { useTranslations } from "next-intl"
import { ArrowLeft } from "lucide-react"
import type { LeaveReportData } from "@/app/(clinic)/reports/actions"

// ── Leave Report View ───────────────────────────────────────────────────────

export function LeaveReportView({ data, onBack }: { data: LeaveReportData; onBack: () => void }) {
  const t = useTranslations("reports")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> {t("back")}
        </button>
      </div>

      <div>
        <h2 className="text-[18px] font-medium">{t("confirmedLeaves")}</h2>
        <p className="text-[13px] text-muted-foreground">{data.orgName} · {data.periodLabel}</p>
      </div>

      <div className="flex gap-4 text-[13px] text-muted-foreground">
        <span>{t("confirmedLeaves")}: <strong className="text-foreground">{data.totalLeaves}</strong></span>
        <span>{t("leaveDays")}: <strong className="text-foreground">{data.totalDays}</strong></span>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-background px-5 py-8 text-center">
          <p className="text-[14px] text-muted-foreground">{t("noLeaves")}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("staff")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("department")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("leaveType")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("leaveStart")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("leaveEnd")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("leaveDays")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.leaveId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.color && <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />}
                      {r.staffName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.department}</td>
                  <td className="px-3 py-2">{t(`leaveTypes.${r.type}` as Parameters<typeof t>[0])}</td>
                  <td className="px-3 py-2 tabular-nums">{r.startDate}</td>
                  <td className="px-3 py-2 tabular-nums">{r.endDate}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground italic">{t("leavesFooter")}</p>
    </div>
  )
}
