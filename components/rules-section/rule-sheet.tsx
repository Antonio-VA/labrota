"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { ShieldAlert, ShieldCheck, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { createRule, updateRule } from "@/app/(clinic)/lab/rules-actions"
import { cn } from "@/lib/utils"
import type { RotaRule, RotaRuleType, Staff, Tecnica, ShiftTypeDefinition } from "@/lib/types/database"
import { RULE_TYPES, type RuleFormState, defaultForm, ruleToForm, formToInsert } from "./constants"
import { DayPicker } from "./day-picker"

export function RuleSheet({
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

  const requiresStaffPair = form.type === "no_librar_mismo_dia" || form.type === "no_coincidir" || form.type === "no_misma_tarea" || form.type === "supervisor_requerido"

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
        toast.error(result.error)
      } else {
        toast.success(editing ? t("updated") : t("created"))
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

          {/* Hard / Soft — hidden for restriccion_dia_tecnica (always hard by definition) */}
          {form.type !== "restriccion_dia_tecnica" && (
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
          )}

          {/* Type-specific params */}
          {form.type === "no_coincidir" && (
            <>
              <div>
                <label className={labelSelect}>{t("params.coincideScope")}</label>
                <select
                  className={inputClass}
                  value={form.coincideScope}
                  onChange={(e) => set("coincideScope", e.target.value as "same_day" | "same_shift")}
                >
                  <option value="same_day">{t("params.coincideScopeDay")}</option>
                  <option value="same_shift">{t("params.coincideScopeShift")}</option>
                </select>
                <p className="text-[12px] text-muted-foreground mt-1">
                  {form.coincideScope === "same_day" ? t("params.coincideScopeDayHint") : t("params.coincideScopeShiftHint")}
                </p>
              </div>
              {form.coincideScope === "same_shift" && (
                <div>
                  <label className={labelSelect}>{t("params.coincideDays")} <span className="text-muted-foreground font-normal">(opcional)</span></label>
                  <DayPicker
                    selected={form.coincideDays}
                    onChange={(days) => set("coincideDays", days)}
                  />
                  <p className="text-[12px] text-muted-foreground mt-1">{t("params.coincideDaysHint")}</p>
                </div>
              )}
            </>
          )}
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
                <DayPicker
                  selected={form.supervisorDays}
                  onChange={(days) => set("supervisorDays", days)}
                />
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
                <DayPicker
                  selected={form.restrictedDays}
                  onChange={(days) => set("restrictedDays", days)}
                  variant="soft"
                />
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
                <DayPicker
                  selected={form.fixedDays}
                  onChange={(days) => set("fixedDays", days)}
                />
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.fixedDaysHint")}</p>
              </div>
            </>
          )}

          {form.type === "tecnicas_juntas" && (
            <>
              <div>
                <label className={labelSelect}>{t("params.linkedTecnicas")}</label>
                <div className="flex flex-col gap-1 border border-border rounded-[8px] p-2 max-h-[200px] overflow-y-auto">
                  {tecnicas.filter((tc) => tc.activa).map((tc) => {
                    const selected = form.linkedTecnicas.includes(tc.codigo)
                    return (
                      <label key={tc.codigo} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px]">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setForm((p) => ({
                              ...p,
                              linkedTecnicas: selected
                                ? p.linkedTecnicas.filter((c) => c !== tc.codigo)
                                : [...p.linkedTecnicas, tc.codigo],
                            }))
                          }}
                        />
                        {tc.nombre_es} ({tc.codigo})
                      </label>
                    )
                  })}
                </div>
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.linkedTecnicasHint")}</p>
              </div>
              <div>
                <label className={labelSelect}>{t("params.linkedDays")} <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <DayPicker
                  selected={form.linkedDays}
                  onChange={(days) => set("linkedDays", days)}
                />
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.linkedDaysHint")}</p>
              </div>
            </>
          )}

          {form.type === "tarea_multidepartamento" && (
            <>
              <div>
                <label className={labelSelect}>{t("params.technique")}</label>
                <select
                  className={inputClass}
                  value={form.multiDeptTecnica}
                  onChange={(e) => set("multiDeptTecnica", e.target.value)}
                >
                  <option value="">{t("params.selectTechnique")}</option>
                  {tecnicas.filter((tc) => tc.activa).map((tc) => (
                    <option key={tc.codigo} value={tc.codigo}>{tc.nombre_es} ({tc.codigo})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelSelect}>{t("params.requiredDepartments")}</label>
                <div className="flex flex-col gap-1 border border-border rounded-[8px] p-2">
                  {["lab", "andrology", "admin"].map((dept) => {
                    const selected = form.multiDeptDepartments.includes(dept)
                    return (
                      <label key={dept} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px]">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setForm((p) => ({
                              ...p,
                              multiDeptDepartments: selected
                                ? p.multiDeptDepartments.filter((d) => d !== dept)
                                : [...p.multiDeptDepartments, dept],
                            }))
                          }}
                        />
                        {dept.charAt(0).toUpperCase() + dept.slice(1)}
                      </label>
                    )
                  })}
                </div>
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.requiredDepartmentsHint")}</p>
              </div>
              <div>
                <label className={labelSelect}>{t("params.linkedDays")} <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <DayPicker
                  selected={form.multiDeptDays}
                  onChange={(days) => set("multiDeptDays", days)}
                />
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.linkedDaysHint")}</p>
              </div>
            </>
          )}

          {form.type === "equipo_completo" && (
            <>
              <div>
                <label className={labelSelect}>{t("params.wholeTeamTecnicas")}</label>
                <div className="flex flex-col gap-1 border border-border rounded-[8px] p-2 max-h-[200px] overflow-y-auto">
                  {tecnicas.filter((tc) => tc.activa).map((tc) => {
                    const selected = form.wholeTeamTecnicas.includes(tc.codigo)
                    return (
                      <label key={tc.codigo} className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-muted text-[13px]">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {
                            setForm((p) => ({
                              ...p,
                              wholeTeamTecnicas: selected
                                ? p.wholeTeamTecnicas.filter((c) => c !== tc.codigo)
                                : [...p.wholeTeamTecnicas, tc.codigo],
                            }))
                          }}
                        />
                        {tc.nombre_es} ({tc.codigo})
                      </label>
                    )
                  })}
                </div>
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.wholeTeamTecnicasHint")}</p>
              </div>
              <div>
                <label className={labelSelect}>{t("params.linkedDays")} <span className="text-muted-foreground font-normal">(opcional)</span></label>
                <DayPicker
                  selected={form.wholeTeamDays}
                  onChange={(days) => set("wholeTeamDays", days)}
                />
                <p className="text-[12px] text-muted-foreground mt-1">{t("params.linkedDaysHint")}</p>
              </div>
            </>
          )}

          {/* Affected staff — hidden for technique-only rules */}
          {form.type !== "restriccion_dia_tecnica" && form.type !== "tecnicas_juntas" && form.type !== "tarea_multidepartamento" && form.type !== "equipo_completo" && <div>
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
                  <span className="font-medium">{t("allStaff")}</span>
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
