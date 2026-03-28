"use client"

import { useActionState, useState, useTransition, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { Hourglass, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { createStaff, updateStaff, deleteStaff } from "@/app/(clinic)/staff/actions"

const STAFF_PASTEL_COLORS = [
  "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
  "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  "#E9D5FF", "#FEF08A", "#CCFBF1", "#FFE4E6",
]
import { cn } from "@/lib/utils"
import type { StaffWithSkills, StaffRole, OnboardingStatus, SkillName, SkillLevel, WorkingDay, Tecnica } from "@/lib/types/database"

const ALL_DAYS: WorkingDay[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

function StaffColorPicker({ value, onChange, disabled }: { value: string; onChange: (c: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="size-8 rounded-full border-2 border-background ring-1 ring-border hover:ring-primary transition-shadow disabled:opacity-50"
        style={{ backgroundColor: value }}
        title="Color"
      />
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-[200px]">
          <div className="grid grid-cols-8 gap-1">
            {STAFF_PASTEL_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false) }}
                className={cn(
                  "size-5 rounded-full transition-transform hover:scale-125",
                  c === value && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const DEPT_MAP: Record<string, string> = { lab: "lab", andrology: "andrology" }

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
  const tc = useTranslations("common")
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
  onChange,
  children,
}: {
  name: string
  defaultValue?: string
  disabled?: boolean
  onChange?: (value: string) => void
  children: React.ReactNode
}) {
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      disabled={disabled}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className="h-8 w-full rounded-[8px] border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {children}
    </select>
  )
}

// ── End date toggle ───────────────────────────────────────────────────────────

function EndDateField({ initialValue, disabled, label }: { initialValue: string | null; disabled: boolean; label: string }) {
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

// ── Main form ─────────────────────────────────────────────────────────────────
export function StaffForm({
  mode,
  staff,
  tecnicas,
  departments: deptsProp,
  shiftTypes = [],
}: {
  mode: "create" | "edit"
  staff?: StaffWithSkills
  tecnicas?: Tecnica[]
  departments?: import("@/lib/types/database").Department[]
  shiftTypes?: import("@/lib/types/database").ShiftTypeDefinition[]
}) {
  const t  = useTranslations("staff")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")
  const action = mode === "edit" ? updateStaff.bind(null, staff!.id) : createStaff
  const [state, formAction, isPending] = useActionState(action, null)

  const [selectedDays, setSelectedDays] = useState<WorkingDay[]>(
    staff?.working_pattern ?? ["mon", "tue", "wed", "thu", "fri"]
  )
  const [preferredDays, setPreferredDays] = useState<WorkingDay[]>(
    staff?.preferred_days ?? []
  )
  const [avoidDays, setAvoidDays] = useState<WorkingDay[]>(
    staff?.avoid_days ?? []
  )
  const [preferredShift, setPreferredShift] = useState<string>(
    staff?.preferred_shift ?? ""
  )
  const [avoidShifts, setAvoidShifts] = useState<string[]>(
    staff?.avoid_shifts ?? []
  )
  const [role, setRole] = useState<string>(staff?.role ?? "lab")
  const [selectedColor, setSelectedColor] = useState<string>(
    staff?.color || STAFF_PASTEL_COLORS[Math.floor(Math.random() * STAFF_PASTEL_COLORS.length)]
  )

  // Derive capacidades from técnicas matching the staff's department
  const dept = DEPT_MAP[role]
  const capacidades: { skill: string; label: string }[] = (() => {
    if (!dept || !tecnicas) return []
    return tecnicas
      .filter((t) => t.activa && t.department === dept)
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
    const isPref = preferredShift === code
    const isAvoid = avoidShifts.includes(code)
    if (!isPref && !isAvoid) {
      // neutral → prefers (exclusive: clear previous preferred)
      setPreferredShift(code)
    } else if (isPref) {
      // prefers → avoids
      setPreferredShift("")
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

  const [tab, setTab] = useState<"datos" | "disponibilidad" | "tareas">("datos")

  return (
    <form action={formAction} className="flex flex-col gap-6">

      {/* Tabs */}
      <div className="flex gap-0 border-b border-border -mb-2">
        {(["datos", "disponibilidad", "tareas"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-[14px] font-medium border-b-2 -mb-px transition-colors",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "datos" ? "Datos" : t === "disponibilidad" ? "Disponibilidad" : "Habilidades"}
          </button>
        ))}
      </div>

      {/* === TAB: Datos === */}
      <div className={tab !== "datos" ? "hidden" : ""}>

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
        {mode === "create" && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" name="invite_viewer" value="on" className="mt-0.5 size-4 rounded border-border accent-primary" />
            <span className="text-[12px] text-muted-foreground leading-tight">
              {t("inviteViewerLabel")}
            </span>
          </label>
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
              <option value="onboarding">{t("onboardingStatus.onboarding")}</option>
              <option value="inactive">{t("onboardingStatus.inactive")}</option>
            </Select>
          </Field>
        </div>
        <Field label={t("fields.startDate")} required>
          <Input name="start_date" type="date" defaultValue={staff?.start_date} disabled={isPending} required className="rounded-[8px]" />
        </Field>
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
          defaultValue={staff?.days_per_week ?? 5}
          disabled={isPending}
          className="max-w-28 rounded-[8px]"
          required
        />
      </Section>

      <Section label={t("fields.preferredShift")}>
        <div className="flex gap-2 flex-wrap">
          {shiftTypes.filter((st) => st.active !== false).map((st) => {
            const isPref = preferredShift === st.code
            const isAvoid = avoidShifts.includes(st.code)
            return (
              <button
                key={st.code}
                type="button"
                onClick={() => cycleShiftPreference(st.code)}
                disabled={isPending}
                title={`${st.name_es} (${st.start_time}–${st.end_time})`}
                className={cn(
                  "h-8 px-3 rounded-[8px] border text-[13px] font-medium transition-colors disabled:opacity-50",
                  isPref
                    ? "bg-[#2C3E6B] text-white border-[#2C3E6B]"
                    : isAvoid
                    ? "bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                )}
              >
                {st.code}
              </button>
            )
          })}
        </div>
        <p className="text-[12px] text-muted-foreground mt-1.5">
          {preferredShift || avoidShifts.length > 0 ? (
            <>
              {preferredShift && <>{t("prefersLabel")} {preferredShift}</>}
              {preferredShift && avoidShifts.length > 0 && " — "}
              {avoidShifts.length > 0 && <>{t("avoidsLabel")} {avoidShifts.join(", ")}</>}
            </>
          ) : t("fields.preferredShiftNone")}
        </p>
        <input type="hidden" name="preferred_shift" value={preferredShift} />
        <input type="hidden" name="avoid_shifts" value={avoidShifts.join(",")} />
      </Section>

      {/* Días disponibles (hard constraint) */}
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

      {/* Preferencias de día (3-state: neutral / prefers / avoids) */}
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
                      ? "bg-[#2C3E6B] text-white border-[#2C3E6B]"
                      : isAvoid
                      ? "bg-[#FEE2E2] text-[#B91C1C] border-[#FECACA]"
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

      </div>

      {/* === TAB: Tareas === */}
      <div className={cn("flex flex-col gap-6", tab !== "tareas" && "hidden")}>

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
                  level === 'off'       && "bg-background border-border hover:bg-muted"
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
                  <Hourglass className="size-4 text-amber-500 ml-2 shrink-0" />
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

      </div>

      {/* Notes — always visible */}
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
