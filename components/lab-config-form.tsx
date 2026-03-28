"use client"

import { useState, useTransition, useCallback, Fragment } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import type { LabConfig, PunctionsByDay, CoverageByDay } from "@/lib/types/database"
import { CheckCircle2, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

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

export function LabConfigForm({ config, section = "all", rotaDisplayMode = "by_shift", tecnicas = [], departments = [] }: { config: LabConfig; section?: "all" | "cobertura" | "parametros"; rotaDisplayMode?: string; tecnicas?: import("@/lib/types/database").Tecnica[]; departments?: import("@/lib/types/database").Department[] }) {
  const t = useTranslations("lab")
  const [isPending,         startTransition]         = useTransition()
  const [coveragePending,   startCoverageTransition] = useTransition()
  const [status,            setStatus]            = useState<"idle" | "success" | "error">("idle")
  const [coverageStatus,    setCoverageStatus]    = useState<"idle" | "success" | "error">("idle")
  const [errorMsg,          setErrorMsg]          = useState("")
  const [coverageErrorMsg,  setCoverageErrorMsg]  = useState("")

  const DEFAULT_PUNCTIONS: PunctionsByDay = { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 2, sun: 0 }

  const [coverageByDay, setCoverageByDay] = useState<CoverageByDay>(
    config.coverage_by_day ?? DEFAULT_COVERAGE
  )

  // Task-level coverage
  const [taskCoverageEnabled, setTaskCoverageEnabled] = useState(config.task_coverage_enabled ?? false)
  const [taskCoverage, setTaskCoverage] = useState<Record<string, Record<string, number>>>(
    (config.task_coverage_by_day as Record<string, Record<string, number>>) ?? {}
  )
  const [taskCoverageWarnings, setTaskCoverageWarnings] = useState<Set<string>>(new Set())

  function setTaskCov(code: string, day: string, raw: string) {
    const v = parseInt(raw, 10)
    if (raw === "" || raw === undefined) {
      // Clear the explicit value (inherit from department)
      setTaskCoverage((p) => {
        const next = { ...p }
        if (next[code]) {
          const { [day]: _, ...rest } = next[code]
          next[code] = rest
          if (Object.keys(next[code]).length === 0) delete next[code]
        }
        return next
      })
      setTaskCoverageWarnings((p) => { const n = new Set(p); n.delete(`${code}-${day}`); return n })
      return
    }
    if (isNaN(v) || v < 0) return
    // Get department min for this task's department on this day
    const tec = tecnicas.find((tc) => tc.codigo === code)
    const deptCode = tec?.department?.split(",")[0] ?? "lab"
    const deptMin = coverageByDay[day as keyof CoverageByDay]?.[deptCode as "lab" | "andrology" | "admin"] ?? 0
    const clamped = Math.min(v, deptMin)
    setTaskCoverage((p) => ({ ...p, [code]: { ...(p[code] ?? {}), [day]: clamped } }))
    // Warning if user tried to exceed
    if (v > deptMin) {
      setTaskCoverageWarnings((p) => new Set(p).add(`${code}-${day}`))
    } else {
      setTaskCoverageWarnings((p) => { const n = new Set(p); n.delete(`${code}-${day}`); return n })
    }
  }

  function handleToggleTaskCoverage() {
    if (taskCoverageEnabled && Object.keys(taskCoverage).length > 0) {
      if (!confirm("¿Desactivar cobertura por tarea? Los valores guardados se conservarán pero no se aplicarán.")) return
    }
    setTaskCoverageEnabled(!taskCoverageEnabled)
  }

  const [values, setValues] = useState({
    punctions_by_day:     config.punctions_by_day ?? DEFAULT_PUNCTIONS,
    autonomous_community: config.autonomous_community ?? "",
    ratio_optimal:        config.ratio_optimal ?? 1.0,
    ratio_minimum:        config.ratio_minimum ?? 0.75,
    biopsy_conversion_rate: config.biopsy_conversion_rate ?? 0.5,
    biopsy_day5_pct:       config.biopsy_day5_pct ?? 0.5,
    biopsy_day6_pct:       config.biopsy_day6_pct ?? 0.5,
    task_conflict_threshold: config.task_conflict_threshold ?? 3,
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

  function handleCoverageSave() {
    setCoverageStatus("idle")
    startCoverageTransition(async () => {
      const result = await updateLabConfig({ coverage_by_day: coverageByDay })
      if (result.error) {
        setCoverageErrorMsg(result.error)
        setCoverageStatus("error")
      } else {
        setCoverageStatus("success")
        setTimeout(() => setCoverageStatus("idle"), 3000)
      }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("idle")
    startTransition(async () => {
      // Validate task coverage before save
      if (taskCoverageEnabled) {
        const violations: string[] = []
        for (const [code, days] of Object.entries(taskCoverage)) {
          const tec = tecnicas.find((tc) => tc.codigo === code)
          const deptCode = tec?.department?.split(",")[0] ?? "lab"
          for (const [day, val] of Object.entries(days)) {
            const deptMin = coverageByDay[day as keyof CoverageByDay]?.[deptCode as "lab" | "andrology" | "admin"] ?? 0
            if (val > deptMin) violations.push(`${code} ${day}`)
          }
        }
        if (violations.length > 0) {
          setErrorMsg("Algunas tareas superan el mínimo del departamento. Ajusta los valores marcados antes de guardar.")
          setStatus("error")
          return
        }
      }
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
      } as any)
      if (result.error) {
        setErrorMsg(result.error)
        setStatus("error")
      } else {
        setStatus("success")
        setTimeout(() => setStatus("idle"), 3000)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {(section === "all" || section === "parametros") && <>
      {/* ── PROCEDIMIENTOS ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <SectionHeader title="Procedimientos" />
          <p className="text-[13px] text-muted-foreground">Previsión de procedimientos por día de la semana.</p>
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
                <td className="px-3 py-1.5 text-[13px] font-medium">Punciones</td>
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
              {/* Biopsias row — auto-calculated */}
              <tr className="bg-muted/10">
                <td className="px-3 py-1.5 text-[13px] font-medium text-muted-foreground">
                  Biopsias
                  <span className="text-[10px] text-muted-foreground/60 ml-1">Auto</span>
                </td>
                {DAY_KEYS.map((day) => {
                  const isWeekend = day === "sat" || day === "sun"
                  const punctions = values.punctions_by_day[day] ?? 0
                  const rate = values.biopsy_conversion_rate ?? 0.5
                  const biopsies = Math.round(punctions * rate)
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
      </div>

      {/* ── RATIO DE COBERTURA ──────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("sections.ratioCobertura")} />
        <p className="text-[13px] text-muted-foreground mb-3">{t("fields.ratioDescription")}</p>
        <div className="flex flex-col gap-0">
          <FieldRow label={t("fields.ratioOptimal")} hint={t("fields.ratioOptimalHint")}>
            <Input
              type="number"
              min={0.1}
              max={5}
              step={0.05}
              value={values.ratio_optimal}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v > 0) setValues((p) => ({ ...p, ratio_optimal: v }))
              }}
              disabled={isPending}
              className="w-20 text-center"
            />
          </FieldRow>
          <FieldRow label={t("fields.ratioMinimum")} hint={t("fields.ratioMinimumHint")}>
            <Input
              type="number"
              min={0.1}
              max={5}
              step={0.05}
              value={values.ratio_minimum}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v > 0) setValues((p) => ({ ...p, ratio_minimum: v }))
              }}
              disabled={isPending}
              className="w-20 text-center"
            />
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
                type="number"
                min={2}
                max={10}
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

      </>}

      {(section === "all" || section === "cobertura") && <>
      {/* ── COBERTURA MÍNIMA POR DEPARTAMENTO ──────────────────────────── */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
            {t("sections.coverage")} — Por departamento
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">Departamento</th>
                {DAY_KEYS.map((day) => (
                  <th key={day} className={cn("px-1 py-2 text-center font-medium text-muted-foreground w-[52px]", (day === "sat" || day === "sun") && "bg-muted/60")}>
                    {t(`days.${day}`).slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["lab", "andrology", "admin"] as const).map((role, rIdx) => {
                const label = role === "lab" ? "Embriología" : role === "andrology" ? "Andrología" : "Administración"
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
        <p className="px-5 py-2 text-[11px] text-muted-foreground border-t border-border/50">
          Pon 0 para no requerir un departamento en un día concreto.
        </p>
      </div>

      {/* ── POR TAREA (optional) ───────────────────────────────────────── */}
      {tecnicas.length > 0 && (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={taskCoverageEnabled}
                onChange={handleToggleTaskCoverage}
                className="size-4 rounded accent-primary"
              />
              <span className="text-[13px] font-medium">Definir cobertura mínima por tarea (opcional)</span>
            </label>
          </div>
          {!taskCoverageEnabled ? (
            <div className="px-5 py-4">
              <p className="text-[13px] text-muted-foreground">
                El generador usará los mínimos por departamento para todas las tareas. Activa esta opción solo si necesitas excepciones específicas por tarea.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">Tarea</th>
                    {DAY_KEYS.map((day) => (
                      <th key={day} className="px-1 py-2 text-center font-medium text-muted-foreground w-[52px]">{t(`days.${day}`).slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rootDepts = departments.length > 0
                      ? departments.filter((d) => !d.parent_id)
                      : [{ id: "lab", code: "lab", name: "Embriología" }, { id: "andrology", code: "andrology", name: "Andrología" }]
                    const activeTecnicas = tecnicas.filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
                    return rootDepts.map((dept) => {
                      const deptTecnicas = activeTecnicas.filter((tc) => tc.department.split(",").includes(dept.code))
                      if (deptTecnicas.length === 0) return null
                      return (
                        <Fragment key={dept.id ?? dept.code}>
                          {/* Department group header */}
                          <tr className="bg-muted/60">
                            <td colSpan={8} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                              {dept.name} <span className="text-muted-foreground/50 ml-1">{deptTecnicas.length}</span>
                            </td>
                          </tr>
                          {deptTecnicas.map((tec, idx) => (
                            <tr key={tec.id} className={cn("border-b border-border/50", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                              <td className="px-3 py-1.5">
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: tec.color?.startsWith("#") ? tec.color : "#64748B" }} />
                                  <span className="text-[13px] font-medium">{tec.codigo}</span>
                                  <span className="text-[11px] text-muted-foreground truncate max-w-[80px]">{tec.nombre_es}</span>
                                </span>
                              </td>
                              {DAY_KEYS.map((day) => {
                                const deptRole = dept.code as "lab" | "andrology" | "admin"
                                const deptMin = coverageByDay[day]?.[deptRole] ?? 0
                                const explicitVal = taskCoverage[tec.codigo]?.[day]
                                const hasWarning = taskCoverageWarnings.has(`${tec.codigo}-${day}`)
                                const isWeekend = day === "sat" || day === "sun"
                                return (
                                  <td key={day} className={cn("px-1 py-1 text-center", isWeekend && "bg-muted/30")}>
                                    <div className="relative">
                                      <input
                                        type="number"
                                        min={0}
                                        max={deptMin}
                                        value={explicitVal ?? ""}
                                        onChange={(e) => setTaskCov(tec.codigo, day, e.target.value)}
                                        disabled={isPending}
                                        className={cn(
                                          "w-12 h-7 rounded border text-center text-[13px] outline-none disabled:opacity-50 mx-auto block",
                                          hasWarning
                                            ? "border-amber-400 bg-amber-50 text-amber-700"
                                            : explicitVal !== undefined
                                            ? "border-input bg-background text-foreground"
                                            : "border-transparent bg-transparent text-muted-foreground/40",
                                          "focus:border-ring focus:ring-1 focus:ring-ring/50 placeholder:text-muted-foreground/30"
                                        )}
                                      />
                                      {hasWarning && (
                                        <p className="text-[8px] text-amber-600 absolute -bottom-3 left-0 right-0 text-center whitespace-nowrap">máx. {deptMin}</p>
                                      )}
                                    </div>
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
