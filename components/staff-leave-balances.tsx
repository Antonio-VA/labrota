"use client"

import { useState, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import { Pencil, CalendarDays } from "lucide-react"
import { formatDate } from "@/lib/format-date"
import { calculateBalance, countDays } from "@/lib/hr-balance-engine"
import { upsertHolidayBalance } from "@/app/(clinic)/settings/hr-module-actions"
import type {
  CompanyLeaveType,
  HolidayBalance,
  HolidayConfig,
  Leave,
} from "@/lib/types/database"
import type { DayCountConfig } from "@/lib/hr-balance-engine"

interface Props {
  staffId: string
  staffName: string
  leaveTypes: CompanyLeaveType[]
  balances: HolidayBalance[]
  config: HolidayConfig
  leaves: Leave[]
  year: number
  publicHolidays: string[]
}

const STATUS_VARIANT: Record<string, "active" | "onboarding" | "inactive"> = {
  approved: "active",
  pending: "onboarding",
  cancelled: "inactive",
  rejected: "inactive",
}

export function StaffLeaveBalances({
  staffId,
  staffName,
  leaveTypes,
  balances,
  config,
  leaves,
  year,
  publicHolidays,
}: Props) {
  const t = useTranslations("hr")
  const tc = useTranslations("common")
  const tl = useTranslations("leaves")
  const locale = useLocale() as "es" | "en"
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [selectedYear, setSelectedYear] = useState(year)
  const [editingBalance, setEditingBalance] = useState<{
    leaveTypeId: string
    leaveTypeName: string
    entitlement: number
    manual_adjustment: number
    manual_adjustment_notes: string
  } | null>(null)

  const dayCountConfig: DayCountConfig = {
    counting_method: config.counting_method,
    public_holidays_deducted: config.public_holidays_deducted,
  }

  const today = new Date().toISOString().slice(0, 10)

  const trackedTypes = leaveTypes.filter((lt) => lt.has_balance && !lt.is_archived)

  // Map legacy leave type names to company leave type IDs for unmapped leaves
  const LEGACY_MAP: Record<string, string[]> = {
    annual: ["vacaciones", "annual leave"],
    sick: ["baja por enfermedad", "sick leave"],
  }
  function matchesLeaveType(leave: Leave, lt: CompanyLeaveType): boolean {
    if (leave.leave_type_id === lt.id) return true
    if (leave.leave_type_id) return false
    const legacyNames = LEGACY_MAP[leave.type] ?? []
    return legacyNames.includes(lt.name.toLowerCase()) || legacyNames.includes((lt.name_en ?? "").toLowerCase())
  }

  const getBalance = (leaveTypeId: string) => {
    const balanceRecord = balances.find(
      (b) => b.leave_type_id === leaveTypeId && b.year === selectedYear
    )

    const lt = leaveTypes.find((t) => t.id === leaveTypeId)!
    const typeLeaves = leaves.filter(
      (l) =>
        matchesLeaveType(l, lt) &&
        (l.balance_year === selectedYear || (!l.balance_year && l.start_date.startsWith(String(selectedYear))))
    )

    return calculateBalance({
      entitlement: balanceRecord?.entitlement ?? lt?.default_days ?? 0,
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
      publicHolidays,
    })
  }

  const handleSaveEntitlement = () => {
    if (!editingBalance) return
    startTransition(async () => {
      const result = await upsertHolidayBalance({
        staff_id: staffId,
        leave_type_id: editingBalance.leaveTypeId,
        year: selectedYear,
        entitlement: editingBalance.entitlement,
        manual_adjustment: editingBalance.manual_adjustment,
        manual_adjustment_notes: editingBalance.manual_adjustment_notes || null,
      })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("saveSuccess"))
        setEditingBalance(null)
        router.refresh()
      }
    })
  }

  // Get the leave type display name for a leave record
  const getLeaveTypeName = (leave: Leave): string => {
    if (leave.leave_type_id) {
      const lt = leaveTypes.find((t) => t.id === leave.leave_type_id)
      if (lt) return locale === "en" && lt.name_en ? lt.name_en : lt.name
    }
    // Fallback to legacy type translation
    try { return tl(`types.${leave.type}`) } catch { return leave.type }
  }

  // Get leave type color
  const getLeaveTypeColor = (leave: Leave): string | null => {
    if (leave.leave_type_id) {
      return leaveTypes.find((t) => t.id === leave.leave_type_id)?.color ?? null
    }
    return null
  }

  // Compute days for display (use stored or compute on the fly)
  const getDisplayDays = (leave: Leave): number => {
    if (leave.days_counted != null) return leave.days_counted
    return countDays(leave.start_date, leave.end_date, dayCountConfig, publicHolidays)
  }

  // Get status translation
  const getStatusLabel = (status: string): string => {
    try { return tl(`status.${status}`) } catch { return status }
  }

  // Leave history for this year — split into past and upcoming
  const yearLeaves = leaves
    .filter((l) => {
      const matchYear = l.balance_year === selectedYear ||
        (!l.balance_year && l.start_date.startsWith(String(selectedYear)))
      return matchYear && l.status !== "rejected"
    })
    .sort((a, b) => b.start_date.localeCompare(a.start_date))

  const pastLeaves = yearLeaves.filter((l) => l.end_date < today)
  const upcomingLeaves = yearLeaves.filter((l) => l.end_date >= today)

  function renderLeaveTable(entries: Leave[]) {
    return (
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{tc("from")}</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{tc("to")}</th>
              <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">{tc("day")}</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{tl("fields.type")}</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">{tc("status")}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((leave) => {
              const isCancelled = leave.status === "cancelled"
              const color = getLeaveTypeColor(leave)
              const days = getDisplayDays(leave)
              return (
                <tr key={leave.id} className={`border-b border-border last:border-0 ${isCancelled ? "opacity-40" : ""}`}>
                  <td className="px-4 py-2.5">{formatDate(leave.start_date, locale)}</td>
                  <td className="px-4 py-2.5">{formatDate(leave.end_date, locale)}</td>
                  <td className="px-4 py-2.5 text-center font-medium">{days}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {color && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />}
                      <span>{getLeaveTypeName(leave)}</span>
                      {leave.parent_leave_id && <Badge variant="outline" className="text-[11px] py-0">{t("overflowSource")}</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={STATUS_VARIANT[leave.status] ?? "inactive"}>{getStatusLabel(leave.status)}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Year selector */}
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

      {/* Balance cards */}
      {trackedTypes.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={t("balanceStrip")}
          description={t("noExistingLeaves")}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {trackedTypes.map((lt) => {
            const bal = getBalance(lt.id)
            const overflowType = lt.overflow_to_type_id
              ? leaveTypes.find((t) => t.id === lt.overflow_to_type_id)
              : null
            const displayName = locale === "en" && lt.name_en ? lt.name_en : lt.name

            const cfValue = lt.allows_carry_forward ? bal.carried_forward : null

            const rows: Array<{ label: string; value: number | string | null; highlight: boolean; extra?: React.ReactNode }> = [
              { label: t("entitlement"), value: bal.entitlement, highlight: false },
              {
                label: t("carriedForward"),
                value: cfValue,
                highlight: false,
                extra: bal.cf_expiry_date && cfValue !== null ? (
                  <span className={`text-[11px] ml-1 ${bal.cf_expired ? "line-through text-muted-foreground" : "text-amber-600"}`}>
                    {bal.cf_expired ? t("expired") : t("expiresOn", { date: formatDate(bal.cf_expiry_date, locale) })}
                  </span>
                ) : undefined,
              },
              { label: t("booked"), value: bal.booked, highlight: false },
              { label: t("taken"), value: bal.taken, highlight: false },
              { label: t("available"), value: bal.available, highlight: true },
            ]

            return (
              <div key={lt.id} className="rounded-lg border border-border bg-background overflow-hidden">
                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full border"
                      style={{ backgroundColor: lt.color + "55", borderColor: lt.color }}
                    />
                    <span className="text-[14px] font-medium">{displayName}</span>
                    <span className="text-[13px] text-muted-foreground">{selectedYear}</span>
                  </div>
                  <button
                    type="button"
                    className="p-1.5 rounded-md text-muted-foreground hover:text-primary hover:bg-primary/5 transition-colors"
                    title={t("editEntitlement")}
                    onClick={() => {
                      const balRecord = balances.find((b) => b.leave_type_id === lt.id && b.year === selectedYear)
                      setEditingBalance({
                        leaveTypeId: lt.id,
                        leaveTypeName: displayName,
                        entitlement: balRecord?.entitlement ?? lt.default_days ?? 0,
                        manual_adjustment: balRecord?.manual_adjustment ?? 0,
                        manual_adjustment_notes: balRecord?.manual_adjustment_notes ?? "",
                      })
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                </div>

                {/* Key-value rows */}
                <div className="divide-y divide-border">
                  {rows.map(({ label, value, highlight, extra }) => (
                    <div key={label} className={`flex items-center justify-between px-4 py-2.5 ${highlight ? "bg-muted/20" : ""}`}>
                      <span className={`text-[13px] ${highlight ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {label}
                      </span>
                      <span className={`text-[14px] font-semibold tabular-nums flex items-center gap-1 ${
                        highlight && typeof value === "number" && value <= 0 ? "text-destructive" : ""
                      } ${value !== null && !highlight && typeof value === "number" && value === 0 ? "text-muted-foreground/40" : ""}`}
                        style={highlight && typeof value === "number" && value > 0 ? { color: lt.color } : undefined}
                      >
                        {value === null
                          ? <span className="text-muted-foreground/40">—</span>
                          : value}
                        {extra}
                      </span>
                    </div>
                  ))}
                  {overflowType && bal.in_overflow && (
                    <div className="px-4 py-2 bg-amber-500/5 text-[12px] text-amber-600">
                      {bal.overflow_days}d → {overflowType.name}
                    </div>
                  )}
                  {bal.manual_adjustment !== 0 && (
                    <div className="px-4 py-2 text-[12px] text-muted-foreground">
                      {t("manualAdjustment")}: <span className="font-medium">{bal.manual_adjustment > 0 ? "+" : ""}{bal.manual_adjustment}</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Entitlement edit panel */}
      {editingBalance && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-5 flex flex-col gap-4">
          <h3 className="text-[14px] font-medium">{t("editEntitlement")} — {editingBalance.leaveTypeName} {selectedYear}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[13px] text-muted-foreground">{t("entitlement")}</label>
              <input
                type="number"
                value={editingBalance.entitlement}
                onChange={(e) => setEditingBalance((p) => p ? { ...p, entitlement: parseInt(e.target.value) || 0 } : null)}
                className="w-full border border-border rounded-md px-3 py-2 text-[14px] bg-background mt-1"
              />
            </div>
            <div>
              <label className="text-[13px] text-muted-foreground">{t("manualAdjustment")}</label>
              <input
                type="number"
                value={editingBalance.manual_adjustment}
                onChange={(e) => setEditingBalance((p) => p ? { ...p, manual_adjustment: parseInt(e.target.value) || 0 } : null)}
                className="w-full border border-border rounded-md px-3 py-2 text-[14px] bg-background mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-[13px] text-muted-foreground">{t("adjustmentNotes")}</label>
            <input
              type="text"
              value={editingBalance.manual_adjustment_notes}
              onChange={(e) => setEditingBalance((p) => p ? { ...p, manual_adjustment_notes: e.target.value } : null)}
              className="w-full border border-border rounded-md px-3 py-2 text-[14px] bg-background mt-1"
              placeholder={t("adjustmentNotes")}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveEntitlement} disabled={isPending}>
              {isPending ? tc("saving") : tc("save")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditingBalance(null)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Upcoming leaves */}
      {upcomingLeaves.length > 0 && (
        <div>
          <h3 className="text-[14px] font-medium mb-3">{t("booked")}</h3>
          {renderLeaveTable(upcomingLeaves)}
        </div>
      )}

      {/* Past leaves */}
      <div>
        <h3 className="text-[14px] font-medium mb-3">{t("leaveHistory")}</h3>
        {pastLeaves.length === 0 ? (
          <div className="rounded-lg border border-border bg-background px-5 py-8 text-center">
            <p className="text-[14px] text-muted-foreground">—</p>
          </div>
        ) : renderLeaveTable(pastLeaves)}
      </div>
    </div>
  )
}
