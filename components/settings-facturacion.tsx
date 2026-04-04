"use client"

import { useTranslations, useLocale } from "next-intl"
import { Lock } from "lucide-react"
import { formatDateWithYear } from "@/lib/format-date"

export function SettingsFacturacion({
  billingStart,
  billingEnd,
  billingFee,
}: {
  billingStart: string | null
  billingEnd: string | null
  billingFee: number | null
}) {
  const t = useTranslations("billing")
  const locale = useLocale()

  const fmt = (d: string | null) => {
    if (!d) return "—"
    try { return formatDateWithYear(d + "T12:00:00", locale as "es" | "en") } catch { return d }
  }

  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-muted-foreground">{t("start")}</span>
          <span className="text-[14px] font-medium">{fmt(billingStart)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-muted-foreground">{t("renewal")}</span>
          <span className="text-[14px] font-medium">{fmt(billingEnd)}</span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium text-muted-foreground">{t("annualFee")}</span>
          <span className="text-[14px] font-medium">{billingFee && billingFee > 0 ? `${billingFee.toLocaleString(locale === "es" ? "es-ES" : "en-US")} €` : <span className="text-emerald-600">{t("freeTrial")}</span>}</span>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground flex items-center gap-1">
        <Lock className="size-3" />
        {t("managedByLabRota")}
      </p>
    </div>
  )
}
