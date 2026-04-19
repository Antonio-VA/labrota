"use client"

import { useTranslations } from "next-intl"
import { ChevronUp, ChevronDown } from "lucide-react"
import { Input } from "@/components/ui/input"
import { FieldRow, SectionHeader } from "./shared"
import type { FormValues, SetValues } from "./shared"

export function RatioSection({
  values,
  setValues,
  disabled,
}: {
  values: FormValues
  setValues: SetValues
  disabled: boolean
}) {
  const t = useTranslations("lab")
  return (
    <div className="rounded-lg border border-border bg-background px-5">
      <SectionHeader title={t("sections.ratioCobertura")} />
      <p className="text-[13px] text-muted-foreground mb-3">{t("fields.ratioDescription")}</p>
      <div className="flex flex-col gap-0">
        <FieldRow label={t("fields.ratioOptimal")} hint={t("fields.ratioOptimalHint")}>
          <StepperInput
            value={values.ratio_optimal}
            onChange={(v) => setValues((p) => ({ ...p, ratio_optimal: v }))}
            disabled={disabled}
          />
        </FieldRow>
        <FieldRow label={t("fields.ratioMinimum")} hint={t("fields.ratioMinimumHint")}>
          <StepperInput
            value={values.ratio_minimum}
            onChange={(v) => setValues((p) => ({ ...p, ratio_minimum: v }))}
            disabled={disabled}
          />
        </FieldRow>
      </div>
    </div>
  )
}

function StepperInput({
  value, onChange, disabled,
}: {
  value: number
  onChange: (v: number) => void
  disabled: boolean
}) {
  const MIN = 0.1
  const MAX = 5
  const step = (delta: number) =>
    onChange(Math.round((value + delta) * 10) / 10)
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={disabled || value <= MIN}
        onClick={() => step(-0.1)}
        className="size-7 flex items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-30"
      >
        <ChevronDown className="size-3.5" />
      </button>
      <Input
        type="number" min={MIN} max={MAX} step={0.1}
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!isNaN(v) && v > 0) onChange(v)
        }}
        disabled={disabled}
        className="w-16 text-center"
      />
      <button
        type="button"
        disabled={disabled || value >= MAX}
        onClick={() => step(0.1)}
        className="size-7 flex items-center justify-center rounded border border-border hover:bg-accent disabled:opacity-30"
      >
        <ChevronUp className="size-3.5" />
      </button>
    </div>
  )
}
