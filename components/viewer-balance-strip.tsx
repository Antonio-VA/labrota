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
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(trackedTypes.length + (pendingCount > 0 ? 1 : 0), 4)}, 1fr)` }}>
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
        const total = bal.entitlement + bal.cf_available + bal.manual_adjustment
        const pct = total > 0 ? Math.min((bal.total_used / total) * 100, 100) : 0

        return (
          <div key={lt.id} className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col gap-2">
            <span className="text-[13px] text-muted-foreground">{displayName}</span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[22px] font-semibold tabular-nums">{bal.total_used}</span>
              <span className="text-[13px] text-muted-foreground">
                {locale === "es" ? `de ${total} usados` : `of ${total} used`}
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-border/60 overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct > 80 ? "var(--destructive)" : lt.color,
                }}
              />
            </div>
          </div>
        )
      })}

      {enableLeaveRequests && pendingCount > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex flex-col gap-2 items-center justify-center text-center">
          <span className="text-[13px] text-muted-foreground">{t("pending")}</span>
          <span className="text-[22px] font-semibold tabular-nums text-amber-600 dark:text-amber-400">{pendingCount}</span>
          <span className="text-[12px] text-muted-foreground">
            {pendingCount === 1
              ? (locale === "es" ? "solicitud" : "request")
              : (locale === "es" ? "solicitudes" : "requests")}
          </span>
        </div>
      )}
    </div>
  )
}
