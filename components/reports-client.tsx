"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Users, BarChart3, FileDown, FileSpreadsheet, ArrowLeft, Loader2 } from "lucide-react"
import {
  generateStaffReport, generateTechReport, generateExtraDaysReport, generateLeaveReport,
  type StaffReportData, type TechReportData, type ExtraDaysData, type LeaveReportData,
} from "@/app/(clinic)/reports/actions"
import { CalendarDays, ClipboardList } from "lucide-react"

// ── Period presets ────────────────────────────────────────────────────────────

type PeriodKey = "this_week" | "last_4_weeks" | "this_month" | "last_month" | "custom"

function getPresetDates(key: PeriodKey): { from: string; to: string } | null {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().split("T")[0]

  if (key === "this_week") {
    const dow = today.getDay()
    const mon = new Date(today)
    mon.setDate(today.getDate() - ((dow + 6) % 7))
    const sun = new Date(mon)
    sun.setDate(mon.getDate() + 6)
    return { from: iso(mon), to: iso(sun) }
  }
  if (key === "last_4_weeks") {
    const sun = new Date(today)
    const dow = today.getDay()
    sun.setDate(today.getDate() - ((dow + 6) % 7) + 6)
    const mon = new Date(sun)
    mon.setDate(sun.getDate() - 27)
    return { from: iso(mon), to: iso(sun) }
  }
  if (key === "this_month") {
    const first = new Date(today.getFullYear(), today.getMonth(), 1)
    const last = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    return { from: iso(first), to: iso(last) }
  }
  if (key === "last_month") {
    const first = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const last = new Date(today.getFullYear(), today.getMonth(), 0)
    return { from: iso(first), to: iso(last) }
  }
  return null
}

// ── Period selector ──────────────────────────────────────────────────────────

function PeriodSelector({ onGenerate, onCancel }: {
  onGenerate: (from: string, to: string) => void
  onCancel: () => void
}) {
  const t = useTranslations("reports")
  const tc = useTranslations("common")
  const [period, setPeriod] = useState<PeriodKey>("last_4_weeks")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")

  function handleGenerate() {
    if (period === "custom") {
      if (!customFrom || !customTo) { toast.error(t("selectBothDates")); return }
      const diffMs = new Date(customTo).getTime() - new Date(customFrom).getTime()
      if (diffMs < 0) { toast.error(t("startBeforeEnd")); return }
      if (diffMs > 365 * 24 * 60 * 60 * 1000) { toast.error(t("max12Months")); return }
      onGenerate(customFrom, customTo)
    } else {
      const dates = getPresetDates(period)!
      onGenerate(dates.from, dates.to)
    }
  }

  const options: { key: PeriodKey; label: string }[] = [
    { key: "this_week", label: t("thisWeek") },
    { key: "last_4_weeks", label: t("last4Weeks") },
    { key: "this_month", label: t("thisMonth") },
    { key: "last_month", label: t("lastMonth") },
    { key: "custom", label: t("custom") },
  ]

  return (
    <div className="rounded-lg border border-border bg-background p-5 max-w-md">
      <p className="text-[14px] font-medium mb-4">{t("selectPeriod")}</p>
      <div className="flex flex-col gap-2 mb-4">
        {options.map((o) => (
          <label key={o.key} className="flex items-center gap-3 cursor-pointer">
            <input
              type="radio"
              name="period"
              checked={period === o.key}
              onChange={() => setPeriod(o.key)}
              className="size-4 accent-primary"
            />
            <span className="text-[14px]">{o.label}</span>
          </label>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex gap-3 mb-4">
          <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="flex-1" />
          <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="flex-1" />
        </div>
      )}
      <div className="flex gap-2">
        <Button onClick={handleGenerate}>{tc("generate")}</Button>
        <Button variant="ghost" onClick={onCancel}>{tc("cancel")}</Button>
      </div>
    </div>
  )
}

// ── Staff Report View ────────────────────────────────────────────────────────

function StaffReportView({ data, onBack }: { data: StaffReportData; onBack: () => void }) {
  const t = useTranslations("reports")

  async function exportPdf() {
    const { exportStaffReportPdf } = await import("@/lib/export-report-pdf")
    exportStaffReportPdf(data)
  }
  async function exportExcel() {
    const { exportStaffReportExcel } = await import("@/lib/export-report-excel")
    exportStaffReportExcel(data)
  }

  const colHeader = data.mode === "by_task" ? t("assignments") : t("shifts")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> {t("back")}
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf}><FileDown className="size-3.5 mr-1.5" />PDF</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="size-3.5 mr-1.5" />Excel</Button>
        </div>
      </div>

      <div>
        <h2 className="text-[18px] font-medium">{t("staffSummary")}</h2>
        <p className="text-[13px] text-muted-foreground">{data.orgName} · {data.periodLabel}</p>
      </div>

      <div className="flex gap-4 text-[13px] text-muted-foreground">
        <span>{t("totalDays")}: <strong className="text-foreground">{data.totalDays}</strong></span>
        <span>{t("meanLabel", { column: colHeader.toLowerCase() })}: <strong className="text-foreground">{data.meanAssignments}</strong></span>
        <span>{t("activeStaff")}: <strong className="text-foreground">{data.activeStaff}</strong></span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("staff")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("department")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{colHeader}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("daysOff")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("absence")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("vsMean")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => {
              const threshold = data.meanAssignments * 0.3
              const isHigh = r.vsMean > threshold
              const isLow = r.vsMean < -threshold
              return (
                <tr
                  key={r.staffId}
                  className={cn(
                    "border-b border-border last:border-0",
                    isHigh && "bg-amber-50 dark:bg-amber-950/20",
                    isLow && "bg-blue-50 dark:bg-blue-950/20"
                  )}
                >
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.color && <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />}
                      {r.firstName} {r.lastName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.department}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.assignments}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.daysOff}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.daysLeave}</td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-medium", isHigh && "text-amber-700", isLow && "text-blue-700")}>
                    {r.vsMean > 0 ? "+" : ""}{r.vsMean}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        {t("staffReportFooter")}
      </p>
    </div>
  )
}

