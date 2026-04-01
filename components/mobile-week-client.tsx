"use client"

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { ChevronLeft, ChevronRight, ChevronDown, MoreHorizontal, Sparkles, FileDown, AlertTriangle, CheckCircle2, Plane, Cross, User, GraduationCap, Baby, CalendarX, Check, X, Grid3X3, Users, Bookmark, BrainCircuit, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { TapPopover } from "@/components/tap-popover"
import { WeekNotes } from "@/components/week-notes"
import { getRotaWeek, generateRota, getActiveStaff, getTemplates, applyTemplate, type RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, RotaTemplate, EngineConfig } from "@/lib/types/database"
import { toast } from "sonner"
import { getMondayOfWeek } from "@/lib/rota-engine"

const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

function contrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#1e293b" : "#ffffff"
}
const ROLE_LABEL: Record<string, Record<string, string>> = {
  es: { lab: "Lab", andrology: "Andrología", admin: "Admin" },
  en: { lab: "Lab", andrology: "Andrology", admin: "Admin" },
}

// ── Week picker dropdown ────────────────────────────────────────────────────

function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00")
  d.setDate(d.getDate() + n)
  return d.toISOString().split("T")[0]
}

function WeekPicker({ weekStart, locale, onSelect }: { weekStart: string; locale: "es" | "en"; onSelect: (w: string) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(null)
  const today = new Date().toISOString().split("T")[0]

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setDropPos({ top: r.bottom + 4, left: r.left })
  }, [open])

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent | TouchEvent) {
      if (dropRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", h)
    document.addEventListener("touchstart", h as any)
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h as any) }
  }, [open])

  const weeks = useMemo(() => {
    const result: { monday: string; label: string }[] = []
    for (let i = -4; i <= 8; i++) {
      const monday = addDays(weekStart, i * 7)
      const end = addDays(monday, 6)
      const s = new Date(monday + "T12:00:00")
      const e = new Date(end + "T12:00:00")
      const sm = new Intl.DateTimeFormat(locale, { month: "short" }).format(s)
      const em = new Intl.DateTimeFormat(locale, { month: "short" }).format(e)
      const label = sm === em
        ? `${s.getDate()}–${e.getDate()} ${sm}`
        : `${s.getDate()} ${sm} – ${e.getDate()} ${em}`
      result.push({ monday, label })
    }
    return result
  }, [weekStart, locale])

  const curLabel = (() => {
    const s = new Date(weekStart + "T12:00:00")
    const e = new Date(addDays(weekStart, 6) + "T12:00:00")
    const sm = new Intl.DateTimeFormat(locale, { month: "short" }).format(s)
    const em = new Intl.DateTimeFormat(locale, { month: "short" }).format(e)
    return sm === em ? `${s.getDate()}–${e.getDate()} ${sm}` : `${s.getDate()} ${sm} – ${e.getDate()} ${em}`
  })()

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[15px] font-semibold capitalize active:opacity-70 shrink-0"
      >
        {curLabel}
        <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>
      {open && dropPos && createPortal(
        <div
          ref={dropRef}
          className="fixed z-[9999] w-52 rounded-xl border border-border bg-background shadow-lg py-1 max-h-[60vh] overflow-y-auto"
          style={{ top: dropPos.top, left: dropPos.left }}
        >
          {weeks.map((w) => {
            const isCurrent = w.monday === weekStart
            const todayMonday = getMondayOfWeek(new Date())
            const isThisWeek = w.monday === todayMonday
            return (
              <button
                key={w.monday}
                onClick={() => { onSelect(w.monday); setOpen(false) }}
                className={cn(
                  "w-full text-left px-3 py-2.5 text-[13px] capitalize hover:bg-accent transition-colors flex items-center justify-between gap-3",
                  isCurrent && "bg-accent/60 font-semibold"
                )}
              >
                <span>{w.label}</span>
                {isThisWeek && <span className="text-[11px] text-primary font-medium">{locale === "es" ? "hoy" : "today"}</span>}
              </button>
            )
          })}
        </div>,
        document.body
      )}
    </>
  )
}

// ── AI insights parser (mirrors desktop parseHybridInsights) ────────────────

function parseInsights(text: string): { assessment: string; issues: string[] } | null {
  const issuesMatch = text.match(/Remaining issues?:\s*\n((?:[•\-*][^\n]+\n?)+)/i)
  const assessmentRaw = issuesMatch ? text.slice(0, text.search(/Remaining issues?:/i)).trim() : text.trim()
  if (!assessmentRaw && !issuesMatch) return null
  const parseBullets = (block: string) =>
    block.split("\n").map(l => l.replace(/^[•\-*]\s*/, "").replace(/\([0-9a-f]{7,10}\)/gi, "").trim()).filter(Boolean)
  return { assessment: assessmentRaw, issues: issuesMatch ? parseBullets(issuesMatch[1]) : [] }
}

// ── AI insights bottom sheet ─────────────────────────────────────────────────

