"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Users, BarChart3, Loader2, CalendarDays, ClipboardList, ArrowLeftRight, Banknote } from "lucide-react"
import {
  generateStaffReport, generateTechReport, generateExtraDaysReport, generateLeaveReport, generateSwapReport, generateUnpaidLeaveReport,
  type StaffReportData, type TechReportData, type ExtraDaysData, type LeaveReportData, type SwapReportData, type UnpaidLeaveReportData,
} from "@/app/(clinic)/reports/actions"
import { PeriodSelector, MonthSelector } from "./period-selector"
import { StaffReportView } from "./staff-report"
import { TechReportView } from "./tech-report"
import { ExtraDaysReportView } from "./extra-days-report"
import { LeaveReportView } from "./leave-report"
import { SwapReportView } from "./swap-report"
import { UnpaidLeaveReportView } from "./unpaid-leave-report"

// ── Main ─────────────────────────────────────────────────────────────────────

type View = "cards" | "period_staff" | "period_tech" | "period_leaves" | "period_swaps" | "period_unpaid" | "month_extra" | "staff_report" | "tech_report" | "extra_report" | "leave_report" | "swap_report" | "unpaid_report"

export function ReportsClient({ orgDisplayMode, hrModuleActive = false }: { orgDisplayMode: string; hrModuleActive?: boolean }) {
  const t = useTranslations("reports")
  const [view, setView] = useState<View>("cards")
  const [isPending, startTransition] = useTransition()
  const [staffData, setStaffData] = useState<StaffReportData | null>(null)
  const [techData, setTechData] = useState<TechReportData | null>(null)
  const [extraData, setExtraData] = useState<ExtraDaysData | null>(null)
  const [leaveData, setLeaveData] = useState<LeaveReportData | null>(null)
  const [swapData, setSwapData] = useState<SwapReportData | null>(null)
  const [unpaidData, setUnpaidData] = useState<UnpaidLeaveReportData | null>(null)

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

  function handleGenerateSwaps(from: string, to: string) {
    startTransition(async () => {
      const result = await generateSwapReport(from, to)
      if ("error" in result) { toast.error(result.error); return }
      setSwapData(result)
      setView("swap_report")
    })
  }

  function handleGenerateUnpaid(from: string, to: string) {
    startTransition(async () => {
      const result = await generateUnpaidLeaveReport(from, to)
      if ("error" in result) { toast.error(result.error); return }
      setUnpaidData(result)
      setView("unpaid_report")
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

  if (view === "swap_report" && swapData) {
    return <SwapReportView data={swapData} onBack={() => setView("cards")} />
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

  if (view === "period_swaps") {
    return <PeriodSelector onGenerate={handleGenerateSwaps} onCancel={() => setView("cards")} />
  }

  if (view === "unpaid_report" && unpaidData) {
    return <UnpaidLeaveReportView data={unpaidData} onBack={() => setView("cards")} />
  }

  if (view === "period_unpaid") {
    return <PeriodSelector onGenerate={handleGenerateUnpaid} onCancel={() => setView("cards")} />
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

      <div className="rounded-lg border border-border bg-background p-5 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <ArrowLeftRight className="size-5 text-blue-600" />
          </div>
          <div>
            <p className="text-[14px] font-medium">{t("swapRequests")}</p>
            <p className="text-[12px] text-muted-foreground">{t("swapRequestsDescription")}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="self-start" onClick={() => setView("period_swaps")}>
          {t("generateReport")}
        </Button>
      </div>

      {/* Unpaid leave report — only when HR module active */}
      {hrModuleActive && (
        <div className="rounded-lg border border-border bg-background p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Banknote className="size-5 text-amber-600" />
            </div>
            <div>
              <p className="text-[14px] font-medium">{t("unpaidLeave")}</p>
              <p className="text-[12px] text-muted-foreground">{t("unpaidLeaveDescription")}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="self-start" onClick={() => setView("period_unpaid")}>
            {t("generateReport")}
          </Button>
        </div>
      )}
    </div>
  )
}
