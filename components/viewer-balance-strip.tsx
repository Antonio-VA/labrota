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
      <div className="flex items-center gap-3">
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

      {/* Balance cards — 2 cols on mobile, up to 4 on desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
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

          const rows: Array<{ label: string; value: number | null; highlight: boolean; expired?: boolean }> = [
            { label: t("entitlement"), value: bal.entitlement, highlight: false },
            {
              label: t("carriedForward"),
              value: lt.allows_carry_forward ? bal.carried_forward : null,
              highlight: false,
              expired: bal.cf_expired && bal.carried_forward > 0,
            },
            { label: t("booked"), value: bal.booked, highlight: false },
            { label: t("taken"), value: bal.taken, highlight: false },
            { label: t("available"), value: bal.available, highlight: true },
          ]

          return (
            <div key={lt.id} className="rounded-lg border border-border bg-background overflow-hidden">
              {/* Card header */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
                <div
                  className="w-2.5 h-2.5 rounded-full border"
                  style={{ backgroundColor: lt.color + "55", borderColor: lt.color }}
                />
                <span className="text-[14px] font-medium">{displayName}</span>
                <span className="text-[13px] text-muted-foreground">{selectedYear}</span>
              </div>

              {/* Key-value rows */}
              <div className="divide-y divide-border">
                {rows.map(({ label, value, highlight, expired }) => (
                  <div key={label} className={`flex items-center justify-between px-4 py-2.5 ${highlight ? "bg-muted/20" : ""}`}>
                    <span className={`text-[13px] ${highlight ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                    <span
                      className={`text-[14px] font-semibold tabular-nums ${expired ? "line-through text-muted-foreground" : ""} ${highlight && value !== null && value <= 0 ? "text-destructive" : ""}`}
                      style={highlight && value !== null && value > 0 ? { color: lt.color } : undefined}
                    >
                      {value === null
                        ? <span className="text-muted-foreground/40">—</span>
                        : value === 0 && !highlight
                          ? <span className="text-muted-foreground/40">0</span>
                          : value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
