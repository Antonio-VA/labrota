"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { createStaff, updateStaff, deleteStaff } from "@/app/(clinic)/staff/actions"
import { cn } from "@/lib/utils"
import type { StaffWithSkills, StaffRole, OnboardingStatus, SkillName, WorkingDay } from "@/lib/types/database"

const ALL_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const ALL_SKILLS: SkillName[] = [
  "icsi", "iui", "vitrification", "thawing", "biopsy",
  "semen_analysis", "sperm_prep", "witnessing", "other",
]
const SKILL_KEYS: Record<SkillName, string> = {
  icsi: "icsi",
  iui: "iui",
  vitrification: "vitrification",
  thawing: "thawing",
  biopsy: "biopsy",
  semen_analysis: "semenAnalysis",
  sperm_prep: "spermPrep",
  witnessing: "witnessing",
  other: "other",
}

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
      <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      {children}
    </div>
  )
}

// ── Field row ──────────────────────────────────────────────────────────────────
function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[14px] font-medium">
        {label}
        {!required && (
          <span className="ml-1 text-[12px] font-normal text-muted-foreground">(opcional)</span>
        )}
      </label>
      {children}
    </div>
  )
}

// ── Select ─────────────────────────────────────────────────────────────────────
function Select({
  name,
  defaultValue,
  disabled,
  children,
}: {
  name: string
  defaultValue?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      className="h-8 w-full rounded-[8px] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </select>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────
export function StaffForm({
  mode,
  staff,
}: {
  mode: "create" | "edit"
  staff?: StaffWithSkills
}) {
  const t = useTranslations("staff")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")

  const action = mode === "edit" ? updateStaff.bind(null, staff!.id) : createStaff
  const [state, formAction, isPending] = useActionState(action, null)

  const [selectedDays, setSelectedDays] = useState<WorkingDay[]>(
    staff?.working_pattern ?? ["mon", "tue", "wed", "thu", "fri"]
  )
  const [selectedSkills, setSelectedSkills] = useState<SkillName[]>(
    staff?.staff_skills?.map((s) => s.skill) ?? []
  )

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, startDelete] = useTransition()

  function toggleDay(day: WorkingDay) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  function toggleSkill(skill: SkillName) {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    )
  }

  function handleDelete() {
    startDelete(async () => {
      await deleteStaff(staff!.id)
    })
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">

      {/* Personal info */}
      <Section label="Datos personales">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("fields.firstName")} required>
            <Input name="first_name" defaultValue={staff?.first_name} disabled={isPending} required className="rounded-[8px]" />
          </Field>
          <Field label={t("fields.lastName")} required>
            <Input name="last_name" defaultValue={staff?.last_name} disabled={isPending} required className="rounded-[8px]" />
          </Field>
        </div>
        <Field label={t("fields.email")}>
          <Input name="email" type="email" defaultValue={staff?.email ?? ""} disabled={isPending} className="rounded-[8px]" />
        </Field>
      </Section>

      {/* Role & status */}
      <Section label="Rol y estado">
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("fields.role")} required>
            <Select name="role" defaultValue={staff?.role ?? "lab"} disabled={isPending}>
              <option value="lab">{t("roles.lab")}</option>
              <option value="andrology">{t("roles.andrology")}</option>
              <option value="admin">{t("roles.admin")}</option>
            </Select>
          </Field>
          <Field label={t("fields.onboardingStatus")} required>
            <Select name="onboarding_status" defaultValue={staff?.onboarding_status ?? "active"} disabled={isPending}>
              <option value="active">{t("onboardingStatus.active")}</option>
              <option value="onboarding">{t("onboardingStatus.onboarding")}</option>
              <option value="inactive">{t("onboardingStatus.inactive")}</option>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("fields.startDate")} required>
            <Input name="start_date" type="date" defaultValue={staff?.start_date} disabled={isPending} required className="rounded-[8px]" />
          </Field>
          <Field label={t("fields.endDate")}>
            <Input name="end_date" type="date" defaultValue={staff?.end_date ?? ""} disabled={isPending} className="rounded-[8px]" />
          </Field>
        </div>
        <Field label={t("fields.contractedHours")} required>
          <Input
            name="contracted_hours"
            type="number"
            min={1}
            max={60}
            defaultValue={staff?.contracted_hours ?? 37}
            disabled={isPending}
            className="max-w-28 rounded-[8px]"
            required
          />
        </Field>
        <Field label="Turno preferido">
          <Select name="preferred_shift" defaultValue={staff?.preferred_shift ?? ""} disabled={isPending}>
            <option value="">Sin preferencia</option>
            <option value="am">Mañana</option>
            <option value="pm">Tarde</option>
            <option value="full">Completo</option>
          </Select>
          <p className="text-[12px] text-muted-foreground mt-1">
            Preferencia de turno — el generador intentará respetarla sin romper la cobertura mínima.
          </p>
        </Field>
      </Section>

      {/* Working pattern */}
      <Section label={t("fields.workingPattern")}>
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
        {/* Hidden inputs for form submission */}
        {ALL_DAYS.map((day) =>
          selectedDays.includes(day) ? (
            <input key={day} type="hidden" name={`day_${day}`} value="on" />
          ) : null
        )}
      </Section>

      {/* Skills */}
      <Section label={t("fields.skills")}>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALL_SKILLS.map((skill) => {
            const active = selectedSkills.includes(skill)
            return (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                disabled={isPending}
                className={cn(
                  "h-8 px-3 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-50 text-left",
                  active
                    ? "bg-primary/10 text-primary border-primary/30"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {ts(SKILL_KEYS[skill] as Parameters<typeof ts>[0])}
              </button>
            )
          })}
        </div>
        {/* Hidden inputs for form submission */}
        {ALL_SKILLS.map((skill) =>
          selectedSkills.includes(skill) ? (
            <input key={skill} type="hidden" name={`skill_${skill}`} value="on" />
          ) : null
        )}
      </Section>

      {/* Notes */}
      <Section label={t("fields.notes")}>
        <textarea
          name="notes"
          defaultValue={staff?.notes ?? ""}
          disabled={isPending}
          rows={3}
          className="w-full rounded-[8px] border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
          placeholder={tc("optional")}
        />
      </Section>

      {/* Error */}
      {state?.error && (
        <p className="text-[14px] text-destructive">{state.error}</p>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={isPending}>
            {isPending
              ? tc("saving")
              : mode === "create"
              ? tc("create")
              : tc("save")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={isPending}
            render={<Link href="/staff" />}
          >
            {tc("cancel")}
          </Button>
        </div>

        {mode === "edit" && !confirmDelete && (
          <Button
            type="button"
            variant="destructive"
            disabled={isPending || isDeleting}
            onClick={() => setConfirmDelete(true)}
          >
            {tc("delete")}
          </Button>
        )}

        {mode === "edit" && confirmDelete && (
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">
              {t("deleteConfirmDescription")}
            </span>
            <Button
              type="button"
              variant="destructive"
              disabled={isDeleting}
              onClick={handleDelete}
            >
              {isDeleting ? "…" : tc("confirm")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmDelete(false)}
            >
              {tc("cancel")}
            </Button>
          </div>
        )}
      </div>
    </form>
  )
}