// ── Tech Coverage Report View ────────────────────────────────────────────────

function TechReportView({ data, onBack }: { data: TechReportData; onBack: () => void }) {
  const t = useTranslations("reports")

  async function exportPdf() {
    const { exportTechReportPdf } = await import("@/lib/export-report-pdf")
    exportTechReportPdf(data)
  }
  async function exportExcel() {
    const { exportTechReportExcel } = await import("@/lib/export-report-excel")
    exportTechReportExcel(data)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> {t("back")}
        </button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportPdf}><FileDown className="size-3.5 mr-1.5" />PDF</Button>
          <Button variant="outline" size="sm" onClick={exportExcel}><FileSpreadsheet className="size-3.5 mr-1.5" />Excel</Button>
        </div>
      </div>

      <div>
        <h2 className="text-[18px] font-medium">{t("taskCoverage")}</h2>
        <p className="text-[13px] text-muted-foreground">{data.orgName} · {data.periodLabel}</p>
      </div>

      <div className="flex gap-4 text-[13px] text-muted-foreground">
        <span>{t("totalDays")}: <strong className="text-foreground">{data.totalDays}</strong></span>
        <span>{t("configuredTasks")}: <strong className="text-foreground">{data.techniqueCount}</strong></span>
        <span>{t("daysWithGaps")}: <strong className="text-foreground">{data.daysWithGaps}</strong></span>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("task")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("daysCovered")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("daysUncovered")}</th>
              <th className="px-3 py-2 font-medium text-muted-foreground w-[180px]">{t("coveragePct")}</th>
              <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("qualifiedStaff")}</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <tr
                key={r.codigo}
                className={cn(
                  "border-b border-border last:border-0",
                  r.coveragePct === 0 && "bg-red-50 dark:bg-red-950/20",
                  r.coveragePct > 0 && r.coveragePct < 80 && "bg-amber-50 dark:bg-amber-950/20"
                )}
              >
                <td className="px-3 py-2 font-medium">{r.nombre}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.daysCovered}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.daysUncovered}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          r.coveragePct >= 80 ? "bg-emerald-500" : r.coveragePct > 0 ? "bg-amber-500" : "bg-red-500"
                        )}
                        style={{ width: `${r.coveragePct}%` }}
                      />
                    </div>
                    <span className="text-[12px] tabular-nums w-10 text-right">{r.coveragePct}%</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.qualifiedStaff}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-muted-foreground italic">
        {t("techReportFooter")}
      </p>
    </div>
  )
}

