"use client"

import { useState, useTransition, useEffect, useMemo } from "react"
import { useTranslations } from "next-intl"
import { PlusIcon, Pencil, Trash2, ShieldAlert, ShieldCheck, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  createRule,
  updateRule,
  deleteRule,
  toggleRule,
} from "@/app/(clinic)/lab/rules-actions"
import { cn } from "@/lib/utils"
import type { RotaRule, RotaRuleType, RotaRuleInsert, Staff, Tecnica, ShiftTypeDefinition } from "@/lib/types/database"

// ── Toggle ─────────────────────────────────────────────────────────────────────
function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        checked ? "bg-primary" : "bg-muted-foreground/30",
        disabled && "cursor-not-allowed opacity-50"
      )}
    >
      <span className={cn(
        "pointer-events-none inline-block size-4 rounded-full bg-white shadow ring-0 transition-transform",
        checked ? "translate-x-4" : "translate-x-0"
      )} />
    </button>
  )
}

// ── Rule type ordering ─────────────────────────────────────────────────────────
const RULE_TYPES: RotaRuleType[] = [
  "no_coincidir",
  "no_misma_tarea",
  "no_librar_mismo_dia",
  "supervisor_requerido",
  "max_dias_consecutivos",
  "distribucion_fines_semana",
  "descanso_fin_de_semana",
  "restriccion_dia_tecnica",
  "asignacion_fija",
]

// Which org modes each rule type applies to
const RULE_MODE: Record<RotaRuleType, "both" | "by_shift" | "by_task"> = {
  no_coincidir: "both",
  no_misma_tarea: "both",
  no_librar_mismo_dia: "both",
  supervisor_requerido: "both",
  max_dias_consecutivos: "both",
  distribucion_fines_semana: "both",
  descanso_fin_de_semana: "both",
  restriccion_dia_tecnica: "both",
  asignacion_fija: "both",
}

// ── Rule form state ────────────────────────────────────────────────────────────
interface RuleFormState {
  type: RotaRuleType
  is_hard: boolean
  enabled: boolean
  staff_ids: string[]
  maxDays: string
  maxPerMonth: string
  skill: string
  supervisor_id: string
  recovery: "following" | "previous"
  restDays: string
  notes: string
  expires_at: string
  tecnica_code: string
  dayMode: "never" | "only"
  restrictedDays: string[]
  supervisorDays: string[]
  fixedShift: string
  fixedDays: string[]
}

function defaultForm(): RuleFormState {
  return {
    type: "no_coincidir",
    is_hard: true,
    enabled: true,
    staff_ids: [],
    maxDays: "5",
    maxPerMonth: "2",
    skill: "egg_collection",
    supervisor_id: "",
    recovery: "following",
    restDays: "2",
    notes: "",
    expires_at: "",
    tecnica_code: "",
    dayMode: "never",
    restrictedDays: [],
    supervisorDays: [],
    fixedShift: "",
    fixedDays: [],
  }
}

function ruleToForm(rule: RotaRule): RuleFormState {
  return {
    type: rule.type,
    is_hard: rule.is_hard,
    enabled: rule.enabled,
    staff_ids: rule.staff_ids,
    maxDays: String((rule.params.maxDays as number | undefined) ?? 5),
    maxPerMonth: String((rule.params.maxPerMonth as number | undefined) ?? 2),
    skill: String((rule.params.skill as string | undefined) ?? "egg_collection"),
    supervisor_id: String((rule.params.supervisor_id as string | undefined) ?? ""),
    recovery: ((rule.params.recovery as string | undefined) ?? "following") as "following" | "previous",
    restDays: String((rule.params.restDays as number | undefined) ?? 2),
    notes: rule.notes ?? "",
    expires_at: rule.expires_at ? rule.expires_at.split("T")[0] : "",
    tecnica_code: String((rule.params.tecnica_code as string | undefined) ?? (rule.params.training_tecnica_code as string | undefined) ?? ""),
    dayMode: ((rule.params.dayMode as string | undefined) ?? "never") as "never" | "only",
    restrictedDays: (rule.params.restrictedDays as string[] | undefined) ?? [],
    supervisorDays: (rule.params.supervisorDays as string[] | undefined) ?? [],
    fixedShift: String((rule.params.fixedShift as string | undefined) ?? ""),
    fixedDays: (rule.params.fixedDays as string[] | undefined) ?? [],
  }
}

