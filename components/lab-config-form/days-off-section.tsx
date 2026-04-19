"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { FormValues, SetValues } from "./shared"
import { SectionHeader } from "./shared"

export function DaysOffSection({
  values,
  setValues,
  disabled,
}: {
  values: FormValues
  setValues: SetValues
  disabled: boolean
}) {
  const t = useTranslations("lab")
  const options = [
    { value: "always_weekend", label: t("daysOffAlwaysWeekend"), hint: t("daysOffAlwaysWeekendHint") },
    { value: "prefer_weekend", label: t("daysOffPreferWeekend"), hint: t("daysOffPreferWeekendHint") },
    { value: "any_day",        label: t("daysOffAnyDay"),        hint: t("daysOffAnyDayHint") },
    { value: "guardia",        label: t("daysOffGuardia"),       hint: t("daysOffGuardiaHint") },
  ] as const

  return (
    <div className="rounded-lg border border-border bg-background px-5">
      <SectionHeader title={t("daysOffTitle")} />
      <p className="text-[13px] text-muted-foreground mb-3">{t("daysOffDescription")}</p>
      <div className="flex flex-col gap-1 pb-4">
        {options.map((opt) => (
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
              disabled={disabled}
              className="mt-0.5 accent-primary"
            />
            <div>
              <span className="text-[14px] font-medium">{opt.label}</span>
              <p className="text-[12px] text-muted-foreground mt-0.5">{opt.hint}</p>
            </div>
          </label>
        ))}
      </div>

      {values.days_off_preference === "guardia" && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 mb-4 flex flex-col gap-3">
          <p className="text-[12px] font-medium text-primary">{t("guardiaParamsTitle")}</p>
          <GuardiaRow
            label={t("guardiaMinWeeks")}
            unit={t("guardiaMinWeeksUnit")}
            value={values.guardia_min_weeks_between}
            min={1}
            max={8}
            onChange={(v) => setValues((p) => ({ ...p, guardia_min_weeks_between: v }))}
            disabled={disabled}
          />
          <GuardiaRow
            label={t("guardiaMaxMonth")}
            unit={t("guardiaMaxMonthUnit")}
            value={values.guardia_max_per_month}
            min={0}
            max={8}
            onChange={(v) => setValues((p) => ({ ...p, guardia_max_per_month: v }))}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}

function GuardiaRow({
  label, unit, value, min, max, onChange, disabled,
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-3">
      <label className="text-[13px] text-muted-foreground w-48 shrink-0">{label}</label>
      <input
        type="number" min={min} max={max} step={1}
        value={value}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          if (!isNaN(v) && v >= min && v <= max) onChange(v)
        }}
        disabled={disabled}
        className="w-16 h-8 rounded-lg border border-input bg-background px-2 text-[13px] text-center outline-none focus-visible:border-ring"
      />
      <span className="text-[12px] text-muted-foreground">{unit}</span>
    </div>
  )
}