// ── Month Selector (for Extra Days report — past months only) ───────────────

function MonthSelector({ onGenerate, onCancel }: {
  onGenerate: (month: string) => void
  onCancel: () => void
}) {
  const t = useTranslations("reports")
  const tc = useTranslations("common")
  const today = new Date()
  // Default to last month
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const defaultMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`
  const [month, setMonth] = useState(defaultMonth)

  // Max allowed: month before current
  const maxMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`

  return (
    <div className="rounded-lg border border-border bg-background p-5 max-w-md">
      <p className="text-[14px] font-medium mb-4">{t("selectMonth")}</p>
      <div className="flex flex-col gap-3 mb-4">
        <Input type="month" value={month} max={maxMonth} onChange={(e) => setMonth(e.target.value)} />
        <p className="text-[11px] text-muted-foreground">{t("onlyPastMonths")}</p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => month && onGenerate(month)}>{tc("generate")}</Button>
        <Button variant="ghost" onClick={onCancel}>{tc("cancel")}</Button>
      </div>
    </div>
  )
}

// ── Extra Days Report View ──────────────────────────────────────────────────

function ExtraDaysReportView({ data, onBack }: { data: ExtraDaysData; onBack: () => void }) {
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

// ── Leave Report View ───────────────────────────────────────────────────────

function LeaveReportView({ data, onBack }: { data: LeaveReportData; onBack: () => void }) {
  const t = useTranslations("reports")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 text-[14px] text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="size-4" /> {t("back")}
        </button>
      </div>

      <div>
        <h2 className="text-[18px] font-medium">{t("confirmedLeaves")}</h2>
        <p className="text-[13px] text-muted-foreground">{data.orgName} · {data.periodLabel}</p>
      </div>

      <div className="flex gap-4 text-[13px] text-muted-foreground">
        <span>{t("confirmedLeaves")}: <strong className="text-foreground">{data.totalLeaves}</strong></span>
        <span>{t("leaveDays")}: <strong className="text-foreground">{data.totalDays}</strong></span>
      </div>

      {data.rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-background px-5 py-8 text-center">
          <p className="text-[14px] text-muted-foreground">{t("noLeaves")}</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("staff")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("department")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("leaveType")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("leaveStart")}</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("leaveEnd")}</th>
                <th className="text-right px-3 py-2 font-medium text-muted-foreground">{t("leaveDays")}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.leaveId} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.color && <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color }} />}
                      {r.staffName}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{r.department}</td>
                  <td className="px-3 py-2">{t(`leaveTypes.${r.type}` as Parameters<typeof t>[0])}</td>
                  <td className="px-3 py-2 tabular-nums">{r.startDate}</td>
                  <td className="px-3 py-2 tabular-nums">{r.endDate}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.days}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground italic">{t("leavesFooter")}</p>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

type View = "cards" | "period_staff" | "period_tech" | "period_leaves" | "month_extra" | "staff_report" | "tech_report" | "extra_report" | "leave_report"

