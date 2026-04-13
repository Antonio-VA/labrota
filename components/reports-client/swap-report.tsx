"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { ArrowLeft, FileDown, FileSpreadsheet, ArrowLeftRight } from "lucide-react"
import type { SwapReportData } from "@/app/(clinic)/reports/actions"
import { formatDateWithYear } from "@/lib/format-date"

// ── Swap requests report ─────────────────────────────────────────────────────

const SWAP_TYPE_LABEL: Record<string, Record<string, string>> = {
  es: { shift_swap: "Cambio de turno", day_off: "Día libre (cobertura)" },
  en: { shift_swap: "Shift swap", day_off: "Day off (coverage)" },
}

const SWAP_STATUS_LABEL: Record<string, Record<string, string>> = {
  es: { pending_manager: "Pendiente de aprobación", manager_approved: "Aprobado (pendiente aceptación)", pending_target: "Pendiente de aceptación", approved: "Aprobado", rejected: "Rechazado", cancelled: "Cancelado" },
  en: { pending_manager: "Pending approval", manager_approved: "Approved (pending acceptance)", pending_target: "Pending acceptance", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" },
}

const SWAP_STATUS_COLOR: Record<string, string> = {
  pending_manager: "bg-amber-100 text-amber-700",
  manager_approved: "bg-amber-100 text-amber-700",
  pending_target: "bg-blue-100 text-blue-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
}

export function SwapReportView({ data, onBack }: { data: SwapReportData; onBack: () => void }) {
  const t = useTranslations("reports")
  const locale = (typeof window !== "undefined" ? document.cookie.match(/locale=(\w+)/)?.[1] : "es") as "es" | "en" ?? "es"

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="size-8 rounded-lg flex items-center justify-center hover:bg-muted transition-colors">
          <ArrowLeft className="size-4" />
        </button>
        <div>
          <p className="text-[18px] font-medium">{t("swapRequests")}</p>
          <p className="text-[12px] text-muted-foreground">{data.periodLabel}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="rounded-lg border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("totalRequests")}</p>
          <p className="text-[24px] font-semibold">{data.totalRequests}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("swapApproved")}</p>
          <p className="text-[24px] font-semibold text-green-600">{data.approved}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("swapRejected")}</p>
          <p className="text-[24px] font-semibold text-red-600">{data.rejected}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("swapPending")}</p>
          <p className="text-[24px] font-semibold text-amber-600">{data.pending}</p>
        </div>
        <div className="rounded-lg border border-border p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{t("swapCancelled")}</p>
          <p className="text-[24px] font-semibold text-gray-500">{data.cancelled}</p>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <p className="text-[14px] text-muted-foreground py-8 text-center">{t("noSwapRequests")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t("swapInitiator")}</th>
                <th className="py-2 pr-3 font-medium">{t("swapTarget")}</th>
                <th className="py-2 pr-3 font-medium">{t("swapType")}</th>
                <th className="py-2 pr-3 font-medium">{t("swapDate")}</th>
                <th className="py-2 pr-3 font-medium">{t("swapShift")}</th>
                <th className="py-2 pr-3 font-medium">{t("swapStatus")}</th>
                <th className="py-2 pr-3 font-medium">{t("swapRequested")}</th>
                <th className="py-2 pr-3 font-medium">{t("swapManagerReview")}</th>
                <th className="py-2 font-medium">{t("swapTargetResponse")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-border/50">
                  <td className="py-2 pr-3 font-medium">{row.initiatorName}</td>
                  <td className="py-2 pr-3">{row.targetName ?? "—"}</td>
                  <td className="py-2 pr-3">{SWAP_TYPE_LABEL[locale]?.[row.swapType] ?? row.swapType}</td>
                  <td className="py-2 pr-3">{formatDateWithYear(row.swapDate, locale)}</td>
                  <td className="py-2 pr-3">{row.shiftType}</td>
                  <td className="py-2 pr-3">
                    <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded", SWAP_STATUS_COLOR[row.status] ?? "")}>
                      {SWAP_STATUS_LABEL[locale]?.[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-muted-foreground">{formatDateWithYear(row.requestedAt.split("T")[0], locale)}</td>
                  <td className="py-2 pr-3 text-muted-foreground">{row.managerReviewedAt ? formatDateWithYear(row.managerReviewedAt.split("T")[0], locale) : "—"}</td>
                  <td className="py-2 text-muted-foreground">{row.targetRespondedAt ? formatDateWithYear(row.targetRespondedAt.split("T")[0], locale) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground italic">{t("swapReportFooter")}</p>
    </div>
  )
}
