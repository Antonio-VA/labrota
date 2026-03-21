"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { createStaff, updateStaff, deleteStaff } from "@/app/(clinic)/staff/actions"
import { cn } from "@/lib/utils"
import type { StaffWithSkills, StaffRole, OnboardingStatus, SkillName, SkillLevel, WorkingDay, Tecnica } from "@/lib/types/database"

const ALL_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

// Fallback skill keys for translation lookup when no técnicas provided
const SKILL_KEYS: Record<string, string> = {
  icsi: "icsi", iui: "iui", vitrification: "vitrification", thawing: "thawing",
  biopsy: "biopsy", semen_analysis: "semenAnalysis", sperm_prep: "spermPrep",
  witnessing: "witnessing", egg_collection: "eggCollection", other: "other",
  embryo_transfer: "embryoTransfer", denudation: "denudation",
}
const DEFAULT_SKILLS: SkillName[] = ["biopsy", "icsi", "egg_collection", "embryo_transfer", "denudation"]

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
          <span className="ml-1 text-[12px] font-normal text-muted-foreground">({tc("optional").toLowerCase()})</span>
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
  tecnicas,
}: {
  mode: "create" | "edit"
  staff?: StaffWithSkills
  tecnicas?: Tecnica[]
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")
  const action = mode === "edit" ? updateStaff.bind(null, staff!.id) : createStaff
  const [state, formAction, isPending] = useActionState(action, null)

  const [selectedDays, setSelectedDays] = useState<WorkingDay[]>(
    staff?.working_pattern ?? ["mon", "tue", "wed", "thu", "fri"]
  )

  // Derive which skills to show: from active técnicas with required_skill, deduped by skill
  const capacidades: { skill: SkillName; label: string }[] = (() => {
    if (tecnicas && tecnicas.length > 0) {
      const seen = new Set<SkillName>()
      const result: { skill: SkillName; label: string }[] = []
      for (const tec of tecnicas.filter((tec) => tec.activa && tec.required_skill)) {
        const skill = tec.required_skill!
        if (!seen.has(skill)) {
          seen.add(skill)
          result.push({ skill, label: tec.nombre_es })
        }
      }
      return result
    }
    return DEFAULT_SKILLS.map((s) => ({ skill: s, label: ts(SKILL_KEYS[s] as Parameters<typeof ts>[0]) }))
  })()

  type SkillState = 'off' | 'training' | 'certified'
  const [skillLevels, setSkillLevels] = useState<Record<SkillName, SkillState>>(() => {
    const map = {} as Record<SkillName, SkillState>
    for (const { skill } of capacidades) {
      const existing = staff?.staff_skills?.find((sk) => sk.skill === skill)
      map[skill] = existing ? (existing.level as SkillState) : 'off'
    }
    return map
  })

  // Delete confirmation state
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, startDelete] = useTransition()

  function toggleDay(day: WorkingDay) {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    )
  }

  function cycleSkill(skill: SkillName) {
    setSkillLevels((prev) => {
      const cur = prev[skill]
      const next: SkillState = cur === 'off' ? 'training' : cur === 'training' ? 'certified' : 'off'
      return { ...prev, [skill]: next }
    })
  }

  function handleDelete() {
    startDelete(async () => {
      await deleteStaff(staff!.id)
    })
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">

      {/* Personal info */}
      <Section label={t("sections.personalInfo")}>
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
      <Section label={t("sections.roleAndStatus")}>
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
        <Field label={t("fields.daysPerWeek")} required>
          <Input
            name="days_per_week"
            type="number"
            min={1}
            max={7}
            defaultValue={staff?.days_per_week ?? 5}
            disabled={isPending}
            className="max-w-28 rounded-[8px]"
            required
          />
        </Field>
        <Field label={t("fields.preferredShift")}>
          <Select name="preferred_shift" defaultValue={staff?.preferred_shift ?? ""} disabled={isPending}>
            <option value="">{t("fields.preferredShiftNone")}</option>
            <option value="T1">T1</option>
            <option value="T2">T2</option>
            <option value="T3">T3</option>
            <option value="T4">T4</option>
          </Select>
          <p className="text-[12px] text-muted-foreground mt-1">
            {t("fields.preferredShiftHint")}
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

      {/* Capacidades */}
      <Section label={t("sections.capabilities")}>
        <div className="flex flex-wrap gap-2">
          {capacidades.map(({ skill, label }) => {
            const level = skillLevels[skill] ?? 'off'
            return (
              <button
                key={skill}
                type="button"
                onClick={() => cycleSkill(skill)}
                disabled={isPending}
                style={{ width: 180, height: 56, borderRadius: 8 }}
                className={cn(
                  "flex items-center justify-between px-3 border text-left transition-colors disabled:opacity-50 shrink-0",
                  level === 'certified' && "bg-blue-50 border-blue-400",
                  level === 'training'  && "bg-amber-50 border-amber-300",
                  level === 'off'       && "bg-white border-slate-200 hover:bg-slate-50"
                )}
              >
                <div className="flex flex-col justify-center min-w-0">
                  <span className={cn(
                    "text-[13px] font-medium leading-tight truncate",
                    level === 'certified' && "text-blue-700",
                    level === 'training'  && "text-amber-700",
                    level === 'off'       && "text-slate-400"
                  )}>
                    {label}
                  </span>
                  {level !== 'off' && (
                    <span className={cn(
                      "text-[10px] leading-tight mt-0.5",
                      level === 'certified' && "text-blue-600",
                      level === 'training'  && "text-amber-600"
                    )}>
                      {level === 'certified' ? t("skillLevels.certified") : t("skillLevels.training")}
                    </span>
                  )}
                </div>
                {level === 'certified' && (
                  <span className="text-blue-600 text-[14px] leading-none ml-2 shrink-0">✓</span>
                )}
                {level === 'training' && (
                  <span className="text-amber-600 text-[14px] leading-none ml-2 shrink-0">⏳</span>
                )}
              </button>
            )
          })}
        </div>
        {/* Hidden inputs for form submission */}
        {capacidades.map(({ skill }) =>
          skillLevels[skill] && skillLevels[skill] !== 'off' ? (
            <input key={skill} type="hidden" name={`skill_${skill}`} value={skillLevels[skill]} />
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
