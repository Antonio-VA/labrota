"use client"

import { useState } from "react"
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

export function ViewerBalanceStrip({ leaveTypes, balances, config, leaves, year: initialYear }: Props) {
  const t = useTranslations("hr")
  const locale = useLocale() as "es" | "en"
  const [selectedYear, setSelectedYear] = useState(initialYear)

  const dayCountConfig: DayCountConfig = {
    counting_method: config.counting_method,
    public_holidays_deducted: config.public_holidays_deducted,
  }

  const today = new Date().toISOString().slice(0, 10)
  const trackedTypes = leaveTypes.filter((lt) => lt.has_balance && !lt.is_archived)

  if (trackedTypes.length === 0) return null

  return (
    <div className="flex flex-col gap-4">
      {/* Header with year selector */}
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-medium">{t("balanceStrip")}</h2>
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(parseInt(e.target.value))}
          className="border border-border rounded-md px-3 py-1.5 text-[14px] bg-background"
        >
          {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Balance cards */}
      {trackedTypes.map((lt) => {
        const balanceRecord = balances.find((b) => b.leave_type_id === lt.id && b.year === selectedYear)

        const typeLeaves = leaves.filter(
          (l) =>
            matchesLeaveType(l, lt) &&
            (l.balance_year === selectedYear || (!l.balance_year && l.start_date.startsWith(String(selectedYear))))
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
          <div key={lt.id} className="rounded-lg border border-border bg-background overflow-hidden">
            {/* Card header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: lt.color }} />
                <span className="text-[14px] font-medium">{displayName}</span>
                <span className="text-[13px] text-muted-foreground">{selectedYear}</span>
              </div>
            </div>

            {/* Balance figures */}
            <div className="px-5 py-4">
              <div className="grid grid-cols-5 gap-2 text-center">
                <div>
                  <div className="text-[12px] text-muted-foreground uppercase tracking-wide">{t("entitlement")}</div>
                  <div className="text-[22px] font-semibold mt-1">{bal.entitlement}</div>
                </div>
                <div>
                  <div className="text-[12px] text-muted-foreground uppercase tracking-wide">{t("carriedForward")}</div>
                  <div className="text-[22px] font-semibold mt-1">
                    {bal.carried_forward > 0 ? (
                      <span className={bal.cf_expired ? "line-through text-muted-foreground" : ""}>{bal.carried_forward}</span>
                    ) : (
                      <span className="text-muted-foreground/40">0</span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[12px] text-muted-foreground uppercase tracking-wide">{t("booked")}</div>
                  <div className="text-[22px] font-semibold mt-1">{bal.booked}</div>
                </div>
                <div>
                  <div className="text-[12px] text-muted-foreground uppercase tracking-wide">{t("taken")}</div>
                  <div className="text-[22px] font-semibold mt-1">{bal.taken}</div>
                </div>
                <div>
                  <div className="text-[12px] text-muted-foreground uppercase tracking-wide">{t("available")}</div>
                  <div className={`text-[22px] font-semibold mt-1 ${bal.available <= 0 ? "text-destructive" : ""}`}>
                    {bal.available}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
