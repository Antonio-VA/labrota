"use client"

import { useState, useTransition, useCallback, Fragment } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import type { LabConfig, PunctionsByDay, CoverageByDay, ShiftCoverageByDay, ShiftCoverageEntry } from "@/lib/types/database"
import { CheckCircle2, AlertCircle, Info, ChevronUp, ChevronDown } from "lucide-react"
import { ShiftRotationSetting } from "@/components/shift-rotation-setting"
import { cn } from "@/lib/utils"
import { useTimedState } from "@/hooks/use-timed-state"

// ── Spanish autonomous communities ────────────────────────────────────────────
const DAY_KEYS: (keyof PunctionsByDay)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

// ── Field row ─────────────────────────────────────────────────────────────────
function FieldRow({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-8 py-3 border-b border-border last:border-0">
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[14px] font-medium">{label}</span>
        {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">
      {title}
    </p>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────
const DEFAULT_COVERAGE: CoverageByDay = {
  mon: { lab: 3, andrology: 1, admin: 1 },
  tue: { lab: 3, andrology: 1, admin: 1 },
  wed: { lab: 3, andrology: 1, admin: 1 },
  thu: { lab: 3, andrology: 1, admin: 1 },
  fri: { lab: 3, andrology: 1, admin: 1 },
  sat: { lab: 1, andrology: 0, admin: 0 },
  sun: { lab: 0, andrology: 0, admin: 0 },
}

export function LabConfigForm({ config, section = "all", rotaDisplayMode = "by_shift", tecnicas = [], departments = [], shiftTypes = [], initialRotation, hasPartTime = false, hasIntern = false }: { config: LabConfig; section?: "all" | "cobertura" | "parametros" | "workload"; rotaDisplayMode?: string; tecnicas?: import("@/lib/types/database").Tecnica[]; departments?: import("@/lib/types/database").Department[]; shiftTypes?: import("@/lib/types/database").ShiftTypeDefinition[]; initialRotation?: string; hasPartTime?: boolean; hasIntern?: boolean }) {
  const t = useTranslations("lab")
  const [isPending, startTransition] = useTransition()
  const [status, flashStatus, setStatus] = useTimedState<"idle" | "success" | "error">("idle", 3000)
  const [errorMsg, setErrorMsg] = useState("")

  const DEFAULT_PUNCTIONS: PunctionsByDay = { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 2, sun: 0 }

  const [coverageByDay, setCoverageByDay] = useState<CoverageByDay>(
    config.coverage_by_day ?? DEFAULT_COVERAGE
  )

  // Task-level coverage (by_task mode)
  const [taskCoverageEnabled, setTaskCoverageEnabled] = useState(config.task_coverage_enabled ?? false)
  const [taskCoverage, setTaskCoverage] = useState<Record<string, Record<string, number>>>(
    (config.task_coverage_by_day as Record<string, Record<string, number>>) ?? {}
  )

  // Shift-level coverage (by_shift mode) — per-department: { shift: { day: { lab, andrology, admin } } }
  const [shiftCoverageEnabled, setShiftCoverageEnabled] = useState(config.shift_coverage_enabled ?? false)
  const [shiftCoverage, setShiftCoverage] = useState<ShiftCoverageByDay>(() => {
    const raw = config.shift_coverage_by_day
    if (!raw) return {}
    // Normalize: plain numbers → { lab: N, andrology: 0, admin: 0 }
    const normalized: ShiftCoverageByDay = {}
    for (const [shift, days] of Object.entries(raw)) {
      normalized[shift] = {}
      for (const [day, val] of Object.entries(days as Record<string, ShiftCoverageEntry | number>)) {
        normalized[shift][day] = typeof val === "number" ? { lab: val, andrology: 0, admin: 0 } : val
      }
    }
    return normalized
  })
  // Active coverage state depends on rotation mode
  const isByShift = rotaDisplayMode === "by_shift"
  const coverageEnabled = isByShift ? shiftCoverageEnabled : taskCoverageEnabled


  // by_task: show per-shift coverage when there are active shifts
  const activeShifts = shiftTypes.filter((st) => st.active !== false)
  const hasShiftCoverage = !isByShift && activeShifts.length > 0

  /** Set per-department shift coverage value */
  function setShiftCov(shiftCode: string, day: string, role: string, raw: string) {
    const v = parseInt(raw, 10)
    if (raw === "" || raw === undefined) {
      setShiftCoverage((p) => {
        const prev = (typeof p[shiftCode]?.[day] === "object" ? p[shiftCode][day] : {} as ShiftCoverageEntry)
        const updated = { ...prev, [role]: 0 }
        return { ...p, [shiftCode]: { ...(p[shiftCode] ?? {}), [day]: updated } }
      })
      return
    }
    if (isNaN(v) || v < 0) return
    setShiftCoverage((p) => {
      const prev = (typeof p[shiftCode]?.[day] === "object" ? p[shiftCode][day] : {} as ShiftCoverageEntry)
      const updated = { ...prev, [role]: v }
      return { ...p, [shiftCode]: { ...(p[shiftCode] ?? {}), [day]: updated } }
    })
  }

  /** Set task coverage value (single number) */
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

  const [rotationMode, setRotationMode] = useState<"stable" | "weekly" | "daily">(
    (initialRotation as "stable" | "weekly" | "daily") || "stable"
  )

  const [values, setValues] = useState({
    punctions_by_day:     config.punctions_by_day ?? DEFAULT_PUNCTIONS,
    autonomous_community: config.autonomous_community ?? "",
    ratio_optimal:        config.ratio_optimal ?? 1.0,
    ratio_minimum:        config.ratio_minimum ?? 0.75,
    biopsy_conversion_rate: config.biopsy_conversion_rate ?? 0.5,
    biopsy_day5_pct:       config.biopsy_day5_pct ?? 0.5,
    biopsy_day6_pct:       config.biopsy_day6_pct ?? 0.5,
    task_conflict_threshold: config.task_conflict_threshold ?? 3,
    days_off_preference:        config.days_off_preference ?? "prefer_weekend",
    guardia_min_weeks_between:  config.guardia_min_weeks_between ?? 2,
    guardia_max_per_month:      config.guardia_max_per_month ?? 2,
    public_holiday_mode:        config.public_holiday_mode ?? "saturday",
    public_holiday_reduce_budget: config.public_holiday_reduce_budget ?? true,
    part_time_weight:           config.part_time_weight ?? 0.5,
    intern_weight:              config.intern_weight ?? 0.5,
  })

  function setPunction(day: keyof PunctionsByDay, raw: string) {
    const v = parseInt(raw, 10)
    if (!isNaN(v) && v >= 0) {
      setValues((p) => ({ ...p, punctions_by_day: { ...p.punctions_by_day, [day]: v } }))
    }
  }

  const setCoverage = useCallback((day: keyof CoverageByDay, role: "lab" | "andrology" | "admin", raw: string) => {
    const v = parseInt(raw, 10)
    if (!isNaN(v) && v >= 0) {
      setCoverageByDay((p) => ({ ...p, [day]: { ...p[day], [role]: v } }))
    }
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("idle")
    startTransition(async () => {
      const result = await updateLabConfig({
        coverage_by_day:      coverageByDay,
        punctions_by_day:     values.punctions_by_day,
        autonomous_community: values.autonomous_community || null,
        ratio_optimal:        values.ratio_optimal,
        ratio_minimum:        values.ratio_minimum,
        biopsy_conversion_rate: values.biopsy_conversion_rate,
        biopsy_day5_pct:       values.biopsy_day5_pct,
        biopsy_day6_pct:       values.biopsy_day6_pct,
        task_conflict_threshold: values.task_conflict_threshold,
        task_coverage_enabled:  taskCoverageEnabled,
        task_coverage_by_day:   taskCoverageEnabled ? taskCoverage : config.task_coverage_by_day,
        shift_coverage_enabled: shiftCoverageEnabled || hasShiftCoverage,
        shift_coverage_by_day:  (shiftCoverageEnabled || hasShiftCoverage) ? shiftCoverage : config.shift_coverage_by_day,
        shift_rotation:        rotationMode,
        days_off_preference:       values.days_off_preference,
        guardia_min_weeks_between: values.guardia_min_weeks_between,
        guardia_max_per_month:     values.guardia_max_per_month,
        public_holiday_mode:       values.public_holiday_mode,
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

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {(section === "all" || section === "parametros") && <>

      {/* ── DÍAS LIBRES ─────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("daysOffTitle")} />
        <p className="text-[13px] text-muted-foreground mb-3">{t("daysOffDescription")}</p>
        <div className="flex flex-col gap-1 pb-4">
          {([
            { value: "always_weekend", label: t("daysOffAlwaysWeekend"), hint: t("daysOffAlwaysWeekendHint") },
            { value: "prefer_weekend", label: t("daysOffPreferWeekend"), hint: t("daysOffPreferWeekendHint") },
            { value: "any_day", label: t("daysOffAnyDay"), hint: t("daysOffAnyDayHint") },
            { value: "guardia", label: t("daysOffGuardia"), hint: t("daysOffGuardiaHint") },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                values.days_off_preference === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <input
                type="radio"
                name="days_off_preference"
                value={opt.value}
                checked={values.days_off_preference === opt.value}
                onChange={() => setValues((p) => ({ ...p, days_off_preference: opt.value }))}
                disabled={isPending}
                className="mt-0.5 accent-primary"
              />
              <div>
                <span className="text-[14px] font-medium">{opt.label}</span>
                <p className="text-[12px] text-muted-foreground mt-0.5">{opt.hint}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Guardia params — only visible when guardia mode is active */}
        {values.days_off_preference === "guardia" && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-4 flex flex-col gap-3">
            <p className="text-[12px] font-medium text-primary">{t("guardiaParamsTitle")}</p>
            <div className="flex items-center gap-3">
              <label className="text-[13px] text-muted-foreground w-48 shrink-0">{t("guardiaMinWeeks")}</label>
              <input
                type="number" min={1} max={8} step={1}
                value={values.guardia_min_weeks_between}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 1 && v <= 8) setValues((p) => ({ ...p, guardia_min_weeks_between: v }))
                }}
                disabled={isPending}
                className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-[13px] text-center outline-none focus-visible:border-ring"
              />
              <span className="text-[12px] text-muted-foreground">{t("guardiaMinWeeksUnit")}</span>
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[13px] text-muted-foreground w-48 shrink-0">{t("guardiaMaxMonth")}</label>
              <input
                type="number" min={0} max={8} step={1}
                value={values.guardia_max_per_month}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 0 && v <= 8) setValues((p) => ({ ...p, guardia_max_per_month: v }))
                }}
                disabled={isPending}
                className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-[13px] text-center outline-none focus-visible:border-ring"
              />
              <span className="text-[12px] text-muted-foreground">{t("guardiaMaxMonthUnit")}</span>
            </div>
          </div>
        )}
      </div>

      {initialRotation && <ShiftRotationSetting initialValue={initialRotation} onChange={setRotationMode} isByTask={rotaDisplayMode === "by_task"} />}

      </>}

      {(section === "all" || section === "cobertura") && <>
      {/* ── COBERTURA MÍNIMA ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
            {t("sections.coverage")}
          </p>
          {isByShift && (
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-muted-foreground">{t("fields.byShiftToggle")}</span>
              <button
                type="button"
                onClick={handleToggleCoverage}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  shiftCoverageEnabled ? "bg-emerald-500" : "bg-muted-foreground/20"
                )}
              >
                <span className={cn(
                  "pointer-events-none inline-block size-4 rounded-full bg-white shadow-sm transition-transform",
                  shiftCoverageEnabled ? "translate-x-4" : "translate-x-0"
                )} />
              </button>
            </div>
          )}
        </div>

        {/* by_task mode OR by_shift with toggle OFF → department table (not when shift-dept linking active) */}
        {(!isByShift || !shiftCoverageEnabled) && !hasShiftCoverage && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">{t("fields.departmentColumn")}</th>
                  {DAY_KEYS.map((day) => (
                    <th key={day} className={cn("px-1 py-2 text-center font-medium text-muted-foreground w-[52px]", (day === "sat" || day === "sun") && "bg-muted/60")}>
                      {t(`days.${day}`).slice(0, 3)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(["lab", "andrology", "admin"] as const).map((role, rIdx) => {
                  const label = role === "lab" ? t("fields.embryology") : role === "andrology" ? t("fields.andrology") : t("fields.administration")
                  return (
                    <tr key={role} className={cn("border-b border-border/50", rIdx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                      <td className="px-3 py-1.5 font-medium text-[13px]">{label}</td>
                      {DAY_KEYS.map((day) => {
                        const isWeekend = day === "sat" || day === "sun"
                        return (
                          <td key={day} className={cn("px-1 py-1 text-center", isWeekend && "bg-muted/30")}>
                            <input
                              type="number"
                              min={0}
                              max={10}
                              value={coverageByDay[day][role]}
                              onChange={(e) => setCoverage(day, role, e.target.value)}
                              disabled={isPending}
                              className="w-12 h-7 rounded border border-input bg-transparent text-center text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 disabled:opacity-50 mx-auto block"
                            />
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* by_shift with toggle ON → per-shift per-department table */}
        {isByShift && shiftCoverageEnabled && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">{t("fields.shiftColumn")}</th>
                  {DAY_KEYS.map((day) => (
                    <th key={day} className={cn("px-1 py-2 text-center font-medium text-muted-foreground w-[52px]", (day === "sat" || day === "sun") && "bg-muted/60")}>{t(`days.${day}`).slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shiftTypes.filter((st) => st.active !== false).map((st) => {
                  const ROLES = [
                    { key: "lab" as const, label: t("fields.embrAbbr"), color: "var(--role-lab)" },
                    { key: "andrology" as const, label: t("fields.andrAbbr"), color: "var(--role-andrology)" },
                    { key: "admin" as const, label: "Admin", color: "var(--role-admin)" },
                  ]
                  return (
                    <Fragment key={st.id}>
                      <tr className="bg-muted/60 border-t border-border">
                        <td colSpan={8} className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold">{st.code}</span>
                            <span className="text-[11px] text-muted-foreground">{st.start_time}–{st.end_time}</span>
                          </span>
                        </td>
                      </tr>
                      {ROLES.map((role, rIdx) => (
                        <tr key={`${st.id}-${role.key}`} className={cn("border-b border-border/30", rIdx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                          <td className="px-3 py-0.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: role.color }} />
                              <span className="text-[12px] text-muted-foreground">{role.label}</span>
                            </span>
                          </td>
                          {DAY_KEYS.map((day) => {
                            const isWknd = day === "sat" || day === "sun"
                            const entry = shiftCoverage[st.code]?.[day]
                            const covEntry = (typeof entry === "object" && entry !== null ? entry : {} as ShiftCoverageEntry)
                            const val = covEntry[role.key] ?? 0
                            return (
                              <td key={day} className={cn("px-1 py-0.5 text-center", isWknd && "bg-muted/30")}>
                                <div className="group relative flex items-center justify-center">
                                  <button type="button" tabIndex={-1}
                                    onClick={() => setShiftCov(st.code, day, role.key, String(Math.max(0, val - 1)))}
                                    className="absolute left-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground text-[10px] w-3 h-6 flex items-center justify-center"
                                  >-</button>
                                  <input type="number" min={0} max={20} value={val || ""}
                                    onChange={(e) => setShiftCov(st.code, day, role.key, e.target.value)}
                                    disabled={isPending}
                                    className={cn(
                                      "no-spinners w-10 h-6 rounded border text-center text-[12px] outline-none disabled:opacity-50 mx-auto block",
                                      val > 0 ? "border-input bg-background text-foreground" : "border-input bg-background text-muted-foreground/30",
                                      "focus:border-ring focus:ring-1 focus:ring-ring/50"
                                    )}
                                  />
                                  <button type="button" tabIndex={-1}
                                    onClick={() => setShiftCov(st.code, day, role.key, String(val + 1))}
                                    className="absolute right-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground text-[10px] w-3 h-6 flex items-center justify-center"
                                  >+</button>
                                </div>
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* by_task with shift-department linking → per-shift per-department table */}
        {hasShiftCoverage && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">{t("fields.shiftColumn")}</th>
                  {DAY_KEYS.map((day) => (
                    <th key={day} className={cn("px-1 py-2 text-center font-medium text-muted-foreground w-[52px]", (day === "sat" || day === "sun") && "bg-muted/60")}>{t(`days.${day}`).slice(0, 3)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeShifts.map((st) => {
                  const linkedDepts = departments
                  return (
                    <Fragment key={st.id}>
                      <tr className="bg-muted/60 border-t border-border">
                        <td colSpan={8} className="px-3 py-1.5">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[13px] font-semibold">{st.name_es || st.code}</span>
                            <span className="text-[11px] text-muted-foreground">{st.start_time}–{st.end_time}</span>
                          </span>
                        </td>
                      </tr>
                      {linkedDepts.map((dept, rIdx) => (
                        <tr key={`${st.id}-${dept.code}`} className={cn("border-b border-border/30", rIdx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                          <td className="px-3 py-0.5">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: dept.colour }} />
                              <span className="text-[12px] text-muted-foreground">{dept.abbreviation}</span>
                            </span>
                          </td>
                          {DAY_KEYS.map((day) => {
                            const isWknd = day === "sat" || day === "sun"
                            const isActiveDay = st.active_days?.includes(day) ?? true
                            const entry = shiftCoverage[st.code]?.[day]
                            const covEntry = (typeof entry === "object" && entry !== null ? entry : {} as ShiftCoverageEntry)
                            const val = covEntry[dept.code] ?? 0
                            return (
                              <td key={day} className={cn("px-1 py-0.5 text-center", isWknd && "bg-muted/30")}>
                                {isActiveDay ? (
                                  <div className="group flex items-center justify-center gap-0.5">
                                    <input type="number" min={0} max={20} value={val || ""}
                                      onChange={(e) => setShiftCov(st.code, day, dept.code, e.target.value)}
                                      disabled={isPending}
                                      className={cn(
                                        "no-spinners w-10 h-6 rounded border text-center text-[12px] outline-none disabled:opacity-50",
                                        val > 0 ? "border-input bg-background text-foreground" : "border-input bg-background text-muted-foreground/30",
                                        "focus:border-ring focus:ring-1 focus:ring-ring/50"
                                      )}
                                    />
                                    <div className="flex flex-col opacity-0 group-hover:opacity-100 transition-opacity">
                                      <button type="button" tabIndex={-1}
                                        onClick={() => setShiftCov(st.code, day, dept.code, String(val + 1))}
                                        className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                                      ><ChevronUp className="size-3" /></button>
                                      <button type="button" tabIndex={-1}
                                        onClick={() => setShiftCov(st.code, day, dept.code, String(Math.max(0, val - 1)))}
                                        className="flex items-center justify-center text-muted-foreground hover:text-foreground"
                                      ><ChevronDown className="size-3" /></button>
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground/30">—</span>
                                )}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="px-5 py-2 text-[11px] text-muted-foreground border-t border-border/50">
          {(isByShift && shiftCoverageEnabled) || hasShiftCoverage
            ? t("fields.coverageShiftFooter")
            : t("fields.coverageDeptFooter")}
        </p>
      </div>

      {/* ── COBERTURA POR TAREA (solo by_task) ────────────────────────── */}
      {rotaDisplayMode === "by_task" && (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
            <span className="text-[13px] font-medium">{t("fields.taskCoverageOptional")}</span>
            <button
              type="button"
              onClick={handleToggleCoverage}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                taskCoverageEnabled ? "bg-emerald-500" : "bg-muted-foreground/20"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                taskCoverageEnabled ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>
          {!taskCoverageEnabled ? (
            <div className="px-5 py-4">
              <p className="text-[13px] text-muted-foreground">
                {t("fields.taskCoverageDisabledHint")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">{t("fields.taskColumn")}</th>
                    {DAY_KEYS.map((day) => (
                      <th key={day} className="px-1 py-2 text-center font-medium text-muted-foreground w-[52px]">{t(`days.${day}`).slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rootDepts = departments.length > 0
                      ? departments.filter((d) => !d.parent_id)
                      : [{ id: "lab", code: "lab", name: t("fields.embryology") }, { id: "andrology", code: "andrology", name: t("fields.andrology") }]
                    const activeTecnicas = tecnicas.filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
                    const activeShiftCodes = activeShifts.map((st) => st.code)
                    const shiftLabelMap: Record<string, string> = {}
                    for (const st of activeShifts) shiftLabelMap[st.code] = st.name_es || st.code

                    return rootDepts.map((dept) => {
                      const deptTecnicas = activeTecnicas.filter((tc) => tc.department.split(",").includes(dept.code))
                      if (deptTecnicas.length === 0) return null

                      // Build rows: one per task, or one per task+shift for multi-shift tasks
                      type CovRow = { tec: typeof deptTecnicas[0]; covKey: string; shiftCode?: string }
                      const rows: CovRow[] = []
                      for (const tec of deptTecnicas) {
                        const ts = tec.typical_shifts ?? []
                        const inMultipleShifts = ts.length > 1 || (ts.length === 0 && activeShiftCodes.length > 1)
                        if (inMultipleShifts) {
                          const shifts = ts.length > 0 ? ts : activeShiftCodes
                          for (const sc of shifts) {
                            rows.push({ tec, covKey: `${tec.codigo}__${sc}`, shiftCode: sc })
                          }
                        } else {
                          rows.push({ tec, covKey: tec.codigo })
                        }
                      }

                      return (
                        <Fragment key={dept.id ?? dept.code}>
                          <tr className="bg-muted/60">
                            <td colSpan={8} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              {dept.name} <span className="text-muted-foreground/50 ml-1">{deptTecnicas.length}</span>
                            </td>
                          </tr>
                          {rows.map((row, idx) => (
                            <tr key={row.covKey} className={cn("border-b border-border/50", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                              <td className="px-3 py-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: row.tec.color?.startsWith("#") ? row.tec.color : "#64748B" }} />
                                  <span className="text-[13px] font-medium">{row.tec.codigo}</span>
                                  <span className="text-[11px] text-muted-foreground truncate max-w-[80px]">{row.tec.nombre_es}</span>
                                  {row.shiftCode && (
                                    <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none bg-muted text-muted-foreground border border-border">
                                      {shiftLabelMap[row.shiftCode] ?? row.shiftCode}
                                    </span>
                                  )}
                                </span>
                              </td>
                              {DAY_KEYS.map((day) => {
                                const explicitVal = taskCoverage[row.covKey]?.[day]
                                const isWeekend = day === "sat" || day === "sun"
                                return (
                                  <td key={day} className={cn("px-1 py-1 text-center", isWeekend && "bg-muted/30")}>
                                    <input type="number" min={0} value={explicitVal ?? ""}
                                      onChange={(e) => setTaskCov(row.covKey, day, e.target.value)} disabled={isPending}
                                      className={cn("w-12 h-7 rounded border text-center text-[13px] outline-none disabled:opacity-50 mx-auto block",
                                        explicitVal !== undefined ? "border-input bg-background text-foreground"
                                          : "border-input bg-background text-muted-foreground/40",
                                        "focus:border-ring focus:ring-1 focus:ring-ring/50"
                                      )} />
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </Fragment>
                      )
                    })
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── FESTIVOS ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("holidayModeTitle")} />
        <p className="text-[13px] text-muted-foreground mb-3">{t("holidayModeDescription")}</p>
        <div className="flex flex-col gap-1 pb-4">
          {([
            { value: "weekday", label: t("holidayModeWeekday"), hint: t("holidayModeWeekdayHint") },
            { value: "saturday", label: t("holidayModeSaturday"), hint: t("holidayModeSaturdayHint") },
            { value: "sunday", label: t("holidayModeSunday"), hint: t("holidayModeSundayHint") },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex items-start gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                values.public_holiday_mode === opt.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted/50"
              )}
            >
              <input
                type="radio"
                name="public_holiday_mode"
                value={opt.value}
                checked={values.public_holiday_mode === opt.value}
                onChange={() => setValues((p) => ({ ...p, public_holiday_mode: opt.value }))}
                disabled={isPending}
                className="mt-0.5 accent-primary"
              />
              <div>
                <span className="text-[14px] font-medium">{opt.label}</span>
                <p className="text-[12px] text-muted-foreground mt-0.5">{opt.hint}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      </>}

      {(section === "all" || section === "workload") && <>
      {/* ── PROCEDIMIENTOS ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <SectionHeader title={t("fields.proceduresTitle")} />
          <p className="text-[13px] text-muted-foreground">{t("fields.proceduresDescription")}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[100px]"></th>
                {DAY_KEYS.map((day) => (
                  <th key={day} className={cn("px-1 py-2 text-center font-medium text-muted-foreground w-[52px]", (day === "sat" || day === "sun") && "bg-muted/60")}>
                    {t(`days.${day}`).slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Punciones row */}
              <tr className="border-b border-border/50">
                <td className="px-3 py-1.5 text-[13px] font-medium">{t("fields.pickUps")}</td>
                {DAY_KEYS.map((day) => {
                  const isWeekend = day === "sat" || day === "sun"
                  return (
                    <td key={day} className={cn("px-1 py-1.5 text-center", isWeekend && "bg-muted/30")}>
                      <input
                        type="number"
                        min={0}
                        max={50}
                        value={values.punctions_by_day[day]}
                        onChange={(e) => setPunction(day, e.target.value)}
                        disabled={isPending}
                        className="w-12 h-7 rounded border border-input bg-transparent text-center text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 disabled:opacity-50 mx-auto block"
                      />
                    </td>
                  )
                })}
              </tr>
              {/* Biopsias row — auto-calculated with D5/D6 offset */}
              <tr className="bg-muted/10">
                <td className="px-3 py-1.5 text-[13px] font-medium text-muted-foreground">
                  {t("fields.biopsies")}
                  <span className="text-[10px] text-muted-foreground/60 ml-1">D5/D6</span>
                </td>
                {DAY_KEYS.map((day, dayIdx) => {
                  const isWeekend = day === "sat" || day === "sun"
                  const rate = values.biopsy_conversion_rate ?? 0.5
                  const d5Pct = values.biopsy_day5_pct ?? 0.5
                  const d6Pct = values.biopsy_day6_pct ?? 0.5
                  // D5: 5 days before this weekday, D6: 6 days before
                  const d5DayIdx = ((dayIdx - 5) % 7 + 7) % 7
                  const d6DayIdx = ((dayIdx - 6) % 7 + 7) % 7
                  const p5 = values.punctions_by_day[DAY_KEYS[d5DayIdx]] ?? 0
                  const p6 = values.punctions_by_day[DAY_KEYS[d6DayIdx]] ?? 0
                  const biopsies = Math.round(p5 * rate * d5Pct + p6 * rate * d6Pct)
                  return (
                    <td key={day} className={cn("px-1 py-1.5 text-center text-muted-foreground", isWeekend && "bg-muted/30")}>
                      <span className="text-[13px]">{biopsies}</span>
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-5 py-2 text-[11px] text-muted-foreground border-t border-border/50">
          {t("fields.biopsiesFooter")}
        </p>
      </div>

      {/* ── BIOPSIAS ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("fields.biopsyTitle")} />
        <p className="text-[13px] text-muted-foreground mb-3">{t("fields.biopsyDescription")}</p>
        <div className="flex flex-col gap-0">
          <FieldRow label={t("fields.conversionRate")} hint={t("fields.conversionRateHint")}>
            <div className="flex items-center gap-1.5">
              <Input
                type="number" min={0} max={100} step={1}
                value={Math.round(values.biopsy_conversion_rate * 100)}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10)
                  if (!isNaN(v) && v >= 0 && v <= 100) setValues((p) => ({ ...p, biopsy_conversion_rate: v / 100 }))
                }}
                disabled={isPending}
                className="w-16 text-center"
              />
              <span className="text-[13px] text-muted-foreground">%</span>
            </div>
          </FieldRow>
          <FieldRow label={t("fields.d5d6Distribution")} hint={t("fields.d5d6DistributionHint")}>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">D5</span>
                <Input
                  type="number" min={0} max={100} step={5}
                  value={Math.round(values.biopsy_day5_pct * 100)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v) && v >= 0 && v <= 100) setValues((p) => ({ ...p, biopsy_day5_pct: v / 100, biopsy_day6_pct: (100 - v) / 100 }))
                  }}
                  disabled={isPending}
                  className="w-14 text-center"
                />
              </div>
              <span className="text-muted-foreground">/</span>
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-muted-foreground">D6</span>
                <Input
                  type="number" min={0} max={100} step={5}
                  value={Math.round(values.biopsy_day6_pct * 100)}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10)
                    if (!isNaN(v) && v >= 0 && v <= 100) setValues((p) => ({ ...p, biopsy_day6_pct: v / 100, biopsy_day5_pct: (100 - v) / 100 }))
                  }}
                  disabled={isPending}
                  className="w-14 text-center"
                />
              </div>
              <span className="text-[11px] text-muted-foreground">%</span>
            </div>
          </FieldRow>
        </div>
      </div>

      {/* ── CONFLICTO POR TAREA (solo by_task) ─────────────────────────── */}
      {rotaDisplayMode === "by_task" && (
        <div className="rounded-lg border border-border bg-background px-5">
          <SectionHeader title="Conflicto por tarea" />
          <div className="flex flex-col gap-0">
            <FieldRow label="Umbral de conflicto" hint="Avisar cuando una persona está asignada a más de X tareas en el mismo día">
              <Input
                type="number" min={2} max={10}
                value={values.task_conflict_threshold}
                onChange={(e) => { const v = parseInt(e.target.value, 10); if (!isNaN(v) && v >= 2) setValues((p) => ({ ...p, task_conflict_threshold: v })) }}
                disabled={isPending}
                className="w-16 text-center"
              />
            </FieldRow>
          </div>
        </div>
      )}

      {/* ── RATIO DE COBERTURA ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("sections.ratioCobertura")} />
        <p className="text-[13px] text-muted-foreground mb-3">{t("fields.ratioDescription")}</p>
        <div className="flex flex-col gap-0">
          <FieldRow label={t("fields.ratioOptimal")} hint={t("fields.ratioOptimalHint")}>
            <div className="flex items-center gap-1">
              <button type="button" disabled={isPending || values.ratio_optimal <= 0.1} onClick={() => setValues((p) => ({ ...p, ratio_optimal: Math.round((p.ratio_optimal - 0.1) * 10) / 10 }))} className="size-7 flex items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-30">
                <ChevronDown className="size-3.5" />
              </button>
              <Input
                type="number" min={0.1} max={5} step={0.1}
                value={values.ratio_optimal}
                onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setValues((p) => ({ ...p, ratio_optimal: v })) }}
                disabled={isPending}
                className="w-16 text-center"
              />
              <button type="button" disabled={isPending || values.ratio_optimal >= 5} onClick={() => setValues((p) => ({ ...p, ratio_optimal: Math.round((p.ratio_optimal + 0.1) * 10) / 10 }))} className="size-7 flex items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-30">
                <ChevronUp className="size-3.5" />
              </button>
            </div>
          </FieldRow>
          <FieldRow label={t("fields.ratioMinimum")} hint={t("fields.ratioMinimumHint")}>
            <div className="flex items-center gap-1">
              <button type="button" disabled={isPending || values.ratio_minimum <= 0.1} onClick={() => setValues((p) => ({ ...p, ratio_minimum: Math.round((p.ratio_minimum - 0.1) * 10) / 10 }))} className="size-7 flex items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-30">
                <ChevronDown className="size-3.5" />
              </button>
              <Input
                type="number" min={0.1} max={5} step={0.1}
                value={values.ratio_minimum}
                onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) setValues((p) => ({ ...p, ratio_minimum: v })) }}
                disabled={isPending}
                className="w-16 text-center"
              />
              <button type="button" disabled={isPending || values.ratio_minimum >= 5} onClick={() => setValues((p) => ({ ...p, ratio_minimum: Math.round((p.ratio_minimum + 0.1) * 10) / 10 }))} className="size-7 flex items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-30">
                <ChevronUp className="size-3.5" />
              </button>
            </div>
          </FieldRow>
        </div>
      </div>

      {/* Coverage behaviour */}
      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">{t("sections.coverageBehaviour")}</p>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={values.public_holiday_reduce_budget}
            onChange={(e) => setValues((p) => ({ ...p, public_holiday_reduce_budget: e.target.checked }))}
            disabled={isPending}
            className="mt-0.5 size-4 accent-primary"
          />
          <div>
            <span className="text-[14px] font-medium">{t("holidayReduceShiftsLabel")}</span>
            <p className="text-[12px] text-muted-foreground mt-0.5">{t("holidayReduceShiftsHint")}</p>
          </div>
        </label>

        {hasPartTime && (
          <div className="flex items-center gap-3">
            <label className="text-[14px] font-medium w-56 shrink-0">{t("partTimeWeightLabel")}</label>
            <input
              type="number" min={0.1} max={1} step={0.1}
              value={values.part_time_weight}
              onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0.1 && v <= 1) setValues((p) => ({ ...p, part_time_weight: Math.round(v * 10) / 10 })) }}
              disabled={isPending}
              className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-[13px] text-center outline-none focus-visible:border-ring"
            />
            <span className="text-[12px] text-muted-foreground">{t("coverageWeightFraction")}</span>
          </div>
        )}
        {hasPartTime && (
          <p className="text-[11px] text-muted-foreground/70 -mt-2">{t("partTimeWeightHint")}</p>
        )}

        {hasIntern && (
          <div className="flex items-center gap-3">
            <label className="text-[14px] font-medium w-56 shrink-0">{t("internWeightLabel")}</label>
            <input
              type="number" min={0.1} max={1} step={0.1}
              value={values.intern_weight}
              onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0.1 && v <= 1) setValues((p) => ({ ...p, intern_weight: Math.round(v * 10) / 10 })) }}
              disabled={isPending}
              className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-[13px] text-center outline-none focus-visible:border-ring"
            />
            <span className="text-[12px] text-muted-foreground">{t("coverageWeightFraction")}</span>
          </div>
        )}
        {hasIntern && (
          <p className="text-[11px] text-muted-foreground/70 -mt-2">{t("internWeightHint")}</p>
        )}
      </div>

      </>}


      {/* ── Footer ───────────────────────────────────────────────────────── */}
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
