"use client"

import { useState, useEffect } from "react"
import type { ReactNode } from "react"
import { createPortal } from "react-dom"
import { Sparkles, Grid3X3, Bookmark, BrainCircuit, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { generateRota, getTemplates, applyTemplate } from "@/app/(clinic)/rota/actions"
import type { RotaTemplate, EngineConfig } from "@/lib/types/database"
import { toast } from "sonner"

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

export function WeekGenerateSheet({ open, onClose, weekStart, onRefresh, locale, rotaDisplayMode, engineConfig }: {
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
