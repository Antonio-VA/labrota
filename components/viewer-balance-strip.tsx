"use client"

import { useTranslations, useLocale } from "next-intl"
import { calculateBalance } from "@/lib/hr-balance-engine"
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
    weekends_deducted: config.weekends_deducted,
    public_holidays_deducted: config.public_holidays_deducted,
  }

  const today = new Date().toISOString().slice(0, 10)
  const trackedTypes = leaveTypes.filter((lt) => lt.has_balance && !lt.is_archived)

  if (trackedTypes.length === 0) return null

  const pendingCount = enableLeaveRequests
    ? leaves.filter((l) => l.status === "pending").length
    : 0

  return (
    <div className="flex flex-wrap gap-2">
      {trackedTypes.map((lt) => {
        const balanceRecord = balances.find((b) => b.leave_type_id === lt.id && b.year === year)

        const typeLeaves = leaves.filter(
          (l) =>
            matchesLeaveType(l, lt) &&
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
          <div key={lt.id} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 flex-1 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: lt.color }} />
            <span className="text-[13px] text-muted-foreground truncate">{displayName}</span>
            <span className={`text-[18px] font-semibold ml-auto ${bal.available <= 0 ? "text-destructive" : "text-foreground"}`}>
              {bal.available}
            </span>
            <span className="text-[11px] text-muted-foreground shrink-0">{t("available")}</span>
          </div>
        )
      })}
      {enableLeaveRequests && pendingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
          <span className="text-[18px] font-semibold text-amber-600 dark:text-amber-400">{pendingCount}</span>
          <span className="text-[11px] text-muted-foreground">{t("pending")}</span>
        </div>
      )}
    </div>
  )
}
