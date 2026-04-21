import type { StaffWithSkills, Tecnica } from "@/lib/types/database"
import { DEFAULT_DEPT_BORDER } from "@/lib/department-colors"

// Narrowed next-intl TFunction used across staff-list subcomponents. Cast from
// `useTranslations()` at the call site — next-intl's full generic signature
// isn't compatible with passing `t` down through a simple prop.
export type TFn = (key: string, values?: Record<string, unknown>) => string

// ── Column types ────────────────────────────────────────────────────────────

export type ColKey =
  | "role" | "email" | "capacidades" | "training" | "status"
  | "shiftPrefs" | "dayPrefs" | "daysPerWeek" | "workingPattern"
  | "leaveBalance" | "leaveTaken" | "leaveBooked"

export const COL_WIDTHS: Record<ColKey, string> = {
  role: "minmax(0,1fr)",
  email: "minmax(110px,1fr)",
  capacidades: "minmax(0,4fr)",
  training: "minmax(200px,2.5fr)",
  status: "minmax(100px,0.8fr)",
  shiftPrefs: "minmax(120px,1.2fr)",
  dayPrefs: "minmax(120px,1.2fr)",
  daysPerWeek: "minmax(55px,0.5fr)",
  workingPattern: "minmax(100px,1fr)",
  leaveBalance: "minmax(80px,0.8fr)",
  leaveTaken: "minmax(70px,0.7fr)",
  leaveBooked: "minmax(70px,0.7fr)",
}

export const ALL_COL_ORDER: ColKey[] = [
  "role", "email", "capacidades", "training", "status",
  "shiftPrefs", "dayPrefs", "daysPerWeek", "workingPattern",
  "leaveBalance", "leaveTaken", "leaveBooked",
]

export const HR_KEYS: ColKey[] = ["leaveBalance", "leaveTaken", "leaveBooked"]

export function buildGrid(cols: Set<ColKey>, order: ColKey[] = ALL_COL_ORDER) {
  const parts = ["32px", "minmax(0,1.5fr)"]
  for (const key of order) {
    if (cols.has(key)) parts.push(COL_WIDTHS[key])
  }
  return parts.join(" ")
}

// ── Staff colors ────────────────────────────────────────────────────────────

export const STAFF_COLORS = [
  "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
  "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  "#E9D5FF", "#FEF08A", "#CCFBF1", "#FFE4E6",
  "#93C5FD", "#86EFAC", "#FCA5A5", "#FCD34D", "#C4B5FD", "#F9A8D4",
  "#6EE7B7", "#FDBA74", "#A5B4FC", "#FDA4AF", "#7DD3FC", "#BEF264",
  "#D8B4FE", "#FDE047", "#99F6E4", "#E0E7FF",
  "#E2E8F0", "#CBD5E1", "#D1D5DB", "#B0B8C4",
  "#E8D5C4", "#D4B896", "#C9B8A8", "#DEC9B0",
]

// ── Sorting ─────────────────────────────────────────────────────────────────

export function sortByName(a: StaffWithSkills, b: StaffWithSkills) {
  return a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
}

export function sortByRole(a: StaffWithSkills, b: StaffWithSkills) {
  const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
  return (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
}

// ── Skill label builder ─────────────────────────────────────────────────────

const LEGACY_SKILL_NAMES: Record<string, string> = {
  biopsy: "Biopsia", icsi: "ICSI", egg_collection: "Recogida de óvulos",
  embryo_transfer: "Transferencia embrionaria", denudation: "Denudación",
  semen_analysis: "Análisis seminal", sperm_prep: "Preparación espermática",
  sperm_freezing: "Congelación de esperma",
}

export function makeSkillLabel(tecnicas: Tecnica[]) {
  const codeMap = Object.fromEntries(tecnicas.map((t) => [t.codigo, t.nombre_es]))
  return (code: string) => codeMap[code] ?? LEGACY_SKILL_NAMES[code] ?? code
}

// ── Day helpers ─────────────────────────────────────────────────────────────

export const DAY_LABELS: Record<string, string> = { mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" }
export const ALL_DAYS_TABLE: string[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

// ── Department colors ───────────────────────────────────────────────────────

export const ROLE_BORDER_COLOR = DEFAULT_DEPT_BORDER
