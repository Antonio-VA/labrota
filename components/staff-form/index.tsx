"use client"

import { useActionState, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Hourglass } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { createStaff, updateStaff, deleteStaff } from "@/app/(clinic)/staff/actions"
import type { StaffWithSkills, SkillName, WorkingDay, Tecnica } from "@/lib/types/database"
import { STAFF_PASTEL_COLORS, ALL_DAYS, DEPT_MAP } from "./constants"
import { Section, Field, Select } from "./form-primitives"
import { StaffColorPicker } from "./color-picker"
import { AutosaveNotes } from "./autosave-notes"
import { EndDateField, OnboardingPeriodField } from "./date-fields"

export function StaffForm({
  mode,
  staff,
  tecnicas,
  departments: deptsProp,
  shiftTypes = [],
  defaultDaysPerWeek = 5,
  guardiaMode = false,
  hasViewerAccount = false,
  balancesTab,
}: {
  mode: "create" | "edit"
  staff?: StaffWithSkills
  tecnicas?: Tecnica[]
  departments?: import("@/lib/types/database").Department[]
  shiftTypes?: import("@/lib/types/database").ShiftTypeDefinition[]
  defaultDaysPerWeek?: number
  guardiaMode?: boolean
  hasViewerAccount?: boolean
  balancesTab?: React.ReactNode
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")
  const action = mode === "edit" ? updateStaff.bind(null, staff!.id) : createStaff
  const [state, formAction, isPending] = useActionState(action, null)

  const [selectedDays, setSelectedDays] = useState<WorkingDay[]>(
    staff?.working_pattern ?? ALL_DAYS
  )
  const [preferredDays, setPreferredDays] = useState<WorkingDay[]>(
    staff?.preferred_days ?? []
  )
  const [avoidDays, setAvoidDays] = useState<WorkingDay[]>(
    staff?.avoid_days ?? []
  )
  const [preferredShifts, setPreferredShifts] = useState<string[]>(
    staff?.preferred_shift ? staff.preferred_shift.split(",").filter(Boolean) : []
  )
  const [avoidShifts, setAvoidShifts] = useState<string[]>(
    staff?.avoid_shifts ?? []
  )
  const [role, setRole] = useState<string>(staff?.role ?? "lab")
  const [contractType, setContractType] = useState<string>(staff?.contract_type ?? "full_time")
  const [selectedColor, setSelectedColor] = useState<string>(
    () => staff?.color || STAFF_PASTEL_COLORS[Math.floor(Math.random() * STAFF_PASTEL_COLORS.length)]
  )

  // Derive capacidades from técnicas matching the staff's department
  const dept = DEPT_MAP[role]
  const capacidades: { skill: string; label: string }[] = (() => {
    if (!dept || !tecnicas) return []
    return tecnicas
      .filter((t) => t.activa && t.department.split(",").includes(dept))
      .sort((a, b) => a.orden - b.orden)
      .map((t) => ({ skill: t.codigo, label: t.nombre_es }))
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
    setSelectedDays((prev) => {
      const next = prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
      // Remove from preferred if no longer available
      setPreferredDays((pref) => pref.filter((d) => next.includes(d)))
      return next
    })
  }

  function cycleDayPreference(day: WorkingDay) {
    if (!selectedDays.includes(day)) return
    const isPref = preferredDays.includes(day)
    const isAvoid = avoidDays.includes(day)
    if (!isPref && !isAvoid) {
      // neutral → prefers
      setPreferredDays((prev) => [...prev, day])
    } else if (isPref) {
      // prefers → avoids
      setPreferredDays((prev) => prev.filter((d) => d !== day))
      setAvoidDays((prev) => [...prev, day])
    } else {
      // avoids → neutral
      setAvoidDays((prev) => prev.filter((d) => d !== day))
    }
  }

  function cycleShiftPreference(code: string) {
    const isPref = preferredShifts.includes(code)
    const isAvoid = avoidShifts.includes(code)
    if (!isPref && !isAvoid) {
      // neutral → prefers
      setPreferredShifts((prev) => [...prev, code])
    } else if (isPref) {
      // prefers → avoids
      setPreferredShifts((prev) => prev.filter((c) => c !== code))
      setAvoidShifts((prev) => [...prev, code])
    } else {
      // avoids → neutral
      setAvoidShifts((prev) => prev.filter((c) => c !== code))
    }
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

  const thr = useTranslations("hr")
  type Step = "datos" | "disponibilidad" | "tareas" | "balances" | "notes"
  const STEPS: Step[] = balancesTab
    ? ["datos", "disponibilidad", "tareas", "balances", "notes"]
    : ["datos", "disponibilidad", "tareas", "notes"]
  const [tab, setTab] = useState<Step>("datos")
  const stepIndex = STEPS.indexOf(tab)
  const isWizard = mode === "create"
  const stepLabels: Record<string, string> = {
    datos: t("wizardStep1"),
    disponibilidad: t("wizardStep2"),
    tareas: t("wizardStep3"),
    balances: thr("balances"),
    notes: tc("notes"),
  }

  return (
    <form action={formAction} className="flex flex-col gap-6">

      {/* Wizard stepper (create) or tabs (edit) */}
      {isWizard ? (
        <div className="flex items-center gap-2 -mb-2">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={cn("h-px w-6", i <= stepIndex ? "bg-primary" : "bg-border")} />}
              <button
                type="button"
                onClick={() => i <= stepIndex && setTab(s)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors",
                  i === stepIndex
                    ? "bg-primary text-primary-foreground"
                    : i < stepIndex
                    ? "bg-primary/10 text-primary cursor-pointer"
                    : "bg-muted text-muted-foreground cursor-default"
                )}
              >
                <span className="size-5 rounded-full bg-white/20 flex items-center justify-center text-[11px] font-semibold">{i + 1}</span>
                {stepLabels[s]}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-0 border-b border-border -mb-2">
          {STEPS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setTab(s)}
              className={cn(
                "px-4 py-2 text-[14px] font-medium border-b-2 -mb-px transition-colors",
                tab === s ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {stepLabels[s]}
            </button>
          ))}
        </div>
      )}

      {/* === TAB: Datos === */}
      <div className={cn("flex flex-col gap-6", tab !== "datos" && "hidden")}>

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

      {/* Role & status */}
      <Section label={t("sections.roleAndStatus")}>
        <div className="grid grid-cols-2 gap-4">
          <Field label={t("fields.role")} required>
            <Select name="role" defaultValue={staff?.role ?? "lab"} disabled={isPending} onChange={setRole}>
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

      </div>

      {/* === TAB: Disponibilidad === */}
      <div className={cn("flex flex-col gap-6", tab !== "disponibilidad" && "hidden")}>

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

      {/* Available days (hard constraint) */}
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

      {/* Day preferences (3-state: neutral / prefers / avoids) */}
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

      {/* Preferred shifts */}
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

      {/* Weekend on-call volunteer — only shown when guardia mode is active */}
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

      </div>

      {/* === TAB: Tareas === */}
      <div className={cn("flex flex-col gap-6", tab !== "tareas" && "hidden")}>

      {/* Capacidades */}
      <Section label={t("sections.capabilities")}>
        <div className="grid grid-cols-2 gap-2">
          {capacidades.map(({ skill, label }) => {
            const level = skillLevels[skill] ?? 'off'
            return (
              <button
                key={skill}
                type="button"
                onClick={() => cycleSkill(skill)}
                disabled={isPending}
                className={cn(
                  "flex items-center justify-between h-14 px-3 rounded-lg border text-left transition-colors disabled:opacity-50",
                  level === 'certified' && "bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700",
                  level === 'training'  && "bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700",
                  level === 'off'       && "bg-background border-border hover:bg-muted"
                )}
              >
                <div className="flex flex-col justify-center min-w-0">
                  <span className={cn(
                    "text-[13px] font-medium leading-tight truncate",
                    level === 'certified' && "text-blue-700 dark:text-blue-300",
                    level === 'training'  && "text-amber-700 dark:text-amber-300",
                    level === 'off'       && "text-slate-400 dark:text-slate-500"
                  )}>
                    {label}
                  </span>
                  {level !== 'off' && (
                    <span className={cn(
                      "text-[10px] leading-tight mt-0.5",
                      level === 'certified' && "text-blue-600 dark:text-blue-400",
                      level === 'training'  && "text-amber-600 dark:text-amber-400"
                    )}>
                      {level === 'certified' ? t("skillLevels.certified") : t("skillLevels.training")}
                    </span>
                  )}
                </div>
                {level === 'certified' && (
                  <span className="text-blue-600 dark:text-blue-400 text-[14px] leading-none ml-2 shrink-0">✓</span>
                )}
                {level === 'training' && (
                  <Hourglass className="size-4 text-amber-500 ml-2 shrink-0" />
                )}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-muted-foreground/70 italic mt-2">
          {t("skillCycleHint")}
        </p>
        {/* Hidden inputs for form submission */}
        {capacidades.map(({ skill }) =>
          skillLevels[skill] && skillLevels[skill] !== 'off' ? (
            <input key={skill} type="hidden" name={`skill_${skill}`} value={skillLevels[skill]} />
          ) : null
        )}
      </Section>

      </div>

      {/* === TAB: Balances === */}
      {balancesTab && (
        <div className={cn("flex flex-col gap-6", tab !== "balances" && "hidden")}>
          {balancesTab}
        </div>
      )}

      {/* === TAB: Notes === */}
      <div className={cn("flex flex-col gap-6", tab !== "notes" && "hidden")}>
        {mode === "edit" && staff ? (
          <AutosaveNotes staffId={staff.id} initialValue={staff.notes ?? ""} />
        ) : (
          <Section label={tc("notes")}>
            <textarea
              name="notes"
              defaultValue=""
              disabled={isPending}
              rows={5}
              className="w-full rounded-[8px] border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
              placeholder={tc("optional")}
            />
          </Section>
        )}
      </div>

      {/* Error */}
      {state?.error && (
        <p className="text-[14px] text-destructive">{state.error}</p>
      )}

      {/* Footer — hidden on balances and notes tabs */}
      {tab !== "balances" && tab !== "notes" && (
      <div className="flex items-center justify-between gap-3">
        {isWizard ? (
          <div className="flex items-center gap-2">
            {stepIndex > 0 && (
              <Button type="button" variant="outline" onClick={() => setTab(STEPS[stepIndex - 1])} disabled={isPending}>
                {tc("back")}
              </Button>
            )}
            {stepIndex === 0 && (
              <Button type="button" variant="outline" disabled={isPending} render={<Link href="/staff" />}>
                {tc("cancel")}
              </Button>
            )}
            {stepIndex < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setTab(STEPS[stepIndex + 1])} disabled={isPending}>
                {tc("next")}
              </Button>
            ) : (
              <Button type="submit" disabled={isPending}>
                {isPending ? tc("saving") : tc("create")}
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={isPending}>
                {isPending ? tc("saving") : tc("save")}
              </Button>
              <Button type="button" variant="outline" disabled={isPending} render={<Link href="/staff" />}>
                {tc("cancel")}
              </Button>
            </div>

            {!confirmDelete && (
              <Button type="button" variant="destructive" disabled={isPending || isDeleting} onClick={() => setConfirmDelete(true)}>
                {tc("delete")}
              </Button>
            )}

            {confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-muted-foreground">{t("deleteConfirmDescription")}</span>
                <Button type="button" variant="destructive" disabled={isDeleting} onClick={handleDelete}>
                  {isDeleting ? "…" : tc("confirm")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                  {tc("cancel")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
      )}
    </form>
  )
}
