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
}

export function ViewerBalanceStrip({ leaveTypes, balances, config, leaves, year }: Props) {
  const t = useTranslations("hr")
  const locale = useLocale() as "es" | "en"

  const dayCountConfig: DayCountConfig = {
    counting_method: config.counting_method,
    weekends_deducted: config.weekends_deducted,
    public_holidays_deducted: config.public_holidays_deducted,
  }

  const today = new Date().toISOString().slice(0, 10)
  const trackedTypes = leaveTypes.filter((lt) => lt.has_balance && !lt.is_archived)

  if (trackedTypes.length === 0) return null

  return (
    <div className="mb-6">
      <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(trackedTypes.length, 3)}, 1fr)` }}>
        {trackedTypes.map((lt) => {
          const balanceRecord = balances.find((b) => b.leave_type_id === lt.id && b.year === year)

          const typeLeaves = leaves.filter(
            (l) =>
              l.leave_type_id === lt.id &&
              (l.balance_year === year || (!l.balance_year && l.start_date.startsWith(String(year))))
          )

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

          return (
            <div key={lt.id} className="rounded-lg border border-border bg-background px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lt.color }} />
                <span className="text-[13px] font-medium text-muted-foreground">{displayName}</span>
              </div>
              <div className="flex items-baseline gap-3">
                <div>
                  <span className={`text-[22px] font-semibold ${bal.available <= 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                    {bal.available}
                  </span>
                  <span className="text-[12px] text-muted-foreground ml-1">{t("available")}</span>
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {bal.taken > 0 && <span>{bal.taken} {t("taken")}</span>}
                  {bal.booked > 0 && <span>{bal.taken > 0 ? " · " : ""}{bal.booked} {t("booked")}</span>}
                </div>
              </div>
              {bal.carried_forward > 0 && (
                <div className={`text-[11px] mt-1 ${bal.cf_expired ? "text-muted-foreground line-through" : "text-amber-600 dark:text-amber-400"}`}>
                  {bal.carried_forward} {t("carriedForward")}
                  {bal.cf_expiry_date && !bal.cf_expired && (
                    <span> · {t("expiresOn", { date: formatDate(bal.cf_expiry_date, locale) })}</span>
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
