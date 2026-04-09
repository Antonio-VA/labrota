import type React from "react"
import type { Tecnica } from "@/lib/types/database"
import type { DeptMaps, ViewMode } from "./types"
import { DEFAULT_DEPT_MAPS, ROLE_ORDER, SHIFT_ORDER, LEGACY_SKILL_NAMES } from "./constants"
import { Bookmark, Grid3X3, Sparkles, BrainCircuit } from "lucide-react"

export function buildDeptMaps(departments: import("@/lib/types/database").Department[]): DeptMaps {
  if (!departments || departments.length === 0) return DEFAULT_DEPT_MAPS
  return {
    border: Object.fromEntries(departments.map((d) => [d.code, d.colour])),
    label:  Object.fromEntries(departments.map((d) => [d.code, d.name])),
    order:  Object.fromEntries(departments.map((d) => [d.code, d.sort_order])),
  }
}

export function sortAssignments<T extends { staff: { role: string }; shift_type: string }>(arr: T[]): T[] {
  return [...arr].sort((a, b) => {
    const rd = (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
    if (rd !== 0) return rd
    return (SHIFT_ORDER[a.shift_type] ?? 9) - (SHIFT_ORDER[b.shift_type] ?? 9)
  })
}

export function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

export function addMonths(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T12:00:00")
  d.setMonth(d.getMonth() + n)
  return d.toISOString().split("T")[0]
}

export function getMonthStart(isoDate: string): string {
  return isoDate.slice(0, 7) + "-01"
}

export function formatToolbarLabel(view: ViewMode, currentDate: string, weekStart: string, locale: string): string {
  if (view === "month") {
    const start = new Date(weekStart + "T12:00:00")
    const end = new Date(weekStart + "T12:00:00")
    end.setDate(start.getDate() + 27)
    // Compact: "23 mar – 19 abr 2026"
    const sDay = start.getDate()
    const eDay = end.getDate()
    const sMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(start)
    const eMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(end)
    const yr = end.getFullYear()
    return sMon === eMon ? `${sDay}–${eDay} ${sMon} ${yr}` : `${sDay} ${sMon} – ${eDay} ${eMon} ${yr}`
  }
  // week — compact: "23–29 mar 2026"
  const start = new Date(weekStart + "T12:00:00")
  const end = new Date(weekStart + "T12:00:00")
  end.setDate(start.getDate() + 6)
  const sDay = start.getDate()
  const eDay = end.getDate()
  const sMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(start)
  const eMon = new Intl.DateTimeFormat(locale, { month: "short" }).format(end)
  const yr = end.getFullYear()
  return sMon === eMon ? `${sDay}–${eDay} ${sMon} ${yr}` : `${sDay} ${sMon} – ${eDay} ${eMon} ${yr}`
}

/** Rotate an array by `offset` positions (e.g. offset=6 moves Sun to front) */
export function rotateArray<T>(arr: T[], offset: number): T[] {
  if (offset === 0) return arr
  const n = arr.length
  const o = ((offset % n) + n) % n
  return [...arr.slice(o), ...arr.slice(0, o)]
}

export function makeSkillLabel(tecnicas: Tecnica[]) {
  const codeMap = Object.fromEntries(tecnicas.map((t) => [t.codigo, t.nombre_es]))
  return (code: string) => codeMap[code] ?? LEGACY_SKILL_NAMES[code] ?? code
}

export function parseHybridInsights(text: string): { assessment: string; issues: string[] } | null {
  // The format is: assessment text (first paragraph) + optional "Remaining issues:" bullet list
  const issuesMatch = text.match(/Remaining issues?:\s*\n((?:[•\-*][^\n]+\n?)+)/i)

  // Extract assessment: everything before "Remaining issues:" (or the whole text if no issues section)
  const assessmentRaw = issuesMatch
    ? text.slice(0, text.search(/Remaining issues?:/i)).trim()
    : text.trim()

  if (!assessmentRaw && !issuesMatch) return null

  const parseBullets = (block: string) =>
    block.split('\n')
      .map(l => l
        .replace(/^[•\-*]\s*/, '')
        .replace(/\([0-9a-f]{7,10}\)/gi, '') // strip internal IDs like (7ce46b5d)
        .trim()
      )
      .filter(Boolean)

  const rawIssues = issuesMatch ? parseBullets(issuesMatch[1]) : []

  return {
    assessment: assessmentRaw,
    issues: rawIssues,
  }
}

export type GenerationStrategy = "flexible_template" | "ai_optimal" | "ai_optimal_v2" | "ai_reasoning" | "ai_hybrid" | "manual"

export type StrategyCardMeta = { key: GenerationStrategy; icon: React.ReactNode; titleKey: string; descKey: string; badge: string; badgeColor: string; speed?: "fast" | "slow" }

export function buildStrategyCards(rotaDisplayMode: string, engineConfig: import("@/lib/types/database").EngineConfig | undefined): StrategyCardMeta[] {
  const isByTask = rotaDisplayMode === "by_task"
  const cards: StrategyCardMeta[] = []

  if (isByTask) {
    // 1. Task-based optimal
    cards.push({
      key: "ai_optimal", icon: <Sparkles className="size-5" />,
      titleKey: "taskOptimal", descKey: "taskOptimalDesc",
      badge: "IA", badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    })
  } else {
    // 1. Shift-based optimal
    cards.push({
      key: "ai_optimal", icon: <Sparkles className="size-5" />,
      titleKey: "aiOptimal", descKey: "aiOptimalDesc",
      badge: "IA", badgeColor: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      speed: "fast",
    })
    // 2. Hybrid (if enabled for org, default true)
    if (engineConfig?.hybridEnabled ?? true) {
      cards.push({
        key: "ai_hybrid", icon: <BrainCircuit className="size-5" />,
        titleKey: "aiHybrid", descKey: "aiHybridDesc",
        badge: "HYBRID", badgeColor: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
        speed: "slow",
      })
    }
    // 3. Claude reasoning (if enabled for org, default false)
    if (engineConfig?.reasoningEnabled ?? false) {
      cards.push({
        key: "ai_reasoning", icon: <BrainCircuit className="size-5" />,
        titleKey: "aiReasoning", descKey: "aiReasoningDesc",
        badge: "CLAUDE", badgeColor: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      })
    }
  }

  // Templates and blank week always last
  cards.push({
    key: "flexible_template", icon: <Bookmark className="size-5" />,
    titleKey: "templateApply", descKey: "templateApplyDesc",
    badge: "TPL", badgeColor: "bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20",
  })
  cards.push({
    key: "manual", icon: <Grid3X3 className="size-5" />,
    titleKey: "blankWeek", descKey: "blankWeekDesc",
    badge: "MANUAL", badgeColor: "bg-muted text-muted-foreground border-border",
  })

  return cards
}
