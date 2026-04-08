"use client"

import { useEffect, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { AlertTriangle, BrainCircuit, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { RotaTemplate, EngineConfig } from "@/lib/types/database"
import {
  getTemplates,
  applyTemplate,
  saveAsTemplate,
  getHybridUsage,
  type RotaMonthSummary,
} from "@/app/(clinic)/rota/actions"
import { formatDate } from "@/lib/format-date"
import { buildStrategyCards, parseHybridInsights, type GenerationStrategy } from "./utils"
import { TODAY } from "./constants"

export function GenerationStrategyModal({ open, weekStart, weekLabel, onClose, onGenerate, rotaDisplayMode, engineConfig }: {
  open: boolean; weekStart: string; weekLabel: string
  onClose: () => void
  onGenerate: (strategy: GenerationStrategy, templateId?: string) => void
  rotaDisplayMode: string
  engineConfig?: EngineConfig
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale()
  const [selected, setSelected] = useState<GenerationStrategy | null>(null)
  const [templates, setTemplates] = useState<RotaTemplate[]>([])
  const [loadingTpl, setLoadingTpl] = useState(false)
  const [selectedTplId, setSelectedTplId] = useState<string | null>(null)
  const [hybridQuota, setHybridQuota] = useState<{ used: number; limit: number; remaining: number } | null>(null)

  useEffect(() => {
    if (!open) { setSelected(null); setSelectedTplId(null); return }
    setLoadingTpl(true)
    getTemplates().then((d) => { setTemplates(d); setLoadingTpl(false) })
    getHybridUsage().then(setHybridQuota)
  }, [open])

  if (!open) return null

  const needsTemplate = selected === "flexible_template"
  const hybridExhausted = hybridQuota !== null && hybridQuota.remaining <= 0
  const canGenerate = selected && (!needsTemplate || selectedTplId) && !(selected === "ai_hybrid" && hybridExhausted)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-[520px] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border shrink-0">
          <p className="text-[15px] font-medium">{t("generateScheduleFor", { week: weekLabel })}</p>
        </div>

        {/* Strategy cards — 2×2 grid */}
        <div className="p-4 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            {buildStrategyCards(rotaDisplayMode, engineConfig).map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => { setSelected(card.key); setSelectedTplId(null) }}
                className={cn(
                  "relative flex flex-col items-start gap-2 rounded-lg p-3.5 text-left transition-all",
                  selected === card.key
                    ? "bg-primary/10"
                    : "hover:bg-muted"
                )}
                style={{ border: `2px solid ${selected === card.key ? "var(--primary)" : "var(--border)"}` }}
              >
                <div className={selected === card.key ? "text-primary" : "text-muted-foreground"}>{card.icon}</div>
                <p className={cn("text-[14px] font-medium leading-tight", selected === card.key && "text-primary")}>{t(card.titleKey)}</p>
                <p className="text-[12px] text-muted-foreground leading-snug">{t(card.descKey)}</p>
                {card.speed && (
                  <span className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                    card.speed === "fast"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                  )}>
                    {card.speed === "fast"
                      ? (locale === "es" ? "Rápido" : "Fast")
                      : (locale === "es" ? "Más lento" : "Slower")}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Template selector — shown when a template strategy is selected */}
          {needsTemplate && (
            <div className="mt-4">
              {loadingTpl ? (
                <div className="shimmer-bar h-10 w-full rounded-lg" />
              ) : templates.length === 0 ? (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                  <p className="text-[13px] text-amber-600 dark:text-amber-400">{t("noTemplatesSaved")}</p>
                  <p className="text-[12px] text-amber-600 dark:text-amber-400 mt-0.5">
                    {t("noTemplatesSavedHint")}
                  </p>
                </div>
              ) : (
                <select
                  value={selectedTplId ?? ""}
                  onChange={(e) => setSelectedTplId(e.target.value || null)}
                  className="w-full rounded-lg border border-border px-3 py-2.5 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                >
                  <option value="">{t("selectTemplate")}</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.assignments.length} asignaciones)
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border shrink-0 flex flex-col gap-2">
          {/* Hybrid quota warning */}
          {hybridQuota !== null && selected === "ai_hybrid" && hybridQuota.remaining <= 3 && (
            <div className={cn(
              "rounded-lg px-3 py-2 text-[12px] flex items-center gap-2",
              hybridQuota.remaining === 0
                ? "bg-destructive/10 text-destructive"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
            )}>
              <span className="shrink-0">⚡</span>
              {hybridQuota.remaining === 0
                ? (locale === "es" ? `Límite diario alcanzado (${hybridQuota.limit}/día). Vuelve mañana.` : `Daily limit reached (${hybridQuota.limit}/day). Try again tomorrow.`)
                : (locale === "es" ? `${hybridQuota.remaining} generación${hybridQuota.remaining !== 1 ? "es" : ""} híbrida${hybridQuota.remaining !== 1 ? "s" : ""} restante${hybridQuota.remaining !== 1 ? "s" : ""} hoy` : `${hybridQuota.remaining} hybrid generation${hybridQuota.remaining !== 1 ? "s" : ""} left today`)
              }
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>{tc("cancel")}</Button>
            <Button
              size="sm"
              disabled={!canGenerate}
              onClick={() => { if (selected) onGenerate(selected, selectedTplId ?? undefined) }}
            >
              {tc("generate")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── AI Reasoning modal ───────────────────────────────────────────────────────

export function AIReasoningModal({ open, reasoning, onClose, variant = "claude" }: {
  open: boolean; reasoning: string; onClose: () => void; variant?: "claude" | "hybrid"
}) {
  const t = useTranslations("schedule")

  if (!open) return null

  // Always try to parse — hybrid format is self-identifying (contains "Changes:" / "Remaining issues:")
  const parsed = parseHybridInsights(reasoning)

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-[560px] max-w-[90vw] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BrainCircuit className={cn("size-4", variant === "hybrid" ? "text-purple-600" : "text-amber-600")} />
            <p className="text-[15px] font-medium">{variant === "hybrid" ? t("hybridReasoningTitle") : t("aiReasoningTitle")}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {parsed ? (
            <div className="flex flex-col gap-5">
              {/* General assessment */}
              {parsed.assessment && (
                <p className="text-[13px] leading-relaxed text-foreground/80">{parsed.assessment}</p>
              )}

              {/* Remaining issues */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <div className={cn("size-2 rounded-full", parsed.issues.length === 0 ? "bg-emerald-500" : "bg-amber-500")} />
                  <p className="text-[13px] font-medium text-foreground">{t("hybridRemainingIssues")}</p>
                </div>
                {parsed.issues.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground pl-3.5">{t("hybridNoIssues")}</p>
                ) : (
                  <ul className="flex flex-col gap-2 pl-3.5">
                    {parsed.issues.map((issue, i) => (
                      <li key={i} className="text-[13px] text-foreground/80 leading-snug">{issue}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[13px] leading-relaxed whitespace-pre-wrap text-foreground/80">
              {reasoning}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Save template modal ──────────────────────────────────────────────────────

export function SaveTemplateModal({ open, weekStart, onClose, onSaved }: {
  open: boolean; weekStart: string; onClose: () => void; onSaved: () => void
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setName("") }, [open])

  if (!open) return null

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    const result = await saveAsTemplate(weekStart, name.trim())
    setSaving(false)
    if (result.error) { toast.error(result.error); return }
    toast.success(t("templateSaved"))
    onSaved()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-[380px] p-5">
        <p className="text-[14px] font-medium mb-3">{t("saveAsTemplate")}</p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSave() }}
          placeholder={t("templateName")}
          className="w-full rounded-lg border border-border px-3 py-2 text-[14px] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>{tc("cancel")}</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !name.trim()}>{t("save")}</Button>
        </div>
      </div>
    </div>
  )
}

// ── Apply template modal ─────────────────────────────────────────────────────

export function ApplyTemplateModal({ open, weekStart, onClose, onApplied }: {
  open: boolean; weekStart: string; onClose: () => void; onApplied: () => void
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale() as "es" | "en"
  const [templates, setTemplates] = useState<RotaTemplate[]>([])
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    getTemplates().then((d) => { setTemplates(d); setLoading(false) })
  }, [open])

  if (!open) return null

  async function handleApply(id: string) {
    setApplying(id)
    const result = await applyTemplate(id, weekStart)
    setApplying(null)
    if (result.error) { toast.error(result.error); return }
    if (result.skipped && result.skipped.length > 0) {
      toast.info(t("templateAppliedSkipped", { count: result.skipped.length }))
    } else {
      toast.success(t("templateApplied"))
    }
    onApplied()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-background rounded-xl border border-border shadow-xl w-[440px] max-h-[70vh] flex flex-col">
        <div className="px-5 py-4 border-b border-border shrink-0">
          <p className="text-[14px] font-medium">{t("applyTemplate")}</p>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => <div key={i} className="shimmer-bar h-16 w-full rounded-lg" />)}
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-[14px] font-medium text-muted-foreground">{t("noTemplates")}</p>
              <p className="text-[13px] text-muted-foreground mt-1">{t("noTemplatesDescription")}</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {templates.map((tpl) => (
                <div
                  key={tpl.id}
                  className="rounded-lg border border-border p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors cursor-pointer flex items-center justify-between"
                  onClick={() => handleApply(tpl.id)}
                >
                  <div>
                    <p className="text-[13px] font-medium">{tpl.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {tpl.assignments.length} {t("assignments")} · {formatDate(tpl.created_at, locale)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={applying === tpl.id}
                    onClick={(e) => { e.stopPropagation(); handleApply(tpl.id) }}
                  >
                    {applying === tpl.id ? "…" : t("apply")}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-border shrink-0 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>{tc("cancel")}</Button>
        </div>
      </div>
    </div>
  )
}

export function MultiWeekScopeDialog({ monthSummary, onClose, onSelectScope }: {
  monthSummary: RotaMonthSummary
  onClose: () => void
  onSelectScope: (weekStarts: string[]) => void
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale()

  const allWeekStarts: string[] = []
  for (let i = 0; i < monthSummary.days.length; i += 7) {
    if (monthSummary.days[i]) allWeekStarts.push(monthSummary.days[i].date)
  }
  const publishedSet = new Set(
    monthSummary.weekStatuses.filter((ws) => ws.status === "published").map((ws) => ws.weekStart)
  )
  const withRota = new Set(
    monthSummary.weekStatuses.filter((ws) => ws.status !== null).map((ws) => ws.weekStart)
  )
  const withoutRota = allWeekStarts.filter((ws) => !withRota.has(ws))
  const remaining = allWeekStarts.filter((ws) => ws >= TODAY && !publishedSet.has(ws))
  const nonPublished = allWeekStarts.filter((ws) => !publishedSet.has(ws))
  const hasOptions = withoutRota.length > 0 || remaining.length > 0 || nonPublished.length > 0

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[380px] p-5 flex flex-col gap-4">
        <p className="text-[15px] font-medium">
          {t("generate4WeeksTitle")}
        </p>

        {!hasOptions ? (
          <p className="text-[13px] text-muted-foreground">
            {locale === "es" ? "Todas las semanas están publicadas." : "All weeks are published."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {withoutRota.length > 0 && (
              <button
                onClick={() => { onClose(); onSelectScope(withoutRota) }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg border border-primary bg-primary/5 text-left hover:bg-primary/10 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-[14px] font-medium">{t("generateWeeksWithout")}</p>
                  <p className="text-[12px] text-muted-foreground">{t("weeksWithoutSchedule", { count: withoutRota.length })}</p>
                </div>
              </button>
            )}
            {remaining.length > 0 && remaining.length < nonPublished.length && (
              <button
                onClick={() => { onClose(); onSelectScope(remaining) }}
                className="relative w-full px-4 py-3 rounded-lg border border-border text-left hover:bg-muted/50 transition-colors"
              >
                {remaining.some((ws) => withRota.has(ws)) && (
                  <AlertTriangle className="size-4 text-amber-500 absolute top-2.5 right-2.5" />
                )}
                <p className="text-[14px] font-medium">{t("generateRemainingWeeks")}</p>
                <p className="text-[12px] text-muted-foreground">{t("remainingWeeksDescription", { count: remaining.length })}</p>
              </button>
            )}
            {nonPublished.length > 0 && nonPublished.length > withoutRota.length && (
              <button
                onClick={() => { onClose(); onSelectScope(nonPublished) }}
                className="relative w-full px-4 py-3 rounded-lg border border-border text-left hover:bg-muted/50 transition-colors"
              >
                <AlertTriangle className="size-4 text-amber-500 absolute top-2.5 right-2.5" />
                <p className="text-[14px] font-medium">{t("regenerateAllWeeks")}</p>
                <p className="text-[12px] text-muted-foreground">
                  {nonPublished.length === allWeekStarts.length
                    ? t("weeksOverwrite")
                    : (locale === "es"
                      ? `${nonPublished.length} semana(s) — sobreescribirá horarios existentes`
                      : `${nonPublished.length} week(s) — will overwrite existing rotas`)}
                </p>
              </button>
            )}
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose}>
            {tc("cancel")}
          </Button>
        </div>
      </div>
    </>
  )
}
