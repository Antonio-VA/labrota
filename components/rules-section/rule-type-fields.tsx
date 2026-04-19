"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import type { Staff, ShiftTypeDefinition } from "@/lib/types/database"
import type { RuleFormApi } from "@/hooks/use-rule-form"
import { DayPicker } from "./day-picker"
import { Field, INPUT_CLASS, TecnicaSelect, TecnicaCheckboxList, type TecnicaOption } from "./rule-sheet-shared"

const DEPTS = ["lab", "andrology", "admin"] as const

export function RuleTypeFields({
  form, set, toggleInList, staff, tecnicas, shiftTypes,
}: {
  form: RuleFormApi["form"]
  set: RuleFormApi["set"]
  toggleInList: RuleFormApi["toggleInList"]
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  tecnicas: TecnicaOption[]
  shiftTypes: Pick<ShiftTypeDefinition, "code" | "name_es" | "name_en">[]
}) {
  const t = useTranslations("lab.rules")

  switch (form.type) {
    case "no_coincidir":
      return (
        <>
          <Field
            label={t("params.coincideScope")}
            hint={form.coincideScope === "same_day" ? t("params.coincideScopeDayHint") : t("params.coincideScopeShiftHint")}
          >
            <select
              className={INPUT_CLASS}
              value={form.coincideScope}
              onChange={(e) => set("coincideScope", e.target.value as "same_day" | "same_shift")}
            >
              <option value="same_day">{t("params.coincideScopeDay")}</option>
              <option value="same_shift">{t("params.coincideScopeShift")}</option>
            </select>
          </Field>
          {form.coincideScope === "same_shift" && (
            <Field label={t("params.coincideDays")} optional hint={t("params.coincideDaysHint")}>
              <DayPicker selected={form.coincideDays} onChange={(days) => set("coincideDays", days)} />
            </Field>
          )}
        </>
      )

    case "max_dias_consecutivos":
      return (
        <Field label={t("params.maxDays")}>
          <Input type="number" min={1} max={14} value={form.maxDays} onChange={(e) => set("maxDays", e.target.value)} />
        </Field>
      )

    case "distribucion_fines_semana":
      return (
        <Field label={t("params.maxPerMonth")}>
          <Input type="number" min={0} max={8} value={form.maxPerMonth} onChange={(e) => set("maxPerMonth", e.target.value)} />
        </Field>
      )

    case "supervisor_requerido":
      return (
        <>
          <Field label={t("params.supervisor")} hint={t("params.supervisorHint")}>
            <select className={INPUT_CLASS} value={form.supervisor_id} onChange={(e) => set("supervisor_id", e.target.value)}>
              <option value="">{t("params.selectSupervisor")}</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
          </Field>
          <Field label={t("params.trainingTechnique")} optional hint={t("params.trainingTechniqueHint")}>
            <TecnicaSelect
              tecnicas={tecnicas}
              value={form.tecnica_code}
              onChange={(v) => set("tecnica_code", v)}
              placeholder={t("params.noTechnique")}
            />
          </Field>
          <Field label={t("params.selectDays")} optional>
            <DayPicker selected={form.supervisorDays} onChange={(days) => set("supervisorDays", days)} />
          </Field>
        </>
      )

    case "descanso_fin_de_semana":
      return (
        <>
          <Field
            label={t("params.recovery")}
            hint={t(`params.recovery${form.recovery === "following" ? "Following" : "Previous"}Hint`)}
          >
            <select
              className={INPUT_CLASS}
              value={form.recovery}
              onChange={(e) => set("recovery", e.target.value as "following" | "previous")}
            >
              <option value="following">{t("params.recoveryFollowing")}</option>
              <option value="previous">{t("params.recoveryPrevious")}</option>
            </select>
          </Field>
          <Field label={t("params.restDays")} hint={t("params.restDaysHint")}>
            <Input type="number" min={0} max={5} value={form.restDays} onChange={(e) => set("restDays", e.target.value)} />
          </Field>
        </>
      )

    case "restriccion_dia_tecnica":
      return (
        <>
          <Field label={t("params.technique")}>
            <TecnicaSelect
              tecnicas={tecnicas}
              value={form.tecnica_code}
              onChange={(v) => set("tecnica_code", v)}
              placeholder={t("params.selectTechnique")}
            />
          </Field>
          <Field label={t("params.dayMode")}>
            <select
              className={INPUT_CLASS}
              value={form.dayMode}
              onChange={(e) => set("dayMode", e.target.value as "never" | "only")}
            >
              <option value="never">{t("params.dayModeNever")}</option>
              <option value="only">{t("params.dayModeOnly")}</option>
            </select>
          </Field>
          <Field label={t("params.selectDays")}>
            <DayPicker
              selected={form.restrictedDays}
              onChange={(days) => set("restrictedDays", days)}
              variant="soft"
            />
          </Field>
        </>
      )

    case "asignacion_fija":
      return (
        <>
          <Field label={t("params.fixedShift")} optional>
            <select className={INPUT_CLASS} value={form.fixedShift} onChange={(e) => set("fixedShift", e.target.value)}>
              <option value="">{t("params.anyShift")}</option>
              {shiftTypes.map((st) => (
                <option key={st.code} value={st.code}>{st.name_es} ({st.code})</option>
              ))}
            </select>
          </Field>
          <Field label={t("params.fixedDays")} optional hint={t("params.fixedDaysHint")}>
            <DayPicker selected={form.fixedDays} onChange={(days) => set("fixedDays", days)} />
          </Field>
        </>
      )

    case "tecnicas_juntas":
      return (
        <>
          <Field label={t("params.linkedTecnicas")} hint={t("params.linkedTecnicasHint")}>
            <TecnicaCheckboxList
              tecnicas={tecnicas}
              selected={form.linkedTecnicas}
              onToggle={(code) => toggleInList("linkedTecnicas", code)}
            />
          </Field>
          <Field label={t("params.linkedDays")} optional hint={t("params.linkedDaysHint")}>
            <DayPicker selected={form.linkedDays} onChange={(days) => set("linkedDays", days)} />
          </Field>
        </>
      )

    case "tarea_multidepartamento":
      return (
        <>
          <Field label={t("params.technique")}>
            <TecnicaSelect
              tecnicas={tecnicas}
              value={form.multiDeptTecnica}
              onChange={(v) => set("multiDeptTecnica", v)}
              placeholder={t("params.selectTechnique")}
            />
          </Field>
          <Field label={t("params.requiredDepartments")} hint={t("params.requiredDepartmentsHint")}>
            <div className="flex flex-col gap-1 border border-border rounded-[8px] p-2">
              {DEPTS.map((dept) => (
                <label key={dept} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px]">
                  <input
                    type="checkbox"
                    checked={form.multiDeptDepartments.includes(dept)}
                    onChange={() => toggleInList("multiDeptDepartments", dept)}
                  />
                  {dept.charAt(0).toUpperCase() + dept.slice(1)}
                </label>
              ))}
            </div>
          </Field>
          <Field label={t("params.linkedDays")} optional hint={t("params.linkedDaysHint")}>
            <DayPicker selected={form.multiDeptDays} onChange={(days) => set("multiDeptDays", days)} />
          </Field>
        </>
      )

    case "equipo_completo":
      return (
        <>
          <Field label={t("params.wholeTeamTecnicas")} hint={t("params.wholeTeamTecnicasHint")}>
            <TecnicaCheckboxList
              tecnicas={tecnicas}
              selected={form.wholeTeamTecnicas}
              onToggle={(code) => toggleInList("wholeTeamTecnicas", code)}
            />
          </Field>
          <Field label={t("params.linkedDays")} optional hint={t("params.linkedDaysHint")}>
            <DayPicker selected={form.wholeTeamDays} onChange={(days) => set("wholeTeamDays", days)} />
          </Field>
        </>
      )

    default:
      return null
  }
}
