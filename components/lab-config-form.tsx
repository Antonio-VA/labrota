"use client"

import { useState, useTransition, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import { toast } from "sonner"
import type { LabConfig, PunctionsByDay, CoverageByDay } from "@/lib/types/database"
import { COUNTRIES, getCountry } from "@/lib/regional-config"
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

export function LabConfigForm({ config, section = "all" }: { config: LabConfig; section?: "all" | "regional" | "cobertura" }) {
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

  const [values, setValues] = useState({
    punctions_by_day:     config.punctions_by_day ?? DEFAULT_PUNCTIONS,
    autonomous_community: config.autonomous_community ?? "",
    ratio_optimal:        config.ratio_optimal ?? 1.0,
    ratio_minimum:        config.ratio_minimum ?? 0.75,
    first_day_of_week:    config.first_day_of_week ?? 0,
    country:              config.country ?? "",
    region:               config.region ?? "",
    time_format:          config.time_format ?? "24h",
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
      const result = await updateLabConfig({
        punctions_by_day:     values.punctions_by_day,
        autonomous_community: values.region || values.autonomous_community || null,
        ratio_optimal:        values.ratio_optimal,
        ratio_minimum:        values.ratio_minimum,
        first_day_of_week:    values.first_day_of_week,
        country:              values.country || undefined,
        region:               values.region || undefined,
        time_format:          values.time_format,
      })
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

      {(section === "all" || section === "cobertura") && <>
      {/* ── COBERTURA MÍNIMA ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
            {t("sections.coverage")}
          </p>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-[30%]">{t("coverageTable.day")}</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">{t("coverageTable.labMin")}</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">{t("coverageTable.andrologyMin")}</th>
              <th className="px-4 py-2.5 text-center font-medium text-muted-foreground">
                {t("coverageTable.adminMin")}
                <p className="text-[10px] font-normal text-muted-foreground/70 mt-0.5">{t("fields.adminHint")}</p>
              </th>
            </tr>
          </thead>
          <tbody>
            {DAY_KEYS.map((day) => {
              const isWeekend = day === "sat" || day === "sun"
              return (
                <tr
                  key={day}
                  className={cn(
                    "border-b border-border last:border-0",
                    isWeekend ? "bg-muted" : "bg-background"
                  )}
                >
                  <td className="px-4 py-2.5 font-medium text-muted-foreground">{t(`days.${day}`)}</td>
                  {(["lab", "andrology", "admin"] as const).map((role) => (
                    <td key={role} className="px-4 py-2.5 text-center">
                      <input
                        type="number"
                        min={0}
                        max={10}
                        value={coverageByDay[day][role]}
                        onChange={(e) => setCoverage(day, role, e.target.value)}
                        disabled={coveragePending}
                        className="w-16 h-8 rounded-[8px] border border-input bg-transparent text-center text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 mx-auto block"
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="px-5 py-3 border-t border-border flex items-center gap-3">
          <Button type="button" onClick={handleCoverageSave} disabled={coveragePending}>
            {coveragePending ? t("saving") : t("saveCoverage")}
          </Button>
          {coverageStatus === "success" && (
            <span className="flex items-center gap-1.5 text-[14px] text-emerald-600">
              <CheckCircle2 className="size-4" />
              {t("updateSuccess")}
            </span>
          )}
          {coverageStatus === "error" && (
            <span className="flex items-center gap-1.5 text-[14px] text-destructive">
              <AlertCircle className="size-4" />
              {coverageErrorMsg}
            </span>
          )}
        </div>
      </div>

      {/* ── PUNCIONES ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("sections.punctions")} />
        <div className="py-2 pb-3">
          <p className="text-[13px] text-muted-foreground mb-3">{t("fields.punctionsByDay")}</p>
          <div className="flex flex-col gap-0">
            {DAY_KEYS.map((day) => (
              <div
                key={day}
                className="flex items-center justify-between py-2 border-b border-border last:border-0"
              >
                <span className="text-[14px] font-medium">{t(`days.${day}`)}</span>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  value={values.punctions_by_day[day]}
                  onChange={(e) => setPunction(day, e.target.value)}
                  disabled={isPending}
                  className="w-20 text-center"
                />
              </div>
            ))}
          </div>
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

      </>}

      {(section === "all" || section === "regional") && <>
      {/* ── CONFIGURACIÓN REGIONAL ──────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title="Configuración regional" />
        <div className="flex flex-col gap-0">
          {/* País */}
          <FieldRow label="País">
            <select
              value={values.country}
              onChange={(e) => {
                const code = e.target.value
                const cfg = getCountry(code)
                setValues((p) => ({
                  ...p,
                  country: code,
                  region: "",
                  ...(cfg ? { time_format: cfg.timeFormat, first_day_of_week: cfg.firstDayOfWeek } : {}),
                }))
                if (cfg) toast.success("Actualizado según el país")
              }}
              disabled={isPending}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 min-w-[220px]"
            >
              <option value="">— Seleccionar —</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name_es}</option>
              ))}
            </select>
          </FieldRow>

          {/* Región */}
          {values.country && (() => {
            const cfg = getCountry(values.country)
            if (!cfg || cfg.regions.length === 0) return null
            return (
              <FieldRow label="Región" hint="Determina los festivos que se cargan automáticamente">
                <select
                  value={values.region}
                  onChange={(e) => setValues((p) => ({ ...p, region: e.target.value }))}
                  disabled={isPending}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 min-w-[220px]"
                >
                  <option value="">— Seleccionar —</option>
                  {cfg.regions.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </FieldRow>
            )
          })()}

          {/* Formato de hora */}
          <FieldRow label="Formato de hora">
            <div className="flex rounded-lg border border-input overflow-hidden">
              {(["24h", "12h"] as const).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  disabled={isPending}
                  onClick={() => setValues((p) => ({ ...p, time_format: fmt }))}
                  className={cn(
                    "px-4 py-1.5 text-[13px] font-medium transition-colors",
                    values.time_format === fmt
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  {fmt === "24h" ? "24h" : "12h (AM/PM)"}
                </button>
              ))}
            </div>
          </FieldRow>

          {/* Primer día de la semana */}
          <FieldRow label={t("fields.firstDay")} hint={t("fields.firstDayHint")}>
            <select
              value={values.first_day_of_week}
              onChange={(e) => setValues((p) => ({ ...p, first_day_of_week: parseInt(e.target.value, 10) }))}
              disabled={isPending}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <option value={0}>{t("fields.firstDayMon")}</option>
              <option value={6}>{t("fields.firstDaySun")}</option>
              <option value={5}>{t("fields.firstDaySat")}</option>
            </select>
          </FieldRow>
        </div>

        {values.region && (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 mb-3">
            <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[13px] text-muted-foreground">{t("holidaysHint")}</p>
          </div>
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
