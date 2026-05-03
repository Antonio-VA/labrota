"use client"

import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import type { StaffWithSkills, Department } from "@/lib/types/database"
import type { StaffFormState } from "@/hooks/use-staff-form-state"
import { Section, Field, Select } from "./form-primitives"
import { StaffColorPicker } from "./color-picker"
import { EndDateField, OnboardingPeriodField } from "./date-fields"

export function TabDatos({
  form, staff, isPending, hasViewerAccount, deptsProp,
}: {
  form: StaffFormState
  staff?: StaffWithSkills
  isPending: boolean
  hasViewerAccount: boolean
  deptsProp?: Department[]
}) {
  const t = useTranslations("staff")
  const { role, setRole, contractType, setContractType, selectedColor, setSelectedColor } = form

  return (
    <>
      <Section label={t("sections.personalInfo")}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("fields.firstName")} required>
            <Input name="first_name" defaultValue={staff?.first_name} disabled={isPending} required className="rounded-[8px]" />
          </Field>
          <Field label={t("fields.lastName")}>
            <Input name="last_name" defaultValue={staff?.last_name} disabled={isPending} className="rounded-[8px]" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("fields.email")}>
            <Input name="email" type="email" defaultValue={staff?.email ?? ""} disabled={isPending} className="rounded-[8px]" />
          </Field>
          <Field label="Color">
            <StaffColorPicker value={selectedColor} onChange={setSelectedColor} disabled={isPending} />
            <input type="hidden" name="color" value={selectedColor} />
          </Field>
        </div>
        {!hasViewerAccount && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" name="invite_viewer" value="on" className="mt-0.5 size-4 rounded border-border accent-primary" />
            <span className="text-[12px] text-muted-foreground leading-tight">
              {t("inviteViewerLabel")}
            </span>
          </label>
        )}
        {hasViewerAccount && (
          <p className="text-[12px] text-emerald-600 dark:text-emerald-400">
            ✓ {t("viewerLinked")}
          </p>
        )}
      </Section>

      <Section label={t("sections.roleAndStatus")}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("fields.role")} required>
            <Select name="role" defaultValue={role} disabled={isPending} onChange={setRole}>
              {deptsProp && deptsProp.length > 0 ? (
                deptsProp.map((d) => (
                  <option key={d.code} value={d.code}>{d.name}</option>
                ))
              ) : (
                <>
                  <option value="lab">{t("roles.lab")}</option>
                  <option value="andrology">{t("roles.andrology")}</option>
                  <option value="admin">{t("roles.admin")}</option>
                </>
              )}
            </Select>
          </Field>
          <Field label={t("fields.onboardingStatus")} required>
            <Select name="onboarding_status" defaultValue={staff?.onboarding_status ?? "active"} disabled={isPending}>
              <option value="active">{t("onboardingStatus.active")}</option>
              <option value="inactive">{t("onboardingStatus.inactive")}</option>
            </Select>
          </Field>
          <Field label={t("fields.contractType")} required>
            <Select name="contract_type" defaultValue={contractType} disabled={isPending} onChange={setContractType}>
              <option value="full_time">{t("contractType.full_time")}</option>
              <option value="part_time">{t("contractType.part_time")}</option>
              <option value="intern">{t("contractType.intern")}</option>
            </Select>
            {(contractType === "part_time" || contractType === "intern") && (
              <p className="text-[11px] text-muted-foreground/70 mt-1">{t(`contractTypeHint.${contractType}`)}</p>
            )}
          </Field>
          <Field label={t("fields.startDate")} required>
            <Input name="start_date" type="date" defaultValue={staff?.start_date} disabled={isPending} required className="rounded-[8px]" />
          </Field>
        </div>
        <OnboardingPeriodField
          initialValue={staff?.onboarding_end_date ?? null}
          disabled={isPending}
        />
        <EndDateField initialValue={staff?.end_date ?? null} disabled={isPending} label={t("fields.endDate")} />
      </Section>
    </>
  )
}
