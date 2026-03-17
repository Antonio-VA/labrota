"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import type { LabConfig } from "@/lib/types/database"
import { CheckCircle2, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

// ── Simple toggle switch ───────────────────────────────────────────────────────
function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
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
      <span
        className={cn(
          "pointer-events-none inline-block size-4 rounded-full bg-white shadow ring-0 transition-transform",
          checked ? "translate-x-4" : "translate-x-0"
        )}
      />
    </button>
  )
}

// ── Field row ──────────────────────────────────────────────────────────────────
function FieldRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
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

// ── Main form ─────────────────────────────────────────────────────────────────
export function LabConfigForm({ config }: { config: LabConfig }) {
  const t = useTranslations("lab")
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const [values, setValues] = useState({
    min_lab_coverage:       config.min_lab_coverage,
    min_andrology_coverage: config.min_andrology_coverage,
    min_weekend_andrology:  config.min_weekend_andrology,
    punctions_average:      config.punctions_average,
    staffing_ratio:         config.staffing_ratio,
    admin_on_weekends:      config.admin_on_weekends,
  })

  function setInt(field: keyof typeof values, raw: string) {
    const v = parseInt(raw, 10)
    if (!isNaN(v) && v >= 0) setValues((p) => ({ ...p, [field]: v }))
  }

  function setFloat(field: keyof typeof values, raw: string) {
    const v = parseFloat(raw)
    if (!isNaN(v) && v > 0) setValues((p) => ({ ...p, [field]: v }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("idle")
    startTransition(async () => {
      const result = await updateLabConfig(values)
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

      {/* Coverage */}
      <div className="rounded-lg border border-border bg-background px-5">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">
          {t("sections.coverage")}
        </p>
        <FieldRow
          label={t("fields.minLabCoverage")}
          hint={t("sections.weekdays")}
        >
          <Input
            type="number"
            min={1}
            max={20}
            value={values.min_lab_coverage}
            onChange={(e) => setInt("min_lab_coverage", e.target.value)}
            disabled={isPending}
            className="w-20 text-center"
          />
        </FieldRow>
        <FieldRow
          label={t("fields.minAndrologyCoverage")}
          hint={t("sections.weekdays")}
        >
          <Input
            type="number"
            min={0}
            max={10}
            value={values.min_andrology_coverage}
            onChange={(e) => setInt("min_andrology_coverage", e.target.value)}
            disabled={isPending}
            className="w-20 text-center"
          />
        </FieldRow>
        <FieldRow
          label={t("fields.minWeekendAndrology")}
          hint={t("sections.weekends")}
        >
          <Input
            type="number"
            min={0}
            max={10}
            value={values.min_weekend_andrology}
            onChange={(e) => setInt("min_weekend_andrology", e.target.value)}
            disabled={isPending}
            className="w-20 text-center"
          />
        </FieldRow>
      </div>

      {/* Planning */}
      <div className="rounded-lg border border-border bg-background px-5">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">
          {t("sections.staffing")}
        </p>
        <FieldRow label={t("fields.punctionesAverage")}>
          <Input
            type="number"
            min={0}
            max={200}
            value={values.punctions_average}
            onChange={(e) => setInt("punctions_average", e.target.value)}
            disabled={isPending}
            className="w-20 text-center"
          />
        </FieldRow>
        <FieldRow label={t("fields.staffingRatio")}>
          <Input
            type="number"
            min={0.1}
            max={10}
            step={0.1}
            value={values.staffing_ratio}
            onChange={(e) => setFloat("staffing_ratio", e.target.value)}
            disabled={isPending}
            className="w-20 text-center"
          />
        </FieldRow>
      </div>

      {/* Shift settings */}
      <div className="rounded-lg border border-border bg-background px-5">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide pt-4 pb-1">
          {t("sections.shifts")}
        </p>
        <FieldRow label={t("fields.adminOnWeekends")}>
          <Toggle
            checked={values.admin_on_weekends}
            onChange={(v) => setValues((p) => ({ ...p, admin_on_weekends: v }))}
            disabled={isPending}
          />
        </FieldRow>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Saving…" : "Save changes"}
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
