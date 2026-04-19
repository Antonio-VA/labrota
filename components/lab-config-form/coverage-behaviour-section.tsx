"use client"

import { useTranslations } from "next-intl"
import type { FormValues, SetValues } from "./shared"

export function CoverageBehaviourSection({
  values,
  setValues,
  disabled,
  hasPartTime,
  hasIntern,
}: {
  values: FormValues
  setValues: SetValues
  disabled: boolean
  hasPartTime: boolean
  hasIntern: boolean
}) {
  const t = useTranslations("lab")
  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
      <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
        {t("sections.coverageBehaviour")}
      </p>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={values.public_holiday_reduce_budget}
          onChange={(e) => setValues((p) => ({ ...p, public_holiday_reduce_budget: e.target.checked }))}
          disabled={disabled}
          className="mt-0.5 size-4 accent-primary"
        />
        <div>
          <span className="text-[14px] font-medium">{t("holidayReduceShiftsLabel")}</span>
          <p className="text-[12px] text-muted-foreground mt-0.5">{t("holidayReduceShiftsHint")}</p>
        </div>
      </label>

      {hasPartTime && (
        <WeightRow
          label={t("partTimeWeightLabel")}
          hint={t("partTimeWeightHint")}
          unit={t("coverageWeightFraction")}
          value={values.part_time_weight}
          onChange={(v) => setValues((p) => ({ ...p, part_time_weight: v }))}
          disabled={disabled}
        />
      )}

      {hasIntern && (
        <WeightRow
          label={t("internWeightLabel")}
          hint={t("internWeightHint")}
          unit={t("coverageWeightFraction")}
          value={values.intern_weight}
          onChange={(v) => setValues((p) => ({ ...p, intern_weight: v }))}
          disabled={disabled}
        />
      )}
    </div>
  )
}

function WeightRow({
  label, hint, unit, value, onChange, disabled,
}: {
  label: string
  hint: string
  unit: string
  value: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <>
      <div className="flex items-center gap-3">
        <label className="text-[14px] font-medium w-56 shrink-0">{label}</label>
        <input
          type="number" min={0.1} max={1} step={0.1}
          value={value}
          onChange={(e) => {
            const v = parseFloat(e.target.value)
            if (!isNaN(v) && v >= 0.1 && v <= 1) onChange(Math.round(v * 10) / 10)
          }}
          disabled={disabled}
          className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-[13px] text-center outline-none focus-visible:border-ring"
        />
        <span className="text-[12px] text-muted-foreground">{unit}</span>
      </div>
      <p className="text-[11px] text-muted-foreground/70 -mt-2">{hint}</p>
    </>
  )
}