function formToInsert(form: RuleFormState): Omit<RotaRuleInsert, "organisation_id"> {
  const params: Record<string, unknown> = {}
  if (form.type === "max_dias_consecutivos") params.maxDays = parseInt(form.maxDays, 10) || 5
  if (form.type === "distribucion_fines_semana") params.maxPerMonth = parseInt(form.maxPerMonth, 10) || 2
  if (form.type === "supervisor_requerido") {
    params.supervisor_id = form.supervisor_id
    if (form.supervisorDays.length > 0) params.supervisorDays = form.supervisorDays
    if (form.tecnica_code) params.training_tecnica_code = form.tecnica_code
  }
  if (form.type === "descanso_fin_de_semana") {
    params.recovery = form.recovery
    params.restDays = parseInt(form.restDays, 10) || 2
  }
  if (form.type === "restriccion_dia_tecnica") {
    params.tecnica_code = form.tecnica_code
    params.dayMode = form.dayMode
    params.restrictedDays = form.restrictedDays
  }
  if (form.type === "asignacion_fija") {
    if (form.fixedShift) params.fixedShift = form.fixedShift
    if (form.fixedDays.length > 0) params.fixedDays = form.fixedDays
  }
  return {
    type: form.type,
    is_hard: form.is_hard,
    enabled: form.enabled,
    staff_ids: form.staff_ids,
    params,
    notes: form.notes.trim() || null,
    expires_at: form.expires_at ? new Date(form.expires_at + "T23:59:59Z").toISOString() : null,
  }
}

