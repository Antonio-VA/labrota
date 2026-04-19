"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { StaffWithSkills, ShiftTypeDefinition } from "@/lib/types/database"
import type { StaffFormState } from "@/hooks/use-staff-form-state"
import { ALL_DAYS } from "./constants"
import { Section } from "./form-primitives"

export function TabAvailability({
  form, staff, isPending, defaultDaysPerWeek, shiftTypes, guardiaMode,
}: {
  form: StaffFormState
  staff?: StaffWithSkills
  isPending: boolean
  defaultDaysPerWeek: number
  shiftTypes: ShiftTypeDefinition[]
  guardiaMode: boolean
}) {
  const t = useTranslations("staff")
  const {
    selectedDays, toggleDay,
    preferredDays, avoidDays, cycleDayPreference,
    preferredShifts, avoidShifts, cycleShiftPreference,
  } = form

  return (
    <>
      <Section label={t("fields.daysPerWeek")}>
        <Input
          name="days_per_week"
          type="number"
          min={1}
          max={7}
          defaultValue={staff?.days_per_week ?? defaultDaysPerWeek}
          disabled={isPending}
          className="max-w-28 rounded-[8px]"
          required
        />
      </Section>

      <Section label={t("daysAvailable")}>
        <p className="text-[12px] text-muted-foreground mb-2">
          {t("daysAvailableHint")}
        </p>
        <div className="flex gap-2 flex-wrap">
          {ALL_DAYS.map((day) => {
            const active = selectedDays.includes(day)
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                disabled={isPending}
                className={cn(
                  "h-8 px-3 rounded-[8px] border text-[13px] font-medium transition-colors disabled:opacity-50",
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {t(`workingDays.${day}`)}
              </button>
            )
          })}
        </div>
        {ALL_DAYS.map((day) =>
          selectedDays.includes(day) ? (
            <input key={day} type="hidden" name={`day_${day}`} value="on" />
          ) : null
        )}
      </Section>

      {selectedDays.length > 0 && (
        <Section label={t("daysPreferred")}>
          <p className="text-[12px] text-muted-foreground mb-2">
            {t("daysPreferredHint3")}
          </p>
          <div className="flex gap-2 flex-wrap">
            {ALL_DAYS.map((day) => {
              const available = selectedDays.includes(day)
              const isPref = preferredDays.includes(day)
              const isAvoid = avoidDays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => cycleDayPreference(day)}
                  disabled={isPending || !available}
                  className={cn(
                    "h-8 px-3 rounded-[8px] border text-[13px] font-medium transition-colors disabled:opacity-50",
                    !available
                      ? "border-border bg-slate-50 text-slate-300 cursor-not-allowed"
                      : isPref
                      ? "bg-[var(--pref-bg)] text-white border-[var(--pref-border)]"
                      : isAvoid
                      ? "bg-[var(--avoid-bg)] text-[var(--avoid-text)] border-[var(--avoid-border)]"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {t(`workingDays.${day}`)}
                </button>
              )
            })}
          </div>
          <p className="text-[12px] text-muted-foreground mt-1.5">
            {preferredDays.length > 0 || avoidDays.length > 0 ? (
              <>
                {preferredDays.length > 0 && <>{t("prefersLabel")} {preferredDays.map((d) => t(`workingDays.${d}`)).join(", ")}</>}
                {preferredDays.length > 0 && avoidDays.length > 0 && " — "}
                {avoidDays.length > 0 && <>{t("avoidsLabel")} {avoidDays.map((d) => t(`workingDays.${d}`)).join(", ")}</>}
              </>
            ) : t("noPreference")}
          </p>
          {ALL_DAYS.map((day) =>
            preferredDays.includes(day) ? (
              <input key={`pref_${day}`} type="hidden" name={`pref_${day}`} value="on" />
            ) : null
          )}
          {ALL_DAYS.map((day) =>
            avoidDays.includes(day) ? (
              <input key={`avoid_${day}`} type="hidden" name={`avoid_${day}`} value="on" />
            ) : null
          )}
        </Section>
      )}

      <Section label={t("fields.preferredShift")}>
        <p className="text-[12px] text-muted-foreground mb-2">
          {t("daysPreferredHint3")}
        </p>
        <div className="flex gap-2 flex-wrap">
          {shiftTypes.filter((st) => st.active !== false).map((st) => {
            const isPref = preferredShifts.includes(st.code)
            const isAvoid = avoidShifts.includes(st.code)
            return (
              <button
                key={st.code}
                type="button"
                onClick={() => cycleShiftPreference(st.code)}
                disabled={isPending}
                title={`${st.name_es} (${st.start_time}–${st.end_time})`}
                className={cn(
                  "h-8 min-w-[48px] px-3 rounded-[8px] border text-[13px] font-medium transition-colors disabled:opacity-50",
                  isPref
                    ? "bg-[var(--pref-bg)] text-white border-[var(--pref-border)]"
                    : isAvoid
                    ? "bg-[var(--avoid-bg)] text-[var(--avoid-text)] border-[var(--avoid-border)]"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {st.code}
              </button>
            )
          })}
        </div>
        <p className="text-[12px] text-muted-foreground mt-1.5">
          {preferredShifts.length > 0 || avoidShifts.length > 0 ? (
            <>
              {preferredShifts.length > 0 && <>{t("prefersLabel")} {preferredShifts.join(", ")}</>}
              {preferredShifts.length > 0 && avoidShifts.length > 0 && " — "}
              {avoidShifts.length > 0 && <>{t("avoidsLabel")} {avoidShifts.join(", ")}</>}
            </>
          ) : t("fields.preferredShiftNone")}
        </p>
        <input type="hidden" name="preferred_shifts" value={preferredShifts.join(",")} />
        <input type="hidden" name="avoid_shifts" value={avoidShifts.join(",")} />
      </Section>

      {guardiaMode && (
        <Section label={t("prefersGuardia")}>
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              name="prefers_guardia"
              value="on"
              defaultChecked={staff?.prefers_guardia === true}
              disabled={isPending}
              className="mt-0.5 size-4 rounded border-border accent-primary"
            />
            <span className="text-[13px] text-muted-foreground leading-tight">
              {t("prefersGuardiaHint")}
            </span>
          </label>
        </Section>
      )}
    </>
  )
}
