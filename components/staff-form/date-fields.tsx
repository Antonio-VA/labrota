"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Plus, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { toISODate } from "@/lib/format-date"

export function EndDateField({ initialValue, disabled, label }: { initialValue: string | null; disabled: boolean; label: string }) {
  const t = useTranslations("staff")
  const [showDate, setShowDate] = useState(!!initialValue)
  const [value, setValue] = useState(initialValue ?? "")

  if (!showDate) {
    return (
      <>
        <input type="hidden" name="end_date" value="" />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShowDate(true)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          {label}
        </button>
      </>
    )
  }

  return (
    <div className="flex items-end gap-2">
      <div className="flex flex-col gap-1.5 flex-1">
        <span className="text-[14px] font-medium">{label}</span>
        <Input
          name="end_date"
          type="date"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={disabled}
          className="rounded-[8px]"
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { setShowDate(false); setValue("") }}
        className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 shrink-0 mb-0.5"
        title={t("removeEndDate")}
      >
        <X className="size-4" />
      </button>
    </div>
  )
}

function nextSunday(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00")
  const dow = d.getDay()
  if (dow !== 0) d.setDate(d.getDate() + (7 - dow))
  return toISODate(d)
}

export function OnboardingPeriodField({ initialValue, disabled }: { initialValue: string | null; disabled: boolean }) {
  const t = useTranslations("staff")
  const [show, setShow] = useState(!!initialValue)
  const [value, setValue] = useState(initialValue ?? "")

  if (!show) {
    return (
      <>
        <input type="hidden" name="onboarding_end_date" value="" />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setShow(true)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <Plus className="size-3.5" />
          {t("addOnboardingPeriod")}
        </button>
      </>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5 flex-1">
          <span className="text-[14px] font-medium">{t("fields.onboardingPeriod")}</span>
          <Input
            name="onboarding_end_date"
            type="date"
            value={value}
            onChange={(e) => {
              if (e.target.value) setValue(nextSunday(e.target.value))
              else setValue("")
            }}
            disabled={disabled}
            className="rounded-[8px]"
          />
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => { setShow(false); setValue("") }}
          className="flex items-center justify-center size-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 shrink-0 mb-0.5"
          title={t("removeOnboardingPeriod")}
        >
          <X className="size-4" />
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground/70">{t("onboardingEndDateHint")}</p>
    </div>
  )
}
