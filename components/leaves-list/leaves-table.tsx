"use client"

import { Info, Cloud, Paperclip } from "lucide-react"
import { formatDateWithYear } from "@/lib/format-date"
import { countDays } from "@/lib/hr-balance-engine"
import { cn } from "@/lib/utils"
import { daysBetween, LeaveTypeBadge, StatusBadge } from "./constants"
import type { LeaveWithStaff } from "@/lib/types/database"
import type { useTranslations } from "next-intl"

// ── Mobile leave card ────────────────────────────────────────────────────────

function LeaveCard({
  leave,
  locale,
  onEdit,
  onCancel,
  t,
  muted,
  showStatus,
  canCancel,
  hideStaffName,
}: {
  leave: LeaveWithStaff
  locale: "es" | "en"
  onEdit: (leave: LeaveWithStaff) => void
  onCancel?: (leaveId: string) => void
  t: ReturnType<typeof useTranslations<"leaves">>
  muted: boolean
  showStatus?: boolean
  canCancel?: boolean
  hideStaffName?: boolean
}) {
  const days = daysBetween(leave.start_date, leave.end_date)
  return (
    <div
      className={cn("rounded-lg border border-border bg-background px-3.5 py-3 active:bg-muted/40 transition-colors", muted && "opacity-70")}
      onClick={() => onEdit(leave)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        {!hideStaffName && (
          <p className={cn("text-[14px] font-medium leading-tight", muted && "text-muted-foreground")}>
            {leave.staff ? `${leave.staff.first_name} ${leave.staff.last_name}` : "—"}
          </p>
        )}
        {showStatus && <StatusBadge leave={leave} t={t} />}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <LeaveTypeBadge type={leave.type} label={t(`types.${leave.type}`)} />
        {leave.source === "outlook" && (
          <span className="inline-flex items-center gap-1 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 text-[11px] font-medium text-blue-600 dark:text-blue-400" title="Synced from Outlook">
            <Cloud className="size-2.5" />
            Outlook
          </span>
        )}
        <span className={cn("text-[12px]", muted ? "text-muted-foreground" : "text-foreground/70")}>
          {formatDateWithYear(leave.start_date, locale)} — {formatDateWithYear(leave.end_date, locale)}
        </span>
        <span className="text-[12px] text-muted-foreground">({days}d)</span>
        {leave.attachment_url && (
          <a href={leave.attachment_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
            <Paperclip className="size-3" />
          </a>
        )}
      </div>
      {onCancel && canCancel && (
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(leave.id) }}
          className="mt-2 text-[12px] text-muted-foreground hover:text-destructive transition-colors"
        >
          {t("cancelLeave")}
        </button>
      )}
    </div>
  )
}

// ── Leaves table + mobile cards ──────────────────────────────────────────────

export function LeavesTable({
  rows,
  locale,
  onEdit,
  onCancel,
  t,
  muted,
  showStatus,
  canCancel,
  hideStaffColumn,
  showLeaveDays,
  holidayConfig,
}: {
  rows: LeaveWithStaff[]
  locale: "es" | "en"
  onEdit: (leave: LeaveWithStaff) => void
  onCancel?: (leaveId: string) => void
  t: ReturnType<typeof useTranslations<"leaves">>
  muted: boolean
  showStatus?: boolean
  canCancel?: (leave: LeaveWithStaff) => boolean
  hideStaffColumn?: boolean
  showLeaveDays?: boolean
  holidayConfig?: { counting_method: string; public_holidays_deducted: boolean } | null
}) {
  const cellClass = muted ? "text-muted-foreground" : ""

  function getLeaveDays(leave: LeaveWithStaff): number {
    if (leave.days_counted != null) return leave.days_counted
    if (!holidayConfig) return 0
    return countDays(leave.start_date, leave.end_date, {
      counting_method: holidayConfig.counting_method as "working_days" | "calendar_days",
      public_holidays_deducted: holidayConfig.public_holidays_deducted,
    })
  }

  return (
    <>
      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden mb-3">
        {rows.map((leave) => (
          <LeaveCard
            key={leave.id}
            leave={leave}
            locale={locale}
            onEdit={onEdit}
            onCancel={onCancel}
            t={t}
            muted={muted}
            showStatus={showStatus}
            canCancel={canCancel?.(leave)}
            hideStaffName={hideStaffColumn}
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className={`hidden md:block rounded-lg border border-border overflow-hidden mb-3 bg-background ${muted ? "opacity-70" : ""}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {!hideStaffColumn && <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">{t("columns.staff")}</th>}
              <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">{t("columns.type")}</th>
              <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">{t("columns.from")}</th>
              <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">{t("columns.to")}</th>
              <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">{t("columns.days")}</th>
              {showLeaveDays && (
                <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    {t("columns.leaveDays")}
                    <span title={t("columns.leaveDaysTooltip")} className="cursor-help"><Info className="size-3 text-muted-foreground/60" /></span>
                  </span>
                </th>
              )}
              {showStatus && <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">{t("columns.status")}</th>}
              {onCancel && <th className="w-16" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((leave, idx) => (
              <tr
                key={leave.id}
                className={cn(
                  "border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer",
                  idx % 2 === 1 && "bg-muted/15"
                )}
                onClick={() => onEdit(leave)}
              >
                {!hideStaffColumn && (
                  <td className={`px-4 py-2.5 font-medium ${cellClass}`}>
                    {leave.staff ? `${leave.staff.first_name} ${leave.staff.last_name}` : "—"}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <LeaveTypeBadge type={leave.type} label={t(`types.${leave.type}`)} />
                    {leave.source === "outlook" && (
                      <span title="Synced from Outlook"><Cloud className="size-3.5 text-blue-500" /></span>
                    )}
                    {leave.attachment_url && (
                      <a href={leave.attachment_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title={locale === "es" ? "Ver adjunto" : "View attachment"}>
                        <Paperclip className="size-3.5 text-muted-foreground hover:text-primary transition-colors" />
                      </a>
                    )}
                  </div>
                </td>
                <td className={`px-4 py-2.5 ${cellClass}`}>{formatDateWithYear(leave.start_date, locale)}</td>
                <td className={`px-4 py-2.5 ${cellClass}`}>{formatDateWithYear(leave.end_date, locale)}</td>
                <td className={`px-4 py-2.5 ${cellClass}`}>{daysBetween(leave.start_date, leave.end_date)}</td>
                {showLeaveDays && (
                  <td className={`px-4 py-2.5 font-medium ${cellClass}`}>{getLeaveDays(leave)}</td>
                )}
                {showStatus && (
                  <td className="px-4 py-2.5">
                    <StatusBadge leave={leave} t={t} />
                  </td>
                )}
                {onCancel && (
                  <td className="px-4 py-2.5">
                    {canCancel?.(leave) && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onCancel(leave.id) }}
                        className="text-[12px] text-muted-foreground hover:text-destructive transition-colors"
                      >
                        {t("cancelLeave")}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
