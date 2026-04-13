import type { RotaRule, RotaRuleType, RotaRuleInsert } from "@/lib/types/database"

// ── Rule type ordering ────────────────────────────────────────────────────────
export const RULE_TYPES: RotaRuleType[] = [
  "no_coincidir",
  "no_misma_tarea",
  "no_librar_mismo_dia",
  "supervisor_requerido",
  "max_dias_consecutivos",
  "distribucion_fines_semana",
  "descanso_fin_de_semana",
  "restriccion_dia_tecnica",
  "asignacion_fija",
  "tecnicas_juntas",
  "tarea_multidepartamento",
  "equipo_completo",
]

// Which org modes each rule type applies to
export const RULE_MODE: Record<RotaRuleType, "both" | "by_shift" | "by_task"> = {
  no_coincidir: "both",
  no_misma_tarea: "both",
  no_librar_mismo_dia: "both",
  supervisor_requerido: "both",
  max_dias_consecutivos: "both",
  distribucion_fines_semana: "both",
  descanso_fin_de_semana: "both",
  restriccion_dia_tecnica: "both",
  asignacion_fija: "both",
  tecnicas_juntas: "by_task",
  tarea_multidepartamento: "by_task",
  equipo_completo: "by_task",
}

// Day labels used across day pickers and descriptions
export const DAY_LABELS: Record<string, string> = {
  mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D",
}

export const DAY_LABEL_LONG: Record<string, string> = {
  mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom",
}

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
export type DayCode = (typeof DAYS)[number]

// ── Rule form state ───────────────────────────────────────────────────────────
export interface RuleFormState {
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
  linkedTecnicas: string[]
  linkedDays: string[]
  multiDeptTecnica: string
  multiDeptDepartments: string[]
  multiDeptDays: string[]
  wholeTeamTecnicas: string[]
  wholeTeamDays: string[]
  coincideScope: "same_day" | "same_shift"
  coincideDays: string[]
}

export function defaultForm(): RuleFormState {
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
    linkedTecnicas: [],
    linkedDays: [],
    multiDeptTecnica: "",
    multiDeptDepartments: [],
    multiDeptDays: [],
    wholeTeamTecnicas: [],
    wholeTeamDays: [],
    coincideScope: "same_day",
    coincideDays: [],
  }
}

export function ruleToForm(rule: RotaRule): RuleFormState {
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
    linkedTecnicas: (rule.params.tecnica_codes as string[] | undefined) ?? [],
    linkedDays: (rule.params.days as string[] | undefined) ?? [],
    multiDeptTecnica: String((rule.params.tecnica_code as string | undefined) ?? ""),
    multiDeptDepartments: (rule.params.departments as string[] | undefined) ?? [],
    multiDeptDays: (rule.params.days as string[] | undefined) ?? [],
    wholeTeamTecnicas: (rule.params.tecnica_codes as string[] | undefined) ?? [],
    wholeTeamDays: (rule.params.days as string[] | undefined) ?? [],
    coincideScope: ((rule.params.scope as string | undefined) ?? "same_day") as "same_day" | "same_shift",
    coincideDays: (rule.params.days as string[] | undefined) ?? [],
  }
}

export function formToInsert(form: RuleFormState): Omit<RotaRuleInsert, "organisation_id"> {
  const params: Record<string, unknown> = {}
  if (form.type === "no_coincidir") {
    params.scope = form.coincideScope
    if (form.coincideScope === "same_shift" && form.coincideDays.length > 0) params.days = form.coincideDays
  }
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
  if (form.type === "tecnicas_juntas") {
    params.tecnica_codes = form.linkedTecnicas
    if (form.linkedDays.length > 0) params.days = form.linkedDays
  }
  if (form.type === "tarea_multidepartamento") {
    params.tecnica_code = form.multiDeptTecnica
    params.departments = form.multiDeptDepartments
    if (form.multiDeptDays.length > 0) params.days = form.multiDeptDays
  }
  if (form.type === "equipo_completo") {
    params.tecnica_codes = form.wholeTeamTecnicas
    if (form.wholeTeamDays.length > 0) params.days = form.wholeTeamDays
  }
  // restriccion_dia_tecnica is always hard — no soft option makes sense
  const isHard = form.type === "restriccion_dia_tecnica" ? true : form.is_hard
  return {
    type: form.type,
    is_hard: isHard,
    enabled: form.enabled,
    staff_ids: form.staff_ids,
    params,
    notes: form.notes.trim() || null,
    expires_at: form.expires_at ? new Date(form.expires_at + "T23:59:59Z").toISOString() : null,
  }
}
