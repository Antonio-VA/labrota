"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { FieldRow, SectionHeader } from "./shared"
import type { FormValues, SetValues } from "./shared"

export function BiopsyParamsSection({
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
              disabled={disabled}
              className="w-16 text-center"
            />
            <span className="text-[13px] text-muted-foreground">%</span>
          </div>
        </FieldRow>
        <FieldRow label={t("fields.d5d6Distribution")} hint={t("fields.d5d6DistributionHint")}>
          <div className="flex items-center gap-2">
            <DayPctInput
              label="D5"
              value={values.biopsy_day5_pct}
              onChange={(v) => setValues((p) => ({ ...p, biopsy_day5_pct: v / 100, biopsy_day6_pct: (100 - v) / 100 }))}
              disabled={disabled}
            />
            <span className="text-muted-foreground">/</span>
            <DayPctInput
              label="D6"
              value={values.biopsy_day6_pct}
              onChange={(v) => setValues((p) => ({ ...p, biopsy_day6_pct: v / 100, biopsy_day5_pct: (100 - v) / 100 }))}
              disabled={disabled}
            />
            <span className="text-[11px] text-muted-foreground">%</span>
          </div>
        </FieldRow>
      </div>
    </div>
  )
}

function DayPctInput({
  label, value, onChange, disabled,
}: {
  label: string
  value: number
  onChange: (pct: number) => void
  disabled: boolean
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <Input
        type="number" min={0} max={100} step={5}
        value={Math.round(value * 100)}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10)
          if (!isNaN(v) && v >= 0 && v <= 100) onChange(v)
        }}
        disabled={disabled}
        className="w-14 text-center"
      />
    </div>
  )
}
