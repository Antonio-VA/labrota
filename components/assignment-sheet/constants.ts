import { DEFAULT_DEPT_BORDER } from "@/lib/department-colors"

export const ROLE_DOT: Record<string, string> = {
  lab:       "bg-blue-400",
  andrology: "bg-emerald-400",
  admin:     "bg-slate-400",
}

export const ROLE_BORDER: Record<string, string> = { ...DEFAULT_DEPT_BORDER }

export const ROLE_LABEL: Record<string, string> = {
  lab: "Emb", andrology: "And", admin: "Adm",
}

export const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }

export const TECNICA_PILL: Record<string, string> = {
  amber:  "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
  blue:   "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
  green:  "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
  purple: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
  coral:  "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
  teal:   "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400",
  slate:  "bg-muted border-border text-muted-foreground",
  red:    "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
}

export const DEPT_FOR_ROLE: Record<string, string> = { lab: "lab", andrology: "andrology" }
