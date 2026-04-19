"use client"

import { useTranslations } from "next-intl"
import { ArrowLeft } from "lucide-react"
import type { ExtraDaysData } from "@/app/(clinic)/reports/actions"

// ── Extra Days Report View ──────────────────────────────────────────────────

export function ExtraDaysReportView({ data, onBack }: { data: ExtraDaysData; onBack: () => void }) {
  const t = useTranslations("reports")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> {t("back")}
        </button>
      </div>

      <div>
        <h2 className="text-[18px] font-medium">{t("extraDays")}</h2>
        <p className="text-[13px] text-muted-foreground">{data.orgName} · {data.periodLabel}</p>
      </div>

      <div className="flex gap-4 text-[13px] text-muted-foreground">
        <span>{t("staffWithExtra")}: <strong className="text-foreground">{data.totalStaffWithExtra}</strong></span>
        <span>{t("totalExtraDays")}: <strong className="text-foreground">{data.totalExtraDays}</strong></span>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-background px-5 py-8 text-center">
          <p className="text-[14px] text-muted-foreground">{t("noExtraDays")}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("staff")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("department")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("expected")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("extra")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("totalDays")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.staffId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.color && <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />}
                      {r.firstName} {r.lastName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.department}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.daysPerWeek}d/sem</td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-amber-700">+{r.totalExtra}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.weeks.map((w) => (
                        <span key={w.weekStart} className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">
                          {w.weekStart.slice(5)} ({w.assigned}/{r.daysPerWeek})
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground italic">{t("extraDaysFooter")}</p>
    </div>
  )
}
