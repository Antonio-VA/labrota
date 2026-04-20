import { DEFAULT_DEPT_BORDER, DEFAULT_DEPT_LABEL, DEFAULT_DEPT_ORDER } from "@/lib/department-colors"
import type { DeptMaps } from "./types"
import { toISODate } from "@/lib/format-date"

export const DEFAULT_DEPT_MAPS: DeptMaps = {
  border: DEFAULT_DEPT_BORDER,
  label:  DEFAULT_DEPT_LABEL,
  order:  DEFAULT_DEPT_ORDER,
}

// Top-level fallbacks for components that don't have access to weekData
export const ROLE_ORDER: Record<string, number> = DEFAULT_DEPT_MAPS.order
export const ROLE_LABEL: Record<string, string> = DEFAULT_DEPT_MAPS.label
export const ROLE_BORDER: Record<string, string> = DEFAULT_DEPT_MAPS.border

// Kept for month grid role dots (tiny preview)
export const ROLE_DOT: Record<string, string> = {
  lab: "bg-blue-400", andrology: "bg-emerald-400", admin: "bg-slate-400",
}
export const SHIFT_ORDER: Record<string, number> = { am: 0, pm: 1, full: 2 }

// Técnica pill color classes keyed by color name (matches tecnicas-tab.tsx)
export const TECNICA_PILL: Record<string, string> = {
  amber:  "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
  blue:   "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
  green:  "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
  purple: "bg-purple-500/10 border-purple-500/30 text-muted-foreground",
  coral:  "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
  teal:   "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400",
  slate:  "bg-muted border-border text-muted-foreground",
  red:    "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
}

// ── The 5 skills shown in coverage row ────────────────────────────────────────
export const COVERAGE_SKILLS = [
  { key: "biopsy",          label: "B"  },
  { key: "icsi",            label: "I"  },
  { key: "egg_collection",  label: "RO" },
  { key: "embryo_transfer", label: "TE" },
  { key: "denudation",      label: "D"  },
]

export const LEGACY_SKILL_NAMES: Record<string, string> = {
  biopsy: "Biopsia", icsi: "ICSI", egg_collection: "Recogida de óvulos",
  embryo_transfer: "Transferencia embrionaria", denudation: "Denudación",
  semen_analysis: "Análisis seminal", sperm_prep: "Preparación espermática",
  sperm_freezing: "Congelación de esperma",
}

export const TODAY = toISODate()

export const DAY_ES_2: Record<string, string> = { mon: "Lu", tue: "Ma", wed: "Mi", thu: "Ju", fri: "Vi", sat: "Sá", sun: "Do" }

export const WARNING_CATEGORY_KEY: Record<string, string> = {
  coverage: "warningCoverage",
  skill_gap: "warningSkillGap",
  technique_shift_gap: "warningTechniqueShiftGap",
  rule: "warningRule",
  budget: "warningBudget",
}
export const WARNING_CATEGORY_ORDER: Record<string, number> = { coverage: 0, skill_gap: 1, technique_shift_gap: 2, budget: 3, rule: 4 }

export const DOW_HEADERS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
export const DOW_HEADERS_ES = ["Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"]
