"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { PunctionsByDay } from "@/lib/types/database"
import { DAY_KEYS, SectionHeader, isWeekendKey } from "./shared"
import type { FormValues, SetValues } from "./shared"

export function ProceduresSection({
  values,
  setValues,
  disabled,
}: {
  values: FormValues
  setValues: SetValues
  disabled: boolean
}) {
  const t = useTranslations("lab")

  function setPunction(day: keyof PunctionsByDay, raw: string) {
    const v = parseInt(raw, 10)
    if (!isNaN(v) && v >= 0) {
      setValues((p) => ({ ...p, punctions_by_day: { ...p.punctions_by_day, [day]: v } }))
    }
  }

  const rate = values.biopsy_conversion_rate
  const d5Pct = values.biopsy_day5_pct
  const d6Pct = values.biopsy_day6_pct

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <SectionHeader title={t("fields.proceduresTitle")} />
        <p className="text-[13px] text-muted-foreground">{t("fields.proceduresDescription")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[100px]"></th>
              {DAY_KEYS.map((day) => (
                <th key={day} className={cn("px-1 py-2 text-center font-medium text-muted-foreground w-[52px]", isWeekendKey(day) && "bg-muted/60")}>
                  {t(`days.${day}`).slice(0, 3)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="px-3 py-1.5 text-[13px] font-medium">{t("fields.pickUps")}</td>
              {DAY_KEYS.map((day) => (
                <td key={day} className={cn("px-1 py-1.5 text-center", isWeekendKey(day) && "bg-muted/30")}>
                  <input
                    type="number" min={0} max={50}
                    value={values.punctions_by_day[day]}
                    onChange={(e) => setPunction(day, e.target.value)}
                    disabled={disabled}
                    className="w-12 h-7 rounded border border-input bg-transparent text-center text-[13px] outline-none focus:border-ring focus:ring-1 focus:ring-ring/50 disabled:opacity-50 mx-auto block"
                  />
                </td>
              ))}
            </tr>
            <tr className="bg-muted/10">
              <td className="px-3 py-1.5 text-[13px] font-medium text-muted-foreground">
                {t("fields.biopsies")}
                <span className="text-[10px] text-muted-foreground/60 ml-1">D5/D6</span>
              </td>
              {DAY_KEYS.map((day, dayIdx) => {
                const d5DayIdx = ((dayIdx - 5) % 7 + 7) % 7
                const d6DayIdx = ((dayIdx - 6) % 7 + 7) % 7
                const p5 = values.punctions_by_day[DAY_KEYS[d5DayIdx]] ?? 0
                const p6 = values.punctions_by_day[DAY_KEYS[d6DayIdx]] ?? 0
                const biopsies = Math.round(p5 * rate * d5Pct + p6 * rate * d6Pct)
                return (
                  <td key={day} className={cn("px-1 py-1.5 text-center text-muted-foreground", isWeekendKey(day) && "bg-muted/30")}>
                    <span className="text-[13px]">{biopsies}</span>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="px-5 py-2 text-[11px] text-muted-foreground border-t border-border/50">
        {t("fields.biopsiesFooter")}
      </p>
    </div>
  )
}