// ── Rule edit sheet ────────────────────────────────────────────────────────────
function RuleSheet({
  open,
  onOpenChange,
  editing,
  staff,
  tecnicas = [],
  shiftTypes = [],
  allowedTypes,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  editing: RotaRule | null
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  tecnicas?: Pick<Tecnica, "codigo" | "nombre_es" | "nombre_en" | "activa">[]
  shiftTypes?: Pick<ShiftTypeDefinition, "code" | "name_es" | "name_en">[]
  allowedTypes: Set<RotaRuleType>
  onSaved: (rule: RotaRule) => void
}) {
  const t = useTranslations("lab.rules")
  const [form, setForm] = useState<RuleFormState>(editing ? ruleToForm(editing) : defaultForm())
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState("")

  // Reset form whenever the sheet opens (handles both new and edit cases)
  useEffect(() => {
    if (open) {
      setForm(editing ? ruleToForm(editing) : defaultForm())
      setError("")
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleOpenChange = (v: boolean) => {
    setError("")
    onOpenChange(v)
  }

  function set<K extends keyof RuleFormState>(key: K, val: RuleFormState[K]) {
    setForm((p) => ({ ...p, [key]: val }))
  }

  function toggleStaff(id: string) {
    setForm((p) => {
      const included = p.staff_ids.includes(id)
      return {
        ...p,
        staff_ids: included
          ? p.staff_ids.filter((s) => s !== id)
          : [...p.staff_ids, id],
      }
    })
  }

  const requiresStaffPair = form.type === "no_librar_mismo_dia" || form.type === "no_coincidir" || form.type === "no_misma_tarea"

  function handleSubmit() {
    if (requiresStaffPair && form.staff_ids.length < 2) {
      setError(t("errorMinTwoStaff"))
      return
    }
    if (form.type === "restriccion_dia_tecnica") {
      if (!form.tecnica_code) { setError("Selecciona una técnica"); return }
      if (form.restrictedDays.length === 0) { setError("Selecciona al menos un día"); return }
    }
    startTransition(async () => {
      const data = formToInsert(form)
      const result = editing
        ? await updateRule(editing.id, data)
        : await createRule(data)
      if (result.error) {
        setError(result.error)
      } else {
        onOpenChange(false)
        if (result.rule) onSaved(result.rule)
      }
    })
  }

  const labelSelect =
    "block text-[13px] font-medium text-foreground mb-1"
  const inputClass =
    "w-full border border-border rounded-[8px] px-3 py-1.5 text-[14px] bg-background focus:outline-none focus:ring-2 focus:ring-primary"

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle>{editing ? t("save") : t("add")}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {/* Type */}
          <div>
            <label className={labelSelect}>Tipo</label>
            <select
              className={inputClass}
              value={form.type}
              onChange={(e) => set("type", e.target.value as RotaRuleType)}
            >
              {RULE_TYPES.filter((rt) => allowedTypes.has(rt)).map((rt) => (
                <option key={rt} value={rt}>{t(`types.${rt}`)}</option>
              ))}
            </select>
            <p className="text-[12px] text-muted-foreground mt-1">{t(`descriptions.${form.type}`)}</p>
          </div>

          {/* Hard / Soft */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => set("is_hard", true)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-colors",
                form.is_hard
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <ShieldAlert className="size-3.5" />
              {t("hard")}
            </button>
            <button
              type="button"
              onClick={() => set("is_hard", false)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 rounded-[8px] border px-3 py-2 text-[13px] font-medium transition-colors",
                !form.is_hard
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              )}
            >
              <ShieldCheck className="size-3.5" />
              {t("soft")}
            </button>
          </div>

          {/* Type-specific params */}
          {form.type === "max_dias_consecutivos" && (
            <div>
              <label className={labelSelect}>{t("params.maxDays")}</label>
              <Input
                type="number"
                min={1}
                max={14}
                value={form.maxDays}
                onChange={(e) => set("maxDays", e.target.value)}
              />
            </div>
          )}
          {form.type === "distribucion_fines_semana" && (
            <div>
              <label className={labelSelect}>{t("params.maxPerMonth")}</label>
              <Input
                type="number"
                min={0}
                max={8}
                value={form.maxPerMonth}
                onChange={(e) => set("maxPerMonth", e.target.value)}
              />
            </div>
          )}
          {form.type === "supervisor_requerido" && (
            <>
              <div>
                <label className={labelSelect}>{t("params.supervisor")}</label>
                <select
                  className={inputClass}
                  value={form.supervisor_id}
                  onChange={(e) => set("supervisor_id", e.target.value)}
                >
                  <option value="">{t("params.selectSupervisor")}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                  ))}
                </select>
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.supervisorHint")}</p>
              </div>
              <div>
                <label className={labelSelect}>{t("params.trainingTechnique")} <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <select
                  className={inputClass}
                  value={form.tecnica_code}
                  onChange={(e) => set("tecnica_code", e.target.value)}
                >
                  <option value="">{t("params.noTechnique")}</option>
                  {tecnicas.filter((tc) => tc.activa).map((tc) => (
                    <option key={tc.codigo} value={tc.codigo}>{tc.nombre_es} ({tc.codigo})</option>
                  ))}
                </select>
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.trainingTechniqueHint")}</p>
              </div>
              <div>
                <label className={labelSelect}>{t("params.selectDays")} <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <div className="flex flex-wrap gap-2">
                  {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => {
                    const selected = form.supervisorDays.includes(day)
                    const dayLabels: Record<string, string> = { mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" }
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({
                            ...p,
                            supervisorDays: selected
                              ? p.supervisorDays.filter((d) => d !== day)
                              : [...p.supervisorDays, day],
                          }))
                        }}
                        className={cn(
                          "size-9 rounded-full border text-[13px] font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {dayLabels[day]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
          {form.type === "descanso_fin_de_semana" && (
            <>
              <div>
                <label className={labelSelect}>{t("params.recovery")}</label>
                <select
                  className={inputClass}
                  value={form.recovery}
                  onChange={(e) => set("recovery", e.target.value as "following" | "previous")}
                >
                  <option value="following">{t("params.recoveryFollowing")}</option>
                  <option value="previous">{t("params.recoveryPrevious")}</option>
                </select>
                <p className="text-[12px] text-muted-foreground mt-1">{t(`params.recovery${form.recovery === "following" ? "Following" : "Previous"}Hint`)}</p>
              </div>
              <div>
                <label className={labelSelect}>{t("params.restDays")}</label>
                <Input
                  type="number"
                  min={0}
                  max={5}
                  value={form.restDays}
                  onChange={(e) => set("restDays", e.target.value)}
                />
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.restDaysHint")}</p>
              </div>
            </>
          )}
          {form.type === "restriccion_dia_tecnica" && (
            <>
              <div>
                <label className={labelSelect}>{t("params.technique")}</label>
                <select
                  className={inputClass}
                  value={form.tecnica_code}
                  onChange={(e) => set("tecnica_code", e.target.value)}
                >
                  <option value="">{t("params.selectTechnique")}</option>
                  {tecnicas.filter((tc) => tc.activa).map((tc) => (
                    <option key={tc.codigo} value={tc.codigo}>{tc.nombre_es} ({tc.codigo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelSelect}>{t("params.dayMode")}</label>
                <select
                  className={inputClass}
                  value={form.dayMode}
                  onChange={(e) => set("dayMode", e.target.value as "never" | "only")}
                >
                  <option value="never">{t("params.dayModeNever")}</option>
                  <option value="only">{t("params.dayModeOnly")}</option>
                </select>
              </div>
              <div>
                <label className={labelSelect}>{t("params.selectDays")}</label>
                <div className="flex flex-wrap gap-2">
                  {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => {
                    const selected = form.restrictedDays.includes(day)
                    const dayLabels: Record<string, string> = { mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" }
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({
                            ...p,
                            restrictedDays: selected
                              ? p.restrictedDays.filter((d) => d !== day)
                              : [...p.restrictedDays, day],
                          }))
                        }}
                        className={cn(
                          "size-9 rounded-full text-[13px] font-medium border transition-colors",
                          selected
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {dayLabels[day]}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {form.type === "asignacion_fija" && (
            <>
              <div>
                <label className={labelSelect}>{t("params.fixedShift")} <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <select
                  className={inputClass}
                  value={form.fixedShift}
                  onChange={(e) => set("fixedShift", e.target.value)}
                >
                  <option value="">{t("params.anyShift")}</option>
                  {shiftTypes.map((st) => (
                    <option key={st.code} value={st.code}>{st.name_es} ({st.code})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelSelect}>{t("params.fixedDays")} <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <div className="flex flex-wrap gap-2">
                  {(["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const).map((day) => {
                    const selected = form.fixedDays.includes(day)
                    const dayLabels: Record<string, string> = { mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" }
                    return (
                      <button
                        key={day}
                        type="button"
                        onClick={() => {
                          setForm((p) => ({
                            ...p,
                            fixedDays: selected
                              ? p.fixedDays.filter((d) => d !== day)
                              : [...p.fixedDays, day],
                          }))
                        }}
                        className={cn(
                          "size-9 rounded-full border text-[13px] font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-background text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {dayLabels[day]}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.fixedDaysHint")}</p>
              </div>
            </>
          )}

          {/* Affected staff — hidden for technique-only rules */}
          {form.type !== "restriccion_dia_tecnica" && <div>
            <label className={labelSelect}>{t("affectedStaff")}</label>
            {requiresStaffPair && (
              <p className="text-[11px] text-muted-foreground mb-1">{t("selectAtLeastTwo")}</p>
            )}
            <div className="flex flex-col gap-1 border border-border rounded-[8px] p-2">
              {/* All option — hidden for pair-based rules */}
              {!requiresStaffPair && (
                <label className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px] border-b border-border pb-2 mb-1">
                  <input
                    type="checkbox"
                    checked={form.staff_ids.length === 0}
                    onChange={() => set("staff_ids", [])}
                    className="rounded border-border accent-primary"
                  />
                  <span className="font-medium">Todo el personal</span>
                </label>
              )}
              <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                {staff.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px]"
                  >
                    <input
                      type="checkbox"
                      checked={form.staff_ids.includes(s.id)}
                      onChange={() => toggleStaff(s.id)}
                      className="rounded border-border accent-primary"
                    />
                    {s.first_name} {s.last_name}
                    <span className="ml-auto text-[11px] text-muted-foreground">{s.role}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>}

          {/* Expiry — hidden until toggled */}
          {form.expires_at ? (
            <div>
              <label className={labelSelect}>{t("expiresAt")}</label>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={form.expires_at}
                  onChange={(e) => set("expires_at", e.target.value)}
                  className="w-48"
                />
                <button
                  type="button"
                  onClick={() => set("expires_at", "")}
                  className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("clearExpiry")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                const d = new Date()
                d.setDate(d.getDate() + 30)
                set("expires_at", d.toISOString().split("T")[0])
              }}
              className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <Clock className="size-3" />
              {t("addExpiry")}
            </button>
          )}

          {/* Notes */}
          <div>
            <label className={labelSelect}>{t("adminNotes")}</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Internal note…"
              className={cn(inputClass, "resize-none")}
            />
          </div>

          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        <SheetFooter className="border-t border-border px-5 py-4 flex-row gap-2">
          <Button
            variant="ghost"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {t("cancel")}
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={isPending}>
            {isPending ? "…" : t("save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export function RulesSection({
  rules: initialRules,
  staff,
  tecnicas = [],
  shiftTypes = [],
  rotaDisplayMode = "by_shift",
}: {
  rules: RotaRule[]
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  tecnicas?: Pick<Tecnica, "codigo" | "nombre_es" | "nombre_en" | "activa">[]
  shiftTypes?: Pick<ShiftTypeDefinition, "code" | "name_es" | "name_en">[]
  rotaDisplayMode?: string
}) {
  const t = useTranslations("lab.rules")
  const allowedTypes = useMemo(() => new Set(
    RULE_TYPES.filter((rt) => {
      const mode = RULE_MODE[rt]
      return mode === "both" || mode === rotaDisplayMode
    })
  ), [rotaDisplayMode])
  const [rules, setRules] = useState<RotaRule[]>(initialRules)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<RotaRule | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  function openAdd() {
    setEditing(null)
    setSheetOpen(true)
  }

  function openEdit(rule: RotaRule) {
    setEditing(rule)
    setSheetOpen(true)
  }

  function handleToggle(rule: RotaRule) {
    const next = !rule.enabled
    setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: next } : r))
    startTransition(async () => {
      const result = await toggleRule(rule.id, next)
      if (result.error) {
        setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: rule.enabled } : r))
      }
    })
  }

  function handleDelete(id: string) {
    if (deletingId === id) {
      setDeletingId(null)
      setRules((prev) => prev.filter((r) => r.id !== id))
      startTransition(async () => {
        const result = await deleteRule(id)
        if (result.error) {
          // On error, server will revalidate — just clear optimistic state
        }
      })
    } else {
      setDeletingId(id)
    }
  }

  function handleSaved(rule: RotaRule) {
    if (editing) {
      setRules((prev) => prev.map((r) => r.id === rule.id ? rule : r))
    } else {
      setRules((prev) => [...prev, rule])
    }
    setSheetOpen(false)
    setEditing(null)
  }

  const now = new Date().toISOString()
  const visibleRules = useMemo(() => rules.filter((r) => allowedTypes.has(r.type)), [rules, allowedTypes])
  const activeRules = useMemo(() => visibleRules.filter((r) => !r.expires_at || r.expires_at > now), [visibleRules, now])
  const expiredRules = useMemo(() => visibleRules.filter((r) => r.expires_at && r.expires_at <= now), [visibleRules, now])
  const [showExpired, setShowExpired] = useState(false)

  function formatExpiry(iso: string) {
    const d = new Date(iso)
    return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })
  }

  const dayLabelMap: Record<string, string> = { mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom" }

  function getRuleDescription(rule: RotaRule): string {
    if (rule.type === "restriccion_dia_tecnica") {
      const code = rule.params.tecnica_code as string | undefined
      const mode = rule.params.dayMode as string | undefined
      const days = (rule.params.restrictedDays as string[] | undefined) ?? []
      const tec = tecnicas.find((tc) => tc.codigo === code)
      const tecName = tec?.nombre_es ?? code ?? "?"
      const dayNames = days.map((d) => dayLabelMap[d] ?? d).join(", ")
      if (mode === "only") return `${tecName}: solo ${dayNames}`
      return `${tecName}: nunca ${dayNames}`
    }
    // For staff-based rules, show names
    if (rule.staff_ids.length > 0 && (rule.type === "no_coincidir" || rule.type === "no_librar_mismo_dia" || rule.type === "no_misma_tarea")) {
      const names = rule.staff_ids.map((id) => {
        const s = staff.find((st) => st.id === id)
        return s ? s.first_name : "?"
      }).join(", ")
      return `${t(`descriptions.${rule.type}`)} — ${names}`
    }
    if (rule.type === "supervisor_requerido") {
      const supId = rule.params.supervisor_id as string | undefined
      const sup = staff.find((s) => s.id === supId)
      const supervised = rule.staff_ids
        .filter((id) => id !== supId)
        .map((id) => { const s = staff.find((st) => st.id === id); return s ? s.first_name : "?" })
      const supDays = (rule.params.supervisorDays as string[] | undefined) ?? []
      const trainingTecCode = rule.params.training_tecnica_code as string | undefined
      const trainingTec = trainingTecCode ? tecnicas.find((tc) => tc.codigo === trainingTecCode) : null
      if (sup) {
        const supervisedStr = supervised.length > 0 ? ` → ${supervised.join(", ")}` : ""
        const daysStr = supDays.length > 0 ? ` (${supDays.map((d) => dayLabelMap[d] ?? d).join(", ")})` : ""
        const tecStr = trainingTec ? ` [${trainingTec.nombre_es}]` : ""
        return `${sup.first_name} ${sup.last_name}${supervisedStr}${daysStr}${tecStr}`
      }
    }
    if (rule.type === "max_dias_consecutivos") {
      const max = rule.params.maxDays as number | undefined
      if (max) return `${t(`descriptions.${rule.type}`)} (${max})`
    }
    if (rule.type === "distribucion_fines_semana") {
      const max = rule.params.maxPerMonth as number | undefined
      if (max) return `${t(`descriptions.${rule.type}`)} (${max}/mes)`
    }
    if (rule.type === "asignacion_fija") {
      const names = rule.staff_ids.map((id) => {
        const s = staff.find((st) => st.id === id)
        return s ? s.first_name : "?"
      }).join(", ")
      const fixedShift = rule.params.fixedShift as string | undefined
      const fixedDays = (rule.params.fixedDays as string[] | undefined) ?? []
      const parts: string[] = [names]
      if (fixedShift) parts.push(`turno ${fixedShift}`)
      if (fixedDays.length > 0) parts.push(fixedDays.map((d) => dayLabelMap[d] ?? d).join(", "))
      return parts.join(" → ")
    }
    return t(`descriptions.${rule.type}`)
  }

  function renderRuleCard(rule: RotaRule, expired = false) {
    return (
      <div
        key={rule.id}
        className={cn(
          "flex items-center gap-3 rounded-[8px] border border-border bg-background px-4 py-3",
          expired && "opacity-60"
        )}
      >
        {/* Type + badges */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-medium">{t(`types.${rule.type}`)}</span>
            <Badge variant={rule.is_hard ? "skill-gap" : "outline"} className="text-[11px]">
              {rule.is_hard ? t("hard") : t("soft")}
            </Badge>
            {!rule.enabled && (
              <Badge variant="inactive" className="text-[11px]">{t("disabled")}</Badge>
            )}
            {rule.expires_at && !expired && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <Clock className="size-2.5" />
                {formatExpiry(rule.expires_at)}
              </span>
            )}
            {expired && (
              <Badge variant="inactive" className="text-[10px]">{t("expired")}</Badge>
            )}
          </div>
          <p className="text-[12px] text-muted-foreground mt-0.5">{getRuleDescription(rule)}</p>
          {rule.notes && (
            <p className="text-[12px] text-muted-foreground mt-0.5 truncate">{rule.notes}</p>
          )}
        </div>

        {/* Enabled toggle */}
        {!expired && <Toggle checked={rule.enabled} onChange={() => handleToggle(rule)} />}

        {/* Edit */}
        <button
          type="button"
          onClick={() => openEdit(rule)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Edit rule"
        >
          <Pencil className="size-3.5" />
        </button>

        {/* Delete with inline confirm */}
        <button
          type="button"
          onClick={() => handleDelete(rule.id)}
          className={cn(
            "transition-colors text-[12px] font-medium",
            deletingId === rule.id
              ? "text-destructive"
              : "text-muted-foreground hover:text-destructive"
          )}
          aria-label="Delete rule"
        >
          {deletingId === rule.id ? t("confirmDelete") : <Trash2 className="size-3.5" />}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[14px] font-medium">{t("title")}</p>
          <p className="text-[13px] text-muted-foreground">{t("subtitle")}</p>
        </div>
        <Button size="sm" variant="outline" onClick={openAdd}>
          <PlusIcon className="size-3.5 mr-1" />
          {t("add")}
        </Button>
      </div>

      {activeRules.length === 0 && expiredRules.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t("noRules")}
          description={t("noRulesDescription")}
        />
      ) : (
        <div className="flex flex-col gap-2">
          {activeRules.map((rule) => renderRuleCard(rule))}
        </div>
      )}

      {/* Expired rules section */}
      {expiredRules.length > 0 && (
        <div className="flex flex-col gap-2 mt-2">
          <button
            type="button"
            onClick={() => setShowExpired((v) => !v)}
            className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <Clock className="size-3.5" />
            {t("expiredRules", { count: expiredRules.length })}
            <span className="text-[11px]">{showExpired ? "▲" : "▼"}</span>
          </button>
          {showExpired && (
            <div className="flex flex-col gap-2">
              {expiredRules.map((rule) => renderRuleCard(rule, true))}
            </div>
          )}
        </div>
      )}

      <RuleSheet
        open={sheetOpen}
        onOpenChange={(v) => { setSheetOpen(v); if (!v) setEditing(null) }}
        editing={editing}
        staff={staff}
        tecnicas={tecnicas}
        shiftTypes={shiftTypes}
        allowedTypes={allowedTypes}
        onSaved={handleSaved}
      />
    </div>
  )
}