export function ReportsClient({ orgDisplayMode, orgName }: { orgDisplayMode: string; orgName: string }) {
  const t = useTranslations("reports")
  const [view, setView] = useState<View>("cards")
  const [isPending, startTransition] = useTransition()
  const [staffData, setStaffData] = useState<StaffReportData | null>(null)
  const [techData, setTechData] = useState<TechReportData | null>(null)
  const [extraData, setExtraData] = useState<ExtraDaysData | null>(null)
  const [leaveData, setLeaveData] = useState<LeaveReportData | null>(null)

  function handleGenerateStaff(from: string, to: string) {
    startTransition(async () => {
      const result = await generateStaffReport(from, to)
      if ("error" in result) { toast.error(result.error); return }
      setStaffData(result)
      setView("staff_report")
    })
  }

  function handleGenerateTech(from: string, to: string) {
    startTransition(async () => {
      const result = await generateTechReport(from, to)
      if ("error" in result) { toast.error(result.error); return }
      setTechData(result)
      setView("tech_report")
    })
  }

  function handleGenerateExtra(month: string) {
    startTransition(async () => {
      const result = await generateExtraDaysReport(month)
      if ("error" in result) { toast.error(result.error); return }
      setExtraData(result)
      setView("extra_report")
    })
  }

  function handleGenerateLeaves(from: string, to: string) {
    startTransition(async () => {
      const result = await generateLeaveReport(from, to)
      if ("error" in result) { toast.error(result.error); return }
      setLeaveData(result)
      setView("leave_report")
    })
  }

  if (isPending) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-[14px] text-muted-foreground">{t("generatingReport")}</span>
      </div>
    )
  }

  if (view === "staff_report" && staffData) {
    return <StaffReportView data={staffData} onBack={() => setView("cards")} />
  }

  if (view === "tech_report" && techData) {
    return <TechReportView data={techData} onBack={() => setView("cards")} />
  }

  if (view === "extra_report" && extraData) {
    return <ExtraDaysReportView data={extraData} onBack={() => setView("cards")} />
  }

  if (view === "leave_report" && leaveData) {
    return <LeaveReportView data={leaveData} onBack={() => setView("cards")} />
  }

  if (view === "period_staff") {
    return <PeriodSelector onGenerate={handleGenerateStaff} onCancel={() => setView("cards")} />
  }

  if (view === "period_tech") {
    return <PeriodSelector onGenerate={handleGenerateTech} onCancel={() => setView("cards")} />
  }

  if (view === "month_extra") {
    return <MonthSelector onGenerate={handleGenerateExtra} onCancel={() => setView("cards")} />
  }

  if (view === "period_leaves") {
    return <PeriodSelector onGenerate={handleGenerateLeaves} onCancel={() => setView("cards")} />
  }

  // Cards view
  const isByTask = orgDisplayMode === "by_task"

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-lg border border-border bg-background p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="size-5 text-primary" />
          </div>
          <div>
            <p className="text-[14px] font-medium">{t("staffSummary")}</p>
            <p className="text-[12px] text-muted-foreground">{t("staffSummaryDescription")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={() => setView("period_staff")}>
          {t("generateReport")}
        </Button>
      </div>

      {isByTask && (
        <div className="rounded-lg border border-border bg-background p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <BarChart3 className="size-5 text-primary" />
            </div>
            <div>
              <p className="text-[14px] font-medium">{t("taskCoverage")}</p>
              <p className="text-[12px] text-muted-foreground">{t("taskCoverageDescription")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setView("period_tech")}>
            {t("generateReport")}
          </Button>
        </div>
      )}

      <div className="rounded-lg border border-border bg-background p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <CalendarDays className="size-5 text-amber-600" />
          </div>
          <div>
            <p className="text-[14px] font-medium">{t("extraDays")}</p>
            <p className="text-[12px] text-muted-foreground">{t("extraDaysDescription")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={() => setView("month_extra")}>
          {t("generateReport")}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-background p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <ClipboardList className="size-5 text-emerald-600" />
          </div>
          <div>
            <p className="text-[14px] font-medium">{t("confirmedLeaves")}</p>
            <p className="text-[12px] text-muted-foreground">{t("confirmedLeavesDescription")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={() => setView("period_leaves")}>
          {t("generateReport")}
        </Button>
      </div>
    </div>
  )
}
