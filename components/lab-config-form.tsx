"use client"

import { useState, useTransition, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import type { LabConfig, PunctionsByDay, CoverageByDay, ShiftTypeDefinition } from "@/lib/types/database"
import { CheckCircle2, AlertCircle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Spanish autonomous communities ────────────────────────────────────────────
const COMMUNITIES = [
  { value: "and", label: "Andalucía" },
  { value: "ara", label: "Aragón" },
  { value: "ast", label: "Asturias (Principado de)" },
  { value: "bal", label: "Baleares (Islas)" },
  { value: "can", label: "Canarias" },
  { value: "cnt", label: "Cantabria" },
  { value: "clm", label: "Castilla-La Mancha" },
  { value: "cyl", label: "Castilla y León" },
  { value: "cat", label: "Cataluña" },
  { value: "val", label: "Comunidad Valenciana" },
  { value: "ext", label: "Extremadura" },
  { value: "gal", label: "Galicia" },
  { value: "rio", label: "La Rioja" },
  { value: "mad", label: "Madrid (Comunidad de)" },
  { value: "mur", label: "Murcia (Región de)" },
  { value: "nav", label: "Navarra (Comunidad Foral de)" },
  { value: "vac", label: "País Vasco" },
  { value: "ceu", label: "Ceuta (Ciudad Autónoma de)" },
  { value: "mel", label: "Melilla (Ciudad Autónoma de)" },
]

const DAY_KEYS: (keyof PunctionsByDay)[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

// ── Toggle switch ─────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block size-4 rounded-full bg-white shadow ring-0 transition-transform",
        checked ? "translate-x-4" : "translate-x-0"
      )} />
    </button>
  )
}

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

export function LabConfigForm({ config, shiftTypes }: { config: LabConfig; shiftTypes: ShiftTypeDefinition[] }) {
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
    staffing_ratio:       config.staffing_ratio,
    admin_on_weekends:    config.admin_on_weekends,
    admin_default_shift:  config.admin_default_shift ?? (shiftTypes[0]?.code ?? ""),
    autonomous_community: config.autonomous_community ?? "",
  })

  function setFloat(field: keyof typeof values, raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v) && v > 0) setValues((p) => ({ ...p, [field]: v }))
  }

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
        staffing_ratio:       values.staffing_ratio,
        admin_on_weekends:    values.admin_on_weekends,
        admin_default_shift:  values.admin_default_shift || null,
        autonomous_community: values.autonomous_community || null,
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

      {/* ── COBERTURA MÍNIMA ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
            {t("sections.coverage")}
          </p>
        </div>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-slate-100 border-b border-border">
              <th className="px-4 py-2.5 text-left font-medium text-slate-600 w-[30%]">{t("coverageTable.day")}</th>
              <th className="px-4 py-2.5 text-center font-medium text-slate-600">{t("coverageTable.labMin")}</th>
              <th className="px-4 py-2.5 text-center font-medium text-slate-600">{t("coverageTable.andrologyMin")}</th>
              <th className="px-4 py-2.5 text-center font-medium text-slate-600">{t("coverageTable.adminMin")}</th>
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
                    isWeekend ? "bg-slate-50" : "bg-white"
                  )}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-600">{t(`days.${day}`)}</td>
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

      {/* ── RATIO DE PERSONAL ────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("sections.staffing")} />
        <FieldRow label={t("fields.staffingRatio")} hint={t("fields.staffingRatioHint")}>
          <Input type="number" min={0.1} max={10} step={0.1} value={values.staffing_ratio}
            onChange={(e) => setFloat("staffing_ratio", e.target.value)}
            disabled={isPending} className="w-20 text-center" />
        </FieldRow>
        <FieldRow label={t("fields.adminOnWeekends")}>
          <Toggle
            checked={values.admin_on_weekends}
            onChange={(v) => setValues((p) => ({ ...p, admin_on_weekends: v }))}
            disabled={isPending}
          />
        </FieldRow>
        <FieldRow label={t("fields.adminDefaultShift")} hint={t("fields.adminDefaultShiftHint")}>
          <select
            value={values.admin_default_shift}
            onChange={(e) => setValues((p) => ({ ...p, admin_default_shift: e.target.value }))}
            disabled={isPending}
            className="h-8 rounded-lg border border-border bg-background px-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-ring/50"
          >
            {shiftTypes.map((st) => (
              <option key={st.code} value={st.code}>{st.code} — {st.name_es}</option>
            ))}
          </select>
        </FieldRow>
      </div>

      {/* ── FESTIVOS ─────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("sections.holidays")} />
        <div className="py-3 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-8">
            <span className="text-[14px] font-medium">{t("fields.autonomousCommunity")}</span>
            <select
              value={values.autonomous_community}
              onChange={(e) => setValues((p) => ({ ...p, autonomous_community: e.target.value }))}
              disabled={isPending}
              className="h-8 rounded-lg border border-border bg-background px-2 text-[14px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 min-w-[220px]"
            >
              <option value="">{t("noRegion")}</option>
              {COMMUNITIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>
          {values.autonomous_community && (
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-[13px] text-muted-foreground">{t("holidaysHint")}</p>
            </div>
          )}
        </div>
      </div>

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
