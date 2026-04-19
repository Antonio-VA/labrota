"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations, useLocale } from "next-intl"
import Link from "next/link"
import { CheckCircle2, Circle, AlertTriangle, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDate, formatDateWithYear, formatTimeOfDay } from "@/lib/format-date"
import { toast } from "sonner"
import { resetImplementation } from "@/app/(clinic)/settings/actions"

import type { StepCompletion } from "@/app/(clinic)/settings/implementation-actions"

export function SettingsImplementation({
  status,
  stepCompletions = {},
}: {
  stepCompletions?: Record<string, StepCompletion>
  status: {
    hasRegion: boolean
    departmentCount: number
    shiftCount: number
    taskCount: number
    staffCount: number
    hasRota: boolean
    rotaCount: number
  }
}) {
  const router = useRouter()
  const t = useTranslations("implementation")
  const tc = useTranslations("common")
  const locale = useLocale()
  const loc = locale as "es" | "en"
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [isResetting, startReset] = useTransition()

  function fmtTimestamp(iso: string): string {
    const d = new Date(iso)
    const now = new Date()
    const sameYear = d.getFullYear() === now.getFullYear()
    const date = sameYear ? formatDate(d, loc) : formatDateWithYear(d, loc)
    return `${date} · ${formatTimeOfDay(d, loc)}`
  }

  const steps = [
    { key: "create_org", label: t("createOrg"), desc: t("createOrgDesc"), done: true },
    { key: "configure_region", label: t("configureRegion"), desc: t("configureRegionDesc"), done: status.hasRegion },
    { key: "add_departments", label: t("addDepartments"), desc: t("departmentCount", { count: status.departmentCount }), done: status.departmentCount > 0 },
    { key: "add_shifts", label: t("addShifts"), desc: t("shiftCount", { count: status.shiftCount }), done: status.shiftCount > 0 },
    { key: "add_tasks", label: t("addTasks"), desc: t("taskCount", { count: status.taskCount }), done: status.taskCount > 0 },
    { key: "add_staff", label: t("addStaff"), desc: t("staffCount", { count: status.staffCount }), done: status.staffCount > 0 },
    { key: "generate_rota", label: t("generateFirstRota"), desc: status.hasRota ? t("rotaCount", { count: status.rotaCount }) : t("noRotasYet"), done: status.hasRota },
  ]
  const allDone = steps.every((s) => s.done)
  const completedCount = steps.filter((s) => s.done).length

  return (
    <div className="flex flex-col gap-4">
      {/* Import link — always visible */}
      <Link
        href="/onboarding/import"
        className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors"
      >
        <Upload className="size-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium">{t("importHistorical")}</p>
          <p className="text-[11px] text-muted-foreground">
            {allDone
              ? t("importHistoricalDoneDesc")
              : t("importHistoricalSetupDesc")}
          </p>
        </div>
      </Link>

      <Link
        href="/onboarding/import-rota"
        className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors"
      >
        <Upload className="size-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium">{t("importFuture")}</p>
          <p className="text-[11px] text-muted-foreground">
            {t("importFutureDesc")}
          </p>
        </div>
      </Link>

      <div className="rounded-lg border border-border bg-background overflow-hidden">
        {allDone ? (
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-5 text-emerald-500" />
              <span className="text-[14px] font-medium text-emerald-600">{t("completed")}</span>
            </div>
            <button
              onClick={() => setResetModalOpen(true)}
              className="text-[12px] text-muted-foreground hover:text-destructive transition-colors"
            >
              {t("restart")}
            </button>
          </div>
        ) : (
          <>
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <span className="text-[12px] text-muted-foreground">{t("stepsCompleted", { completed: completedCount, total: steps.length })}</span>
            </div>
            <div className="divide-y divide-border/50">
              {steps.map((step, i) => {
                const completion = stepCompletions[step.key]
                return (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    {step.done ? (
                      <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className={cn("text-[13px] font-medium", step.done ? "text-foreground" : "text-muted-foreground")}>{step.label}</p>
                      <p className="text-[11px] text-muted-foreground">{step.desc}</p>
                      {step.done && completion && (
                        <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                          {t("completedAt", { date: fmtTimestamp(completion.completed_at) })}
                          {completion.completed_by_name && ` ${t("completedBy", { name: completion.completed_by_name })}`}
                        </p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

          </>
        )}
      </div>

      {/* Reset modal */}
      {resetModalOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setResetModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[420px] p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] font-medium">{t("restartConfirmTitle")}</p>
                <p className="text-[13px] text-muted-foreground mt-1.5">
                  {t("restartConfirmDescription")}
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setResetModalOpen(false)}>{tc("cancel")}</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isResetting}
                onClick={() => {
                  startReset(async () => {
                    const result = await resetImplementation()
                    if (result.error) toast.error(result.error)
                    else { toast.success(t("restartSuccess")); setResetModalOpen(false); router.refresh() }
                  })
                }}
              >
                {isResetting ? t("restarting") : t("restart")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
