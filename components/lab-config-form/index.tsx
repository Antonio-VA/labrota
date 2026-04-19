"use client"

import { useState, useTransition, useCallback } from "react"
import { useTranslations } from "next-intl"
import { CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import { ShiftRotationSetting } from "@/components/shift-rotation-setting"
import { useTimedState } from "@/hooks/use-timed-state"
import type {
  LabConfig,
  CoverageByDay,
  ShiftCoverageByDay,
  ShiftCoverageEntry,
  Department,
  ShiftTypeDefinition,
  Tecnica,
} from "@/lib/types/database"
import {
  DEFAULT_COVERAGE,
  DEFAULT_PUNCTIONS,
  FieldRow,
  SectionHeader,
} from "./shared"
import type { FormValues } from "./shared"
import { DaysOffSection } from "./days-off-section"
import { HolidaysSection } from "./holidays-section"
import { CoverageSection } from "./coverage-section"
import { TaskCoverageSection } from "./task-coverage-section"
import { ProceduresSection } from "./procedures-section"
import { BiopsyParamsSection } from "./biopsy-params-section"
import { RatioSection } from "./ratio-section"
import { CoverageBehaviourSection } from "./coverage-behaviour-section"

function normalizeShiftCoverage(raw: LabConfig["shift_coverage_by_day"]): ShiftCoverageByDay {
  if (!raw) return {}
  const normalized: ShiftCoverageByDay = {}
  for (const [shift, days] of Object.entries(raw)) {
    normalized[shift] = {}
    for (const [day, val] of Object.entries(days as Record<string, ShiftCoverageEntry | number>)) {
      normalized[shift][day] = typeof val === "number" ? { lab: val, andrology: 0, admin: 0 } : val
    }
  }
  return normalized
}

export function LabConfigForm({
  config,
  section = "all",
  rotaDisplayMode = "by_shift",
  tecnicas = [],
  departments = [],
  shiftTypes = [],
  initialRotation,
  hasPartTime = false,
  hasIntern = false,
}: {
  config: LabConfig
  section?: "all" | "cobertura" | "parametros" | "workload"
  rotaDisplayMode?: string
  tecnicas?: Tecnica[]
  departments?: Department[]
  shiftTypes?: ShiftTypeDefinition[]
  initialRotation?: string
  hasPartTime?: boolean
  hasIntern?: boolean
}) {
  const t = useTranslations("lab")
  const [isPending, startTransition] = useTransition()
  const [status, flashStatus, setStatus] = useTimedState<"idle" | "success" | "error">("idle", 3000)
  const [errorMsg, setErrorMsg] = useState("")

  const [coverageByDay, setCoverageByDay] = useState<CoverageByDay>(
    config.coverage_by_day ?? DEFAULT_COVERAGE
  )

  const [taskCoverageEnabled, setTaskCoverageEnabled] = useState(config.task_coverage_enabled ?? false)
  const [taskCoverage, setTaskCoverage] = useState<Record<string, Record<string, number>>>(
    (config.task_coverage_by_day as Record<string, Record<string, number>>) ?? {}
  )

  const [shiftCoverageEnabled, setShiftCoverageEnabled] = useState(config.shift_coverage_enabled ?? false)
  const [shiftCoverage, setShiftCoverage] = useState<ShiftCoverageByDay>(() =>
    normalizeShiftCoverage(config.shift_coverage_by_day)
  )

  const isByShift = rotaDisplayMode === "by_shift"
  const activeShifts = shiftTypes.filter((st) => st.active !== false)
  const hasShiftCoverage = !isByShift && activeShifts.length > 0

  const [rotationMode, setRotationMode] = useState<"stable" | "weekly" | "daily">(
    (initialRotation as "stable" | "weekly" | "daily") || "stable"
  )

  const [values, setValues] = useState<FormValues>({
    punctions_by_day:       config.punctions_by_day ?? DEFAULT_PUNCTIONS,
    autonomous_community:   config.autonomous_community ?? "",
    ratio_optimal:          config.ratio_optimal ?? 1.0,
    ratio_minimum:          config.ratio_minimum ?? 0.75,
    biopsy_conversion_rate: config.biopsy_conversion_rate ?? 0.5,
    biopsy_day5_pct:        config.biopsy_day5_pct ?? 0.5,
    biopsy_day6_pct:        config.biopsy_day6_pct ?? 0.5,
    task_conflict_threshold: config.task_conflict_threshold ?? 3,
    days_off_preference:       config.days_off_preference ?? "prefer_weekend",
    guardia_min_weeks_between: config.guardia_min_weeks_between ?? 2,
    guardia_max_per_month:     config.guardia_max_per_month ?? 2,
    public_holiday_mode:          config.public_holiday_mode ?? "saturday",
    public_holiday_reduce_budget: config.public_holiday_reduce_budget ?? true,
    part_time_weight:          config.part_time_weight ?? 0.5,
    intern_weight:             config.intern_weight ?? 0.5,
  })

  const setCoverage = useCallback(
    (day: keyof CoverageByDay, role: "lab" | "andrology" | "admin", raw: string) => {
      const v = parseInt(raw, 10)
      if (!isNaN(v) && v >= 0) {
        setCoverageByDay((p) => ({ ...p, [day]: { ...p[day], [role]: v } }))
      }
    },
    []
  )

  function setShiftCov(shiftCode: string, day: string, role: string, raw: string) {
    const v = parseInt(raw, 10)
    if (raw === "" || raw === undefined) {
      setShiftCoverage((p) => {
        const prev = typeof p[shiftCode]?.[day] === "object" ? p[shiftCode][day] : ({} as ShiftCoverageEntry)
        const updated = { ...prev, [role]: 0 }
        return { ...p, [shiftCode]: { ...(p[shiftCode] ?? {}), [day]: updated } }
      })
      return
    }
    if (isNaN(v) || v < 0) return
    setShiftCoverage((p) => {
      const prev = typeof p[shiftCode]?.[day] === "object" ? p[shiftCode][day] : ({} as ShiftCoverageEntry)
      const updated = { ...prev, [role]: v }
      return { ...p, [shiftCode]: { ...(p[shiftCode] ?? {}), [day]: updated } }
    })
  }

  function setTaskCov(code: string, day: string, raw: string) {
    const v = parseInt(raw, 10)
    if (raw === "" || raw === undefined) {
      setTaskCoverage((p) => {
        const next = { ...p }
        if (next[code]) {
          const { [day]: _, ...rest } = next[code]
          next[code] = rest
          if (Object.keys(next[code]).length === 0) delete next[code]
        }
        return next
      })
      return
    }
    if (isNaN(v) || v < 0) return
    setTaskCoverage((p) => ({ ...p, [code]: { ...(p[code] ?? {}), [day]: v } }))
  }

  function handleToggleCoverage() {
    if (isByShift) {
      if (shiftCoverageEnabled && Object.keys(shiftCoverage).length > 0) {
        if (!confirm("¿Desactivar cobertura por turno? Los valores guardados se conservarán pero no se aplicarán.")) return
      }
      setShiftCoverageEnabled(!shiftCoverageEnabled)
    } else {
      if (taskCoverageEnabled && Object.keys(taskCoverage).length > 0) {
        if (!confirm("¿Desactivar cobertura por tarea? Los valores guardados se conservarán pero no se aplicarán.")) return
      }
      setTaskCoverageEnabled(!taskCoverageEnabled)
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("idle")
    startTransition(async () => {
      const shiftCovActive = shiftCoverageEnabled || hasShiftCoverage
      const result = await updateLabConfig({
        coverage_by_day:      coverageByDay,
        punctions_by_day:     values.punctions_by_day,
        autonomous_community: values.autonomous_community || null,
        ratio_optimal:        values.ratio_optimal,
        ratio_minimum:        values.ratio_minimum,
        biopsy_conversion_rate: values.biopsy_conversion_rate,
        biopsy_day5_pct:        values.biopsy_day5_pct,
        biopsy_day6_pct:        values.biopsy_day6_pct,
        task_conflict_threshold: values.task_conflict_threshold,
        task_coverage_enabled:   taskCoverageEnabled,
        task_coverage_by_day:    taskCoverageEnabled ? taskCoverage : config.task_coverage_by_day,
        shift_coverage_enabled:  shiftCovActive,
        shift_coverage_by_day:   shiftCovActive ? shiftCoverage : config.shift_coverage_by_day,
        shift_rotation:          rotationMode,
        days_off_preference:       values.days_off_preference,
        guardia_min_weeks_between: values.guardia_min_weeks_between,
        guardia_max_per_month:     values.guardia_max_per_month,
        public_holiday_mode:          values.public_holiday_mode,
        public_holiday_reduce_budget: values.public_holiday_reduce_budget,
        part_time_weight:          hasPartTime ? values.part_time_weight : undefined,
        intern_weight:             hasIntern   ? values.intern_weight    : undefined,
      })
      if (result.error) {
        setErrorMsg(result.error)
        setStatus("error")
      } else {
        flashStatus("success")
      }
    })
  }

  const showParams   = section === "all" || section === "parametros"
  const showCoverage = section === "all" || section === "cobertura"
  const showWorkload = section === "all" || section === "workload"

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {showParams && (
        <>
          <DaysOffSection values={values} setValues={setValues} disabled={isPending} />
          {initialRotation && (
            <ShiftRotationSetting
              initialValue={initialRotation}
              onChange={setRotationMode}
              isByTask={rotaDisplayMode === "by_task"}
            />
          )}
        </>
      )}

      {showCoverage && (
        <>
          <CoverageSection
            coverageByDay={coverageByDay}
            setCoverage={setCoverage}
            shiftCoverage={shiftCoverage}
            setShiftCov={setShiftCov}
            shiftCoverageEnabled={shiftCoverageEnabled}
            onToggle={handleToggleCoverage}
            isByShift={isByShift}
            hasShiftCoverage={hasShiftCoverage}
            shiftTypes={shiftTypes}
            departments={departments}
            disabled={isPending}
          />

          {rotaDisplayMode === "by_task" && (
            <TaskCoverageSection
              enabled={taskCoverageEnabled}
              onToggle={handleToggleCoverage}
              taskCoverage={taskCoverage}
              setTaskCov={setTaskCov}
              tecnicas={tecnicas}
              departments={departments}
              shiftTypes={shiftTypes}
              disabled={isPending}
            />
          )}

          <HolidaysSection values={values} setValues={setValues} disabled={isPending} />
        </>
      )}

      {showWorkload && (
        <>
          <ProceduresSection values={values} setValues={setValues} disabled={isPending} />
          <BiopsyParamsSection values={values} setValues={setValues} disabled={isPending} />
          {rotaDisplayMode === "by_task" && (
            <div className="rounded-lg border border-border bg-background px-5">
              <SectionHeader title="Conflicto por tarea" />
              <div className="flex flex-col gap-0">
                <FieldRow
                  label="Umbral de conflicto"
                  hint="Avisar cuando una persona está asignada a más de X tareas en el mismo día"
                >
                  <Input
                    type="number" min={2} max={10}
                    value={values.task_conflict_threshold}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10)
                      if (!isNaN(v) && v >= 2) setValues((p) => ({ ...p, task_conflict_threshold: v }))
                    }}
                    disabled={isPending}
                    className="w-16 text-center"
                  />
                </FieldRow>
              </div>
            </div>
          )}
          <RatioSection values={values} setValues={setValues} disabled={isPending} />
          <CoverageBehaviourSection
            values={values}
            setValues={setValues}
            disabled={isPending}
            hasPartTime={hasPartTime}
            hasIntern={hasIntern}
          />
        </>
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("saving") : t("saveChanges")}
        </Button>

        {status === "success" && (
          <span className="flex items-center gap-1.5 text-[14px] text-emerald-600">
            <CheckCircle2 className="size-4" />
            {t("updateSuccess")}
          </span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1.5 text-[14px] text-destructive">
            <AlertCircle className="size-4" />
            {errorMsg}
          </span>
        )}
      </div>
    </form>
  )
}