function WeekInsightsSheet({ reasoning, locale, open, onClose }: { reasoning: string; locale: "es" | "en"; open: boolean; onClose: () => void }) {
  if (!open) return null
  const parsed = parseInsights(reasoning)
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-background rounded-t-2xl shadow-xl px-4 pt-4 pb-8 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-indigo-500" />
            <span className="text-[16px] font-semibold">{locale === "es" ? "Análisis IA" : "AI Insights"}</span>
          </div>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        {parsed ? (
          <div className="flex flex-col gap-3">
            {parsed.assessment && (
              <p className="text-[13px] leading-relaxed text-foreground/80">{parsed.assessment}</p>
            )}
            {parsed.issues.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{locale === "es" ? "Problemas restantes" : "Remaining issues"}</p>
                {parsed.issues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100">
                    <span className="mt-1 size-1.5 rounded-full bg-indigo-400 shrink-0" />
                    <p className="text-[13px] text-indigo-700 leading-snug">{issue}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-[13px] text-foreground/70 leading-relaxed">{reasoning}</p>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Week warnings bottom sheet ──────────────────────────────────────────────

function WeekWarningsSheet({ days, locale, open, onClose }: { days: RotaWeekData["days"]; locale: "es" | "en"; open: boolean; onClose: () => void }) {
  const allWarnings = days.flatMap((d) => d.warnings.map((w) => ({ day: d.date, ...w })))
  const allGaps = days.flatMap((d) => d.skillGaps.map((g) => ({ day: d.date, gap: g })))
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-background rounded-t-2xl shadow-xl px-4 pt-4 pb-8 max-h-[65vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[16px] font-semibold">{locale === "es" ? "Alertas de la semana" : "Week alerts"}</span>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        {allWarnings.length === 0 && allGaps.length === 0 ? (
          <div className="flex items-center gap-2 py-3">
            <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
            <span className="text-[14px] text-emerald-600">{locale === "es" ? "Sin alertas esta semana" : "No issues this week"}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {allGaps.map((item, i) => {
              const dayLabel = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { weekday: "short", day: "numeric" }).format(new Date(item.day + "T12:00:00"))
              return (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                  <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-medium text-red-700 capitalize">{dayLabel} · {locale === "es" ? "Habilidad sin cubrir" : "Uncovered skill"}</p>
                    <p className="text-[13px] text-red-600">{item.gap}</p>
                  </div>
                </div>
              )
            })}
            {allWarnings.map((w, i) => {
              const dayLabel = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { weekday: "short", day: "numeric" }).format(new Date(w.day + "T12:00:00"))
              return (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-100">
                  <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-medium text-amber-700 capitalize">{dayLabel}</p>
                    <p className="text-[13px] text-amber-600">{w.message}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ── Overflow menu ───────────────────────────────────────────────────────────

function WeekOverflow({ weekStart, data, onRefresh, highlightEnabled, onToggleHighlight, onGenerateWeek, weekViewMode, onToggleViewMode, deptColor, onToggleDeptColor, isFavourite, onSaveFavourite }: {
  weekStart: string; data: RotaWeekData | null; onRefresh?: () => void
  highlightEnabled?: boolean; onToggleHighlight?: () => void
  onGenerateWeek?: () => void
  weekViewMode?: "task" | "person"; onToggleViewMode?: () => void
  deptColor?: boolean; onToggleDeptColor?: () => void
  isFavourite?: boolean; onSaveFavourite?: () => void
}) {
  const t = useTranslations("schedule")
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
  }, [open])

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) {
      if (dropRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", h)
    document.addEventListener("touchstart", h as any)
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h as any) }
  }, [open])

  return (
    <div className="shrink-0">
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} className="size-9 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
        <MoreHorizontal className="size-5" />
      </button>
      {open && pos && createPortal(
        <div ref={dropRef} className="fixed z-[9999] w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1" style={{ top: pos.top, right: pos.right }}>
          <button
            onClick={() => { setOpen(false); onGenerateWeek?.() }}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors"
          >
            <Sparkles className="size-4" />
            {locale === "es" ? "Generar rota" : "Generate rota"}
          </button>
          <div className="h-px bg-border mx-3 my-0.5" />
          <button
            onClick={() => {
              setOpen(false)
              if (!data) return
              import("@/lib/export-pdf").then(({ exportPdfByShift, exportPdfByTask, exportPdfByPerson }) => {
                const orgEl = document.querySelector("[data-org-name]")
                const orgName = orgEl?.textContent ?? "LabRota"
                const notesEl = document.querySelector("[data-week-notes]")
                const noteTexts = notesEl
                  ? Array.from(notesEl.querySelectorAll("[data-note-text]")).map((el) => el.textContent ?? "").filter(Boolean)
                  : []
                const notes = noteTexts.length > 0 ? noteTexts : undefined
                if (weekViewMode === "person") {
                  exportPdfByPerson(data, orgName, locale, notes)
                } else if (data.rotaDisplayMode === "by_task") {
                  exportPdfByTask(data, data.tecnicas ?? [], orgName, locale, notes)
                } else {
                  exportPdfByShift(data, orgName, locale, notes)
                }
              })
            }}
            disabled={!data || data.days.every((d) => d.assignments.length === 0)}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors disabled:opacity-40"
          >
            <FileDown className="size-4" />
            {t("exportPdf")}
          </button>
          {onToggleViewMode && (
            <>
              <div className="h-px bg-border mx-3 my-0.5" />
              <button onClick={() => { onToggleViewMode(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                <Users className="size-4" />
                {locale === "es" ? "Por persona" : "By person"}
                {weekViewMode === "person" && <Check className="size-4 text-primary ml-auto" />}
              </button>
              {onToggleDeptColor && (
                <button onClick={() => { onToggleDeptColor(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                  <span className="size-3.5 rounded-full bg-gradient-to-br from-amber-400 via-blue-400 to-emerald-400 shrink-0" />
                  {locale === "es" ? "Colores personal" : "Staff colours"}
                  {deptColor && <Check className="size-4 text-primary ml-auto" />}
                </button>
              )}
            </>
          )}
          {onToggleHighlight && weekViewMode !== "person" && (
            <>
              <div className="h-px bg-border mx-3 my-0.5" />
              <button onClick={() => { onToggleHighlight(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                <span className="size-4 rounded-sm shrink-0" style={{ backgroundColor: "#FDE047" }} />
                {locale === "es" ? "Resaltar" : "Highlights"}
                {highlightEnabled && <Check className="size-4 text-primary ml-auto" />}
              </button>
            </>
          )}
          {onSaveFavourite && (
            <>
              <div className="h-px bg-border mx-3 my-0.5" />
              <button onClick={() => { onSaveFavourite(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                <Star className={cn("size-4", isFavourite ? "fill-amber-400 text-amber-400" : "")} />
                {locale === "es" ? "Guardar vista fav." : "Save as favourite"}
                {isFavourite && <Check className="size-4 text-primary ml-auto" />}
              </button>
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Generate week bottom sheet ──────────────────────────────────────────────

type GenStrategy = "ai_optimal" | "ai_hybrid" | "flexible_template" | "manual"

interface StrategyCard {
  key: GenStrategy
  icon: ReactNode
  label: string
  desc: string
  badgeLabel?: string
  badgeCls?: string
  speedLabel?: string
  speedCls?: string
}

function buildMobileStrategyCards(rotaDisplayMode: string, engineConfig: EngineConfig | undefined, locale: "es" | "en"): StrategyCard[] {
  const isByTask = rotaDisplayMode === "by_task"
  const cards: StrategyCard[] = []

  cards.push({
    key: "flexible_template",
    icon: <Bookmark className="size-5" />,
    label: locale === "es" ? "Plantilla" : "Template",
    desc: locale === "es" ? "Aplicar una plantilla guardada" : "Apply a saved template",
    badgeLabel: "TPL", badgeCls: "bg-green-500/10 text-green-600 border-green-500/20",
  })

  cards.push({
    key: "manual",
    icon: <Grid3X3 className="size-5" />,
    label: locale === "es" ? "Semana en blanco" : "Blank week",
    desc: locale === "es" ? "Empezar desde cero" : "Start from scratch",
    badgeLabel: "MANUAL", badgeCls: "bg-muted text-muted-foreground border-border",
  })

  cards.push({
    key: "ai_optimal",
    icon: <Sparkles className="size-5" />,
    label: locale === "es" ? "IA Óptima" : "AI Optimal",
    desc: isByTask
      ? (locale === "es" ? "Asignación óptima de tareas" : "Optimal task assignment")
      : (locale === "es" ? "Genera la rota óptima con IA" : "Generate optimal rota with AI"),
    badgeLabel: "IA", badgeCls: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    speedLabel: locale === "es" ? "Rápido" : "Fast", speedCls: "bg-emerald-500/10 text-emerald-600",
  })

  if (!isByTask && (engineConfig?.hybridEnabled ?? true)) {
    cards.push({
      key: "ai_hybrid",
      icon: <BrainCircuit className="size-5" />,
      label: locale === "es" ? "IA Híbrida" : "AI Hybrid",
      desc: locale === "es" ? "Mayor precisión, más lento" : "Higher accuracy, slower",
      badgeLabel: "HYBRID", badgeCls: "bg-purple-500/10 text-purple-600 border-purple-500/20",
      speedLabel: locale === "es" ? "Más lento" : "Slower", speedCls: "bg-amber-500/10 text-amber-600",
    })
  }

  return cards
}

function WeekGenerateSheet({ open, onClose, weekStart, onRefresh, locale, rotaDisplayMode, engineConfig }: {
  open: boolean; onClose: () => void; weekStart: string; onRefresh: () => void; locale: "es" | "en"
  rotaDisplayMode: string; engineConfig?: EngineConfig
}) {
  const [selected, setSelected] = useState<GenStrategy | null>(null)
  const [generating, setGenerating] = useState(false)
  const [templates, setTemplates] = useState<RotaTemplate[]>([])
  const [selectedTplId, setSelectedTplId] = useState<string | null>(null)
  const [loadingTpl, setLoadingTpl] = useState(false)

  useEffect(() => {
    if (!open) { setSelected(null); setSelectedTplId(null); return }
    setLoadingTpl(true)
    getTemplates().then((d) => { setTemplates(d); setLoadingTpl(false) })
  }, [open])

  if (!open) return null

  const cards = buildMobileStrategyCards(rotaDisplayMode, engineConfig, locale)
  const needsTemplate = selected === "flexible_template"
  const canGenerate = selected && (!needsTemplate || selectedTplId) && !generating

  async function handleGenerate() {
    if (!selected || generating) return
    setGenerating(true)
    try {
      if (selected === "flexible_template" && selectedTplId) {
        await applyTemplate(selectedTplId, weekStart, false)
      } else if (selected === "manual") {
        await generateRota(weekStart, false, "manual")
      } else {
        await generateRota(weekStart, true, selected as "ai_optimal" | "ai_hybrid")
      }
      toast.success(locale === "es" ? "Rota generada" : "Rota generated")
      onRefresh(); onClose()
    } catch {
      toast.error(locale === "es" ? "Error al generar" : "Generation failed")
    } finally { setGenerating(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-background rounded-t-2xl shadow-xl px-4 pt-4 pb-8 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[16px] font-semibold">{locale === "es" ? "Generar semana" : "Generate week"}</span>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
            <X className="size-4" />
          </button>
        </div>

        {/* Strategy cards — 2×2 grid */}
        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {cards.map((card) => {
            const isSelected = selected === card.key
            return (
              <button
                key={card.key}
                onClick={() => { setSelected(card.key); setSelectedTplId(null) }}
                className={cn(
                  "flex flex-col items-start gap-1.5 rounded-xl p-3 text-left transition-all",
                  isSelected ? "bg-primary/10" : "bg-muted/50 active:bg-muted"
                )}
                style={{ border: `2px solid ${isSelected ? "var(--primary)" : "var(--border)"}` }}
              >
                <div className={isSelected ? "text-primary" : "text-muted-foreground"}>{card.icon}</div>
                <p className={cn("text-[13px] font-semibold leading-tight", isSelected && "text-primary")}>{card.label}</p>
                <p className="text-[11px] text-muted-foreground leading-snug">{card.desc}</p>
                {card.speedLabel && (
                  <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", card.speedCls)}>{card.speedLabel}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Template selector */}
        {needsTemplate && (
          <div className="mb-3">
            {loadingTpl ? (
              <div className="h-10 rounded-lg bg-muted animate-pulse" />
            ) : templates.length === 0 ? (
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5">
                <p className="text-[12px] text-amber-600">{locale === "es" ? "No hay plantillas guardadas" : "No saved templates"}</p>
              </div>
            ) : (
              <select
                value={selectedTplId ?? ""}
                onChange={(e) => setSelectedTplId(e.target.value || null)}
                className="w-full rounded-lg border border-border px-3 py-2.5 text-[14px] outline-none bg-background"
              >
                <option value="">{locale === "es" ? "Seleccionar plantilla…" : "Select template…"}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                ))}
              </select>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-border text-[14px] font-medium text-muted-foreground active:bg-accent transition-colors">
            {locale === "es" ? "Cancelar" : "Cancel"}
          </button>
          <button
            disabled={!canGenerate}
            onClick={handleGenerate}
            className="flex-1 py-3 rounded-xl bg-primary text-white text-[14px] font-semibold active:bg-primary/90 transition-colors disabled:opacity-40"
          >
            {generating ? (locale === "es" ? "Generando…" : "Generating…") : (locale === "es" ? "Generar" : "Generate")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Main component ──────────────────────────────────────────────────────────

export function MobileWeekClient() {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale() as "es" | "en"
  const [weekStart, setWeekStart] = useState(() => getMondayOfWeek(new Date()))
  const [data, setData] = useState<RotaWeekData | null>(null)
  const [staffList, setStaffList] = useState<StaffWithSkills[]>([])
  const [loading, setLoading] = useState(true)
  const weekGridRef = useRef<HTMLDivElement>(null)
  const [highlightEnabled, setHighlightEnabled] = useState(() => {
    if (typeof window === "undefined") return false
    return localStorage.getItem("labrota_week_highlight") === "true"
  })
  const [highlightedStaff, setHighlightedStaff] = useState<string | null>(null)
  const [warningsOpen, setWarningsOpen] = useState(false)
  const [insightsOpen, setInsightsOpen] = useState(false)
  const [generateModalOpen, setGenerateModalOpen] = useState(false)
  const [weekViewMode, setWeekViewMode] = useState<"task" | "person">(() => {
    if (typeof window === "undefined") return "task"
    try {
      const fav = JSON.parse(localStorage.getItem("labrota_week_favourite") ?? "{}")
      return fav.weekViewMode === "person" ? "person" : "task"
    } catch { return "task" }
  })
  const [mobileDeptColor, setMobileDeptColor] = useState(() => {
    if (typeof window === "undefined") return true
    try {
      const fav = JSON.parse(localStorage.getItem("labrota_week_favourite") ?? "{}")
      if (fav.mobileDeptColor !== undefined) return fav.mobileDeptColor as boolean
    } catch {}
    return localStorage.getItem("labrota_mobile_dept_color") !== "false"
  })
  const [weekFavourite, setWeekFavourite] = useState<{ weekViewMode: string; mobileDeptColor: boolean } | null>(() => {
    if (typeof window === "undefined") return null
    try { return JSON.parse(localStorage.getItem("labrota_week_favourite") ?? "null") } catch { return null }
  })

  function toggleHighlight() {
    const next = !highlightEnabled
    setHighlightEnabled(next)
    localStorage.setItem("labrota_week_highlight", String(next))
    if (!next) setHighlightedStaff(null)
  }

  function toggleMobileDeptColor() {
    const next = !mobileDeptColor
    setMobileDeptColor(next)
    localStorage.setItem("labrota_mobile_dept_color", String(next))
  }

  const isFavourite = weekFavourite !== null &&
    weekFavourite.weekViewMode === weekViewMode &&
    weekFavourite.mobileDeptColor === mobileDeptColor

  function saveFavourite() {
    const fav = { weekViewMode, mobileDeptColor }
    setWeekFavourite(fav)
    localStorage.setItem("labrota_week_favourite", JSON.stringify(fav))
    toast.success(locale === "es" ? "Vista guardada como favorita" : "View saved as favourite")
  }

  useEffect(() => {
    setLoading(true)
    Promise.all([getRotaWeek(weekStart), getActiveStaff()]).then(([rotaData, staff]) => {
      setData(rotaData)
      setStaffList(staff)
      setLoading(false)
    })
  }, [weekStart])

  function navigate(dir: number) {
    const d = new Date(weekStart + "T12:00:00")
    d.setDate(d.getDate() + dir * 7)
    setWeekStart(getMondayOfWeek(d))
  }

  const today = new Date().toISOString().split("T")[0]
  const currentWeek = getMondayOfWeek(new Date())
  const isCurrentWeek = weekStart === currentWeek

  const days = data?.days ?? []
  const shiftTypes = data?.shiftTypes?.filter((s) => s.active !== false) ?? []
  const shiftTypeMap = Object.fromEntries(shiftTypes.map((s) => [s.code, s]))
  const timeFormat = data?.timeFormat ?? "24h"

  // Build staff role/name map from staffList for the Off row
  const fullStaffMap = useMemo(() => {
    const m: Record<string, { fn: string; ln: string; role: string; dpw: number }> = {}
    for (const s of staffList) m[s.id] = { fn: s.first_name, ln: s.last_name, role: s.role, dpw: s.days_per_week }
    return m
  }, [staffList])

  // Department color map from org config
  const deptColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const dept of data?.departments ?? []) if (dept.colour) m[dept.code] = dept.colour
    return m
  }, [data?.departments])

  // Per-staff highlight color (individual color field)
  const staffColorLookup = useMemo(() => {
    const m: Record<string, string> = {}
    for (const s of staffList) if (s.color) m[s.id] = s.color
    return m
  }, [staffList])

  const hasWarnings = days.some((d) => d.warnings.length > 0 || d.skillGaps.length > 0)
  const warningCount = days.reduce((acc, d) => acc + d.warnings.length + d.skillGaps.length, 0)

  const LEAVE_ICONS: Record<string, typeof Plane> = { annual: Plane, sick: Cross, personal: User, training: GraduationCap, maternity: Baby, other: CalendarX }
  const LEAVE_COLORS: Record<string, { border: string; bg: string; text: string }> = {
    annual:    { border: "#7DD3FC", bg: "#F0F9FF", text: "#0369A1" },
    sick:      { border: "#FCA5A5", bg: "#FEF2F2", text: "#DC2626" },
    personal:  { border: "#C4B5FD", bg: "#F5F3FF", text: "#7C3AED" },
    training:  { border: "#FCD34D", bg: "#FFFBEB", text: "#D97706" },
    maternity: { border: "#F9A8D4", bg: "#FDF2F8", text: "#DB2777" },
    other:     { border: "#CBD5E1", bg: "#F8FAFC", text: "#475569" },
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Sticky week toolbar */}
      <div className="flex items-center gap-1 h-14 px-3 border-b border-border bg-background sticky top-0 z-10">
        <button
          onClick={() => setWeekStart(currentWeek)}
          disabled={isCurrentWeek}
          className={cn("text-[12px] font-medium px-2 py-1 rounded-md transition-colors shrink-0", isCurrentWeek ? "text-muted-foreground/30" : "text-primary active:bg-primary/10")}
        >
          {tc("today")}
        </button>

        <button onClick={() => navigate(-1)} className="size-8 flex items-center justify-center rounded-full active:bg-accent shrink-0">
          <ChevronLeft className="size-4 text-muted-foreground" />
        </button>

        <WeekPicker weekStart={weekStart} locale={locale} onSelect={setWeekStart} />

        <button onClick={() => navigate(1)} className="size-8 flex items-center justify-center rounded-full active:bg-accent shrink-0">
          <ChevronRight className="size-4 text-muted-foreground" />
        </button>

        <div className="flex-1" />

        {/* Warnings button */}
        <button onClick={() => setWarningsOpen(true)} className={cn(
          "flex items-center justify-center gap-1 rounded-full active:bg-accent shrink-0",
          hasWarnings ? "h-9 px-2" : "size-9"
        )}>
          {hasWarnings
            ? <>
                <AlertTriangle className="size-5 text-amber-500 shrink-0" />
                {warningCount > 0 && <span className="text-[13px] font-semibold text-amber-500 leading-none">{warningCount}</span>}
              </>
            : <Check className="size-5 text-emerald-500" />}
        </button>

        {data?.aiReasoning && (
          <button onClick={() => setInsightsOpen(true)} className="size-9 flex items-center justify-center rounded-full active:bg-accent shrink-0">
            <BrainCircuit className="size-5 text-indigo-500" />
          </button>
        )}

        <WeekOverflow
          weekStart={weekStart}
          data={data}
          highlightEnabled={highlightEnabled}
          onToggleHighlight={toggleHighlight}
          weekViewMode={weekViewMode}
          onToggleViewMode={() => setWeekViewMode((m) => m === "task" ? "person" : "task")}
          onGenerateWeek={() => setGenerateModalOpen(true)}
          deptColor={mobileDeptColor}
          onToggleDeptColor={toggleMobileDeptColor}
          isFavourite={isFavourite}
          onSaveFavourite={saveFavourite}
          onRefresh={() => {
            setLoading(true)
            Promise.all([getRotaWeek(weekStart), getActiveStaff()]).then(([rotaData, staff]) => {
              setData(rotaData); setStaffList(staff); setLoading(false)
            })
          }}
        />
      </div>

      {/* Scrollable grid */}
      <div ref={weekGridRef} className="flex-1 overflow-auto" onClick={() => highlightedStaff && setHighlightedStaff(null)}>
        {loading ? (
          <div className="p-3 flex flex-col gap-1.5 animate-pulse">
            <div className="grid grid-cols-8 gap-1">
              <div className="h-10 rounded-md bg-muted-foreground/15" />
              {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-10 rounded-md bg-muted-foreground/15" />)}
            </div>
            {Array.from({ length: 5 }).map((_, r) => (
              <div key={r} className="grid grid-cols-8 gap-1">
                <div className="h-14 rounded-md bg-muted-foreground/12" />
                {Array.from({ length: 7 }).map((_, c) => <div key={c} className="h-14 rounded-md bg-muted-foreground/10" />)}
              </div>
            ))}
            <div className="grid grid-cols-8 gap-1">
              <div className="h-8 rounded-md bg-muted-foreground/8" />
              {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-8 rounded-md bg-muted-foreground/6" />)}
            </div>
          </div>
        ) : !data || days.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-[13px]">{t("noRota")}</div>
        ) : (
          <div className="min-w-[600px] pb-[100px]">
            {/* Header: days */}
            <div className="sticky top-0 z-10 grid border-b border-border bg-muted" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
              <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[6]" />
              {days.map((day) => {
                const date = new Date(day.date + "T12:00:00")
                const dow = date.getDay()
                const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date)
                const num = date.getDate()
                const isToday = day.date === today
                const isSat = dow === 6
                const isSun = dow === 0
                const isWknd = isSat || isSun
                const isHoliday = !!data?.publicHolidays?.[day.date]
                return (
                  <div
                    key={day.date}
                    className="px-1 py-2 text-center border-r border-border last:border-r-0"
                    style={isHoliday ? { backgroundColor: "rgb(254 243 199 / 0.8)" } : isWknd ? { backgroundColor: "#D8E4F3" } : undefined}
                  >
                    <p className={cn("text-[10px] uppercase", isToday ? "text-primary font-semibold" : "text-muted-foreground")}>{wday}</p>
                    {isToday ? (
                      <span className="inline-flex items-center justify-center size-7 rounded-full bg-primary text-primary-foreground text-[14px] font-bold">{num}</span>
                    ) : (
                      <p className={cn("text-[14px] font-semibold", (isSat || isSun) && "text-muted-foreground")}>{num}</p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Rows */}
            {weekViewMode === "person" ? (
              // ── Person view ─────────────────────────────────────────────
              <>
                {(() => {
                  const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
                  return staffList
                    .filter((s) => days.some((d) => d.assignments.some((a) => a.staff_id === s.id)))
                    .sort((a, b) => {
                      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
                      if (ro !== 0) return ro
                      return a.first_name.localeCompare(b.first_name)
                    })
                })().map((s) => {
                  const isHL = highlightEnabled && highlightedStaff === s.id
                  const roleColor = deptColorMap[s.role] ?? ROLE_COLOR[s.role] ?? "#94A3B8"
                  const hlColor = staffColorLookup[s.id] ?? roleColor
                  return (
                    <div key={s.id} className="grid border-b border-border" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
                      <div
                        className="border-r border-border bg-muted sticky left-0 z-[5] flex items-center pl-1.5 pr-1 py-1.5 gap-1 cursor-pointer min-w-0"
                        style={mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : undefined}
                        onClick={() => highlightEnabled && setHighlightedStaff((p) => p === s.id ? null : s.id)}
                      >
                        <div className="min-w-0">
                          <p className="text-[10px] font-semibold text-foreground truncate leading-tight">{s.first_name} {s.last_name[0]}.</p>
                        </div>
                      </div>
                      {days.map((day) => {
                        const a = day.assignments.find((x) => x.staff_id === s.id)
                        const st = a ? shiftTypeMap[a.shift_type] : null
                        const dow = new Date(day.date + "T12:00:00").getDay()
                        const isSat = dow === 6; const isSun = dow === 0
                        return (
                          <div key={day.date} className="px-0.5 py-1 border-r border-border last:border-r-0 flex flex-col items-center justify-center min-w-0">
                            {a && st ? (
                              <TapPopover trigger={
                                <div
                                  className="w-full text-center cursor-pointer active:opacity-70"
                                  style={isHL ? { color: hlColor, fontWeight: 700 } : undefined}
                                >
                                  <span className="text-[11px] font-semibold leading-tight">{a.shift_type}</span>
                                </div>
                              }>
                                <p className="font-medium">{s.first_name} {s.last_name}</p>
                                <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[s.role] ?? s.role}</p>
                                <p className="text-[11px] opacity-70">{a.shift_type} · {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}</p>
                              </TapPopover>
                            ) : (
                              <span className="text-[10px] font-medium text-muted-foreground/40">{locale === "es" ? "Lib" : "Off"}</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
                {/* Shift times legend */}
                {shiftTypes.length > 0 && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5 border-b border-border bg-muted/30">
                    {shiftTypes.map((st) => (
                      <span key={st.code} className="text-[11px] text-muted-foreground">
                        <span className="font-medium text-foreground">{st.code}</span> {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : data.rotaDisplayMode === "by_task" && data.tecnicas ? (
              data.tecnicas.filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden).map((tec) => {
                const NAMED_COLORS: Record<string, string> = { amber: "#F59E0B", blue: "#3B82F6", green: "#10B981", purple: "#8B5CF6", coral: "#EF4444", teal: "#14B8A6", slate: "#64748B", red: "#EF4444" }
                const dotColor = tec.color?.startsWith("#") ? tec.color : (NAMED_COLORS[tec.color] ?? "#3B82F6")
                return (
                  <div key={tec.id} className="grid border-b border-border" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
                    <div className="border-r border-border bg-muted sticky left-0 z-[5] flex items-stretch">
                      <div className="w-[3px] shrink-0" style={{ backgroundColor: dotColor }} />
                      <div className="px-1 py-2 flex flex-col items-end justify-center flex-1">
                        <span className="text-[11px] font-semibold text-foreground">{tec.codigo}</span>
                        {tec.typical_shifts?.[0] && shiftTypeMap[tec.typical_shifts[0]] && (
                          <span className="text-[8px] text-muted-foreground tabular-nums">{formatTime(shiftTypeMap[tec.typical_shifts[0]].start_time, timeFormat)}</span>
                        )}
                      </div>
                    </div>
                    {days.map((day) => {
                      const assignments = day.assignments.filter((a) => a.function_label === tec.codigo || a.tecnica_id === tec.id)
                      const dow = new Date(day.date + "T12:00:00").getDay()
                      const isSat = dow === 6; const isSun = dow === 0
                      return (
                        <div key={day.date} className="px-1 py-2 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-1 content-start">
                          {assignments.map((a) => {
                            const isHL = highlightEnabled && highlightedStaff === a.staff_id
                            const roleColor = deptColorMap[a.staff.role] ?? ROLE_COLOR[a.staff.role] ?? "#94A3B8"
                            const hlColor = staffColorLookup[a.staff_id] ?? roleColor
                            const offDays = days.filter((d) => !d.assignments.some((x) => x.staff_id === a.staff_id))
                            const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                            const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                            return (
                              <TapPopover key={a.id} trigger={
                                <span
                                  className="text-[11px] font-medium rounded px-1.5 py-1 border cursor-pointer active:scale-95 transition-colors"
                                  style={isHL
                                    ? { backgroundColor: hlColor, borderColor: hlColor, color: contrastColor(hlColor) }
                                    : mobileDeptColor
                                      ? { borderColor: "var(--border)", backgroundColor: "var(--background)", borderLeft: `3px solid ${roleColor}` }
                                      : { borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                                  onClick={() => highlightEnabled && setHighlightedStaff((p) => p === a.staff_id ? null : a.staff_id)}
                                >
                                  {a.staff.first_name[0]}{a.staff.last_name[0]}
                                </span>
                              }>
                                <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                                <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[a.staff.role] ?? a.staff.role}{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                              </TapPopover>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )
              })
            ) : (
              shiftTypes.map((st) => (
                <div key={st.code} className="grid border-b border-border" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
                  <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[5] flex flex-col items-end justify-center">
                    <span className="text-[13px] font-bold text-foreground">{st.code}</span>
                    <span className="text-[10px] text-muted-foreground tabular-nums">{formatTime(st.start_time, timeFormat)}</span>
                    <span className="text-[9px] text-muted-foreground/60 tabular-nums">{formatTime(st.end_time, timeFormat)}</span>
                  </div>
                  {days.map((day) => {
                    const assignments = day.assignments.filter((a) => a.shift_type === st.code)
                    const dow = new Date(day.date + "T12:00:00").getDay()
                    const isSat = dow === 6; const isSun = dow === 0
                    const activeDays = (shiftTypeMap[st.code] as { active_days?: string[] })?.active_days
                    const dowKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][dow]
                    const isActive = !activeDays || activeDays.includes(dowKey)
                    return (
                      <div key={day.date} className={cn(
                        "px-1 py-2 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-col gap-1",
                        !isActive && "bg-muted/40"
                      )}>
                        {!isActive ? (
                          <span className="text-[8px] text-muted-foreground/30 italic self-center mt-auto mb-auto">—</span>
                        ) : assignments.map((a) => {
                          const isHL = highlightEnabled && highlightedStaff === a.staff_id
                          const roleColor = deptColorMap[a.staff.role] ?? ROLE_COLOR[a.staff.role] ?? "#94A3B8"
                          const hlColor = staffColorLookup[a.staff_id] ?? roleColor
                          const offDays = days.filter((d) => !d.assignments.some((x) => x.staff_id === a.staff_id))
                          const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                          const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                          return (
                            <TapPopover key={a.id} trigger={
                              <div
                                className="text-[12px] font-medium rounded px-1.5 py-1 border truncate cursor-pointer active:scale-95 transition-colors"
                                style={isHL
                                  ? { backgroundColor: hlColor, borderColor: hlColor, color: contrastColor(hlColor) }
                                  : mobileDeptColor
                                    ? { borderColor: "var(--border)", backgroundColor: "var(--background)", borderLeft: `3px solid ${roleColor}` }
                                    : { borderColor: "var(--border)", backgroundColor: "var(--background)" }}
                                onClick={() => highlightEnabled && setHighlightedStaff((p) => p === a.staff_id ? null : a.staff_id)}
                              >
                                {a.staff.first_name} {a.staff.last_name[0]}.
                              </div>
                            }>
                              <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                              <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[a.staff.role] ?? a.staff.role}{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                            </TapPopover>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))
            )}

            {/* Off / Libres row — hidden in person view */}
            {weekViewMode !== "person" && <div className="grid border-b border-border" style={{ gridTemplateColumns: `52px repeat(${days.length}, 1fr)` }}>
              <div className="px-1 py-2 border-r border-border bg-muted sticky left-0 z-[5] flex items-center justify-end">
                <span className="text-[9px] font-semibold tracking-wide text-muted-foreground uppercase">{locale === "es" ? "Lib" : "Off"}</span>
              </div>
              {days.map((day) => {
                const leaveIds = new Set(data?.onLeaveByDate?.[day.date] ?? [])
                const leaveTypes = data?.onLeaveTypeByDate?.[day.date] ?? {}
                const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
                const offDuty = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id))
                const dow = new Date(day.date + "T12:00:00").getDay()
                const isSat = dow === 6; const isSun = dow === 0
                return (
                  <div key={day.date} className="px-0.5 py-1 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-0.5 content-start" style={{ backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" }}>
                    {[...leaveIds].map((sid) => {
                      const s = fullStaffMap[sid]
                      const lType = (leaveTypes[sid] ?? "other") as keyof typeof LEAVE_ICONS
                      const LeaveIcon = LEAVE_ICONS[lType] ?? CalendarX
                      const colors = LEAVE_COLORS[lType] ?? LEAVE_COLORS.other
                      return (
                        <TapPopover key={sid} trigger={
                          <span className="inline-flex items-center gap-0.5 text-[8px] font-medium rounded px-0.5 py-0.5 border cursor-pointer active:scale-95"
                            style={{ borderColor: colors.border, backgroundColor: colors.bg, color: colors.text }}>
                            <LeaveIcon className="size-2 shrink-0" />
                            {s ? `${s.fn[0]}${s.ln[0]}` : "?"}
                          </span>
                        }>
                          <p className="font-medium">{s ? `${s.fn} ${s.ln}` : (locale === "es" ? "Baja" : "On leave")}</p>
                          <p className="text-[11px] opacity-70">{lType}</p>
                        </TapPopover>
                      )
                    })}
                    {offDuty.map((s) => {
                      const isHL = highlightEnabled && highlightedStaff === s.id
                      const hlColor = staffColorLookup[s.id] ?? deptColorMap[s.role] ?? ROLE_COLOR[s.role] ?? "#94A3B8"
                      return (
                        <TapPopover key={s.id} trigger={
                          <span
                            className="inline-flex items-center text-[11px] px-1.5 py-0.5 font-medium rounded border cursor-pointer active:scale-95 transition-colors"
                            style={isHL ? { backgroundColor: hlColor, borderColor: hlColor, color: contrastColor(hlColor) } : { borderColor: "var(--border)", backgroundColor: "var(--background)", color: "var(--muted-foreground)" }}
                            onClick={() => highlightEnabled && setHighlightedStaff((p) => p === s.id ? null : s.id)}
                          >
                            {s.first_name[0]}{s.last_name[0]}
                          </span>
                        }>
                          <p className="font-medium">{s.first_name} {s.last_name}</p>
                          <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[s.role] ?? s.role} · {s.days_per_week}d</p>
                        </TapPopover>
                      )
                    })}
                  </div>
                )
              })}
            </div>}

            {/* Week notes */}
            <div data-week-notes className="px-3 pt-3">
              <WeekNotes weekStart={weekStart} />
            </div>
          </div>
        )}
      </div>

      {/* Warnings bottom sheet */}
      <WeekWarningsSheet days={days} locale={locale} open={warningsOpen} onClose={() => setWarningsOpen(false)} />

      {/* AI insights bottom sheet */}
      {data?.aiReasoning && (
        <WeekInsightsSheet reasoning={data.aiReasoning} locale={locale} open={insightsOpen} onClose={() => setInsightsOpen(false)} />
      )}

      {/* Generate week bottom sheet */}
      <WeekGenerateSheet
        open={generateModalOpen}
        onClose={() => setGenerateModalOpen(false)}
        weekStart={weekStart}
        locale={locale}
        rotaDisplayMode={data?.rotaDisplayMode ?? "by_shift"}
        engineConfig={data?.engineConfig}
        onRefresh={() => {
          setLoading(true)
          Promise.all([getRotaWeek(weekStart), getActiveStaff()]).then(([rotaData, staff]) => {
            setData(rotaData); setStaffList(staff); setLoading(false)
          })
        }}
      />
    </div>
  )
}
