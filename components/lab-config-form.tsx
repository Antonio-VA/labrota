"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import type { LabConfig, PunctionsByDay } from "@/lib/types/database"
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
export function LabConfigForm({ config }: { config: LabConfig }) {
  const t = useTranslations("lab")
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const DEFAULT_PUNCTIONS: PunctionsByDay = { mon: 6, tue: 6, wed: 6, thu: 6, fri: 6, sat: 2, sun: 0 }

  const [values, setValues] = useState({
    // Coverage
    min_lab_coverage:         config.min_lab_coverage,
    min_andrology_coverage:   config.min_andrology_coverage,
    min_weekend_andrology:    config.min_weekend_andrology,
    min_weekend_lab_coverage: config.min_weekend_lab_coverage ?? 1,
    // Punctions
    punctions_by_day: config.punctions_by_day ?? DEFAULT_PUNCTIONS,
    // Staffing
    staffing_ratio:    config.staffing_ratio,
    admin_on_weekends: config.admin_on_weekends,
    // Holidays
    autonomous_community: config.autonomous_community ?? "",
    // Shift names
    shift_name_am_es:   config.shift_name_am_es   ?? "Mañana",
    shift_name_pm_es:   config.shift_name_pm_es   ?? "Tarde",
    shift_name_full_es: config.shift_name_full_es ?? "Completo",
    shift_name_am_en:   config.shift_name_am_en   ?? "Morning",
    shift_name_pm_en:   config.shift_name_pm_en   ?? "Afternoon",
    shift_name_full_en: config.shift_name_full_en ?? "Full Day",
    // Shift times
    shift_am_start:   config.shift_am_start   ?? "07:30",
    shift_am_end:     config.shift_am_end     ?? "14:30",
    shift_pm_start:   config.shift_pm_start   ?? "14:30",
    shift_pm_end:     config.shift_pm_end     ?? "21:30",
    shift_full_start: config.shift_full_start ?? "07:30",
    shift_full_end:   config.shift_full_end   ?? "21:30",
  })

  function setInt(field: keyof typeof values, raw: string) {
    const v = parseInt(raw, 10)
    if (!isNaN(v) && v >= 0) setValues((p) => ({ ...p, [field]: v }))
  }

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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("idle")
    startTransition(async () => {
      const result = await updateLabConfig({
        min_lab_coverage:         values.min_lab_coverage,
        min_andrology_coverage:   values.min_andrology_coverage,
        min_weekend_andrology:    values.min_weekend_andrology,
        min_weekend_lab_coverage: values.min_weekend_lab_coverage,
        punctions_by_day:         values.punctions_by_day,
        staffing_ratio:           values.staffing_ratio,
        admin_on_weekends:        values.admin_on_weekends,
        autonomous_community:     values.autonomous_community || null,
        shift_name_am_es:         values.shift_name_am_es,
        shift_name_pm_es:         values.shift_name_pm_es,
        shift_name_full_es:       values.shift_name_full_es,
        shift_name_am_en:         values.shift_name_am_en,
        shift_name_pm_en:         values.shift_name_pm_en,
        shift_name_full_en:       values.shift_name_full_en,
        shift_am_start:           values.shift_am_start,
        shift_am_end:             values.shift_am_end,
        shift_pm_start:           values.shift_pm_start,
        shift_pm_end:             values.shift_pm_end,
        shift_full_start:         values.shift_full_start,
        shift_full_end:           values.shift_full_end,
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

  const shiftRows = [
    { key: "am",   esField: "shift_name_am_es"   as const, enField: "shift_name_am_en"   as const, startField: "shift_am_start"   as const, endField: "shift_am_end"   as const },
    { key: "pm",   esField: "shift_name_pm_es"   as const, enField: "shift_name_pm_en"   as const, startField: "shift_pm_start"   as const, endField: "shift_pm_end"   as const },
    { key: "full", esField: "shift_name_full_es" as const, enField: "shift_name_full_en" as const, startField: "shift_full_start" as const, endField: "shift_full_end" as const },
  ]

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">

      {/* ── COBERTURA MÍNIMA ─────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("sections.coverage")} />
        <FieldRow label={t("fields.minLabCoverage")} hint={t("sections.weekdays")}>
          <Input type="number" min={1} max={20} value={values.min_lab_coverage}
            onChange={(e) => setInt("min_lab_coverage", e.target.value)}
            disabled={isPending} className="w-20 text-center" />
        </FieldRow>
        <FieldRow label={t("fields.minWeekendLabCoverage")} hint={t("sections.weekends")}>
          <Input type="number" min={0} max={20} value={values.min_weekend_lab_coverage}
            onChange={(e) => setInt("min_weekend_lab_coverage", e.target.value)}
            disabled={isPending} className="w-20 text-center" />
        </FieldRow>
        <FieldRow label={t("fields.minAndrologyCoverage")} hint={t("sections.weekdays")}>
          <Input type="number" min={0} max={10} value={values.min_andrology_coverage}
            onChange={(e) => setInt("min_andrology_coverage", e.target.value)}
            disabled={isPending} className="w-20 text-center" />
        </FieldRow>
        <FieldRow label={t("fields.minWeekendAndrology")} hint={t("sections.weekends")}>
          <Input type="number" min={0} max={10} value={values.min_weekend_andrology}
            onChange={(e) => setInt("min_weekend_andrology", e.target.value)}
            disabled={isPending} className="w-20 text-center" />
        </FieldRow>
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

      {/* ── TURNOS ───────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-background px-5">
        <SectionHeader title={t("sections.shifts")} />
        <div className="py-2 pb-3">
          {/* Column headers */}
          <div className="grid grid-cols-[3rem_6rem_6rem_1fr_1fr] gap-2 items-center pb-2 border-b border-border mb-1">
            <span className="text-[13px] font-medium text-muted-foreground">{t("fields.shiftLabel")}</span>
            <span className="text-[13px] text-muted-foreground text-center">{t("fields.shiftStart")}</span>
            <span className="text-[13px] text-muted-foreground text-center">{t("fields.shiftEnd")}</span>
            <span className="text-[13px] text-muted-foreground text-center">{t("fields.shiftLangEs")}</span>
            <span className="text-[13px] text-muted-foreground text-center">{t("fields.shiftLangEn")}</span>
          </div>
          {/* Shift rows */}
          <div className="flex flex-col gap-2 pt-2">
            {shiftRows.map(({ key, esField, enField, startField, endField }) => (
              <div key={key} className="grid grid-cols-[3rem_6rem_6rem_1fr_1fr] gap-2 items-center">
                <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">
                  {key.toUpperCase()}
                </span>
                <Input
                  type="time"
                  value={values[startField]}
                  onChange={(e) => setValues((p) => ({ ...p, [startField]: e.target.value }))}
                  disabled={isPending}
                  className="text-center text-[13px] px-1"
                />
                <Input
                  type="time"
                  value={values[endField]}
                  onChange={(e) => setValues((p) => ({ ...p, [endField]: e.target.value }))}
                  disabled={isPending}
                  className="text-center text-[13px] px-1"
                />
                <Input
                  value={values[esField]}
                  onChange={(e) => setValues((p) => ({ ...p, [esField]: e.target.value }))}
                  disabled={isPending}
                  className="text-center text-[13px]"
                  maxLength={30}
                />
                <Input
                  value={values[enField]}
                  onChange={(e) => setValues((p) => ({ ...p, [enField]: e.target.value }))}
                  disabled={isPending}
                  className="text-center text-[13px]"
                  maxLength={30}
                />
              </div>
            ))}
          </div>
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
