"use client"

import { useTranslations, useLocale } from "next-intl"
import { calculateBalance } from "@/lib/hr-balance-engine"
import { formatDate } from "@/lib/format-date"
import type {
  CompanyLeaveType,
  HolidayBalance,
  HolidayConfig,
  Leave,
} from "@/lib/types/database"
import type { DayCountConfig } from "@/lib/hr-balance-engine"

interface Props {
  leaveTypes: CompanyLeaveType[]
  balances: HolidayBalance[]
  config: HolidayConfig
  leaves: Leave[]
  year: number
  enableLeaveRequests?: boolean
}

const LEGACY_MAP: Record<string, string[]> = {
  annual: ["vacaciones", "annual leave"],
  sick: ["baja por enfermedad", "sick leave"],
}

function matchesLeaveType(leave: Leave, lt: CompanyLeaveType): boolean {
  if (leave.leave_type_id === lt.id) return true
  if (leave.leave_type_id) return false
  const names = LEGACY_MAP[leave.type] ?? []
  return names.includes(lt.name.toLowerCase()) || names.includes((lt.name_en ?? "").toLowerCase())
}

export function ViewerBalanceStrip({ leaveTypes, balances, config, leaves, year, enableLeaveRequests }: Props) {
  const t = useTranslations("hr")
  const locale = useLocale() as "es" | "en"

  const dayCountConfig: DayCountConfig = {
    counting_method: config.counting_method,
    public_holidays_deducted: config.public_holidays_deducted,
  }

  const today = new Date().toISOString().slice(0, 10)
  const trackedTypes = leaveTypes.filter((lt) => lt.has_balance && !lt.is_archived)

  if (trackedTypes.length === 0) return null

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="grid divide-x divide-border" style={{ gridTemplateColumns: `repeat(${trackedTypes.length}, 1fr)` }}>
        {trackedTypes.map((lt) => {
          const balanceRecord = balances.find((b) => b.leave_type_id === lt.id && b.year === year)

          const typeLeaves = leaves.filter(
            (l) =>
              matchesLeaveType(l, lt) &&
              (l.balance_year === year || (!l.balance_year && l.start_date.startsWith(String(year))))
          )

          // Count pending separately
          const pendingLeaves = enableLeaveRequests
            ? typeLeaves.filter((l) => l.status === "pending")
            : []
          const pendingDays = pendingLeaves.reduce((s, l) => s + (l.days_counted ?? 0), 0)

          const bal = calculateBalance({
            entitlement: balanceRecord?.entitlement ?? lt.default_days ?? 0,
            carried_forward: balanceRecord?.carried_forward ?? 0,
            cf_expiry_date: balanceRecord?.cf_expiry_date ?? null,
            manual_adjustment: balanceRecord?.manual_adjustment ?? 0,
            today,
            leaveEntries: typeLeaves.map((l) => ({
              start_date: l.start_date,
              end_date: l.end_date,
              status: l.status,
              days_counted: l.days_counted,
            })),
            config: dayCountConfig,
            publicHolidays: [],
          })

          const displayName = locale === "en" && lt.name_en ? lt.name_en : lt.name
          const total = bal.entitlement + bal.cf_available + bal.manual_adjustment
          const pct = total > 0 ? Math.min((bal.total_used / total) * 100, 100) : 0

          return (
            <div key={lt.id} className="px-5 py-4 flex flex-col gap-3">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: lt.color }} />
                <span className="text-[13px] font-medium text-muted-foreground">{displayName}</span>
              </div>

              {/* Available — big number */}
              <div>
                <span className={`text-[28px] font-semibold tabular-nums leading-none ${bal.available <= 0 ? "text-destructive" : "text-foreground"}`}>
                  {bal.available}
                </span>
                <span className="text-[13px] text-muted-foreground ml-1.5">
                  {locale === "es" ? `de ${total} disponibles` : `of ${total} available`}
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-border/50 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: pct > 80 ? "var(--destructive)" : lt.color,
                  }}
                />
              </div>

              {/* Breakdown */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground">
                {bal.taken > 0 && (
                  <span>{bal.taken} {t("taken")}</span>
                )}
                {bal.booked > 0 && (
                  <span>{bal.booked} {t("booked")}</span>
                )}
                {pendingDays > 0 && (
                  <span className="text-amber-600 dark:text-amber-400">{pendingDays} {t("pending")}</span>
                )}
              </div>

              {/* Carry forward info */}
              {bal.carried_forward > 0 && (
                <div className={`text-[11px] ${bal.cf_expired ? "text-muted-foreground line-through" : "text-amber-600 dark:text-amber-400"}`}>
                  +{bal.carried_forward} {t("carriedForward")} {year - 1}
                  {bal.cf_expiry_date && !bal.cf_expired && (
                    <span className="text-muted-foreground"> · {t("expiresOn", { date: formatDate(bal.cf_expiry_date, locale) })}</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
