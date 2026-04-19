"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { FormValues, SetValues } from "./shared"
import { SectionHeader } from "./shared"

export function HolidaysSection({
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
    { value: "weekday",  label: t("holidayModeWeekday"),  hint: t("holidayModeWeekdayHint") },
    { value: "saturday", label: t("holidayModeSaturday"), hint: t("holidayModeSaturdayHint") },
    { value: "sunday",   label: t("holidayModeSunday"),   hint: t("holidayModeSundayHint") },
  ] as const

  return (
    <div className="rounded-lg border border-border bg-background px-5">
      <SectionHeader title={t("holidayModeTitle")} />
      <p className="text-[13px] text-muted-foreground mb-3">{t("holidayModeDescription")}</p>
      <div className="flex flex-col gap-1 pb-4">
        {options.map((opt) => (
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
    </div>
  )
}
