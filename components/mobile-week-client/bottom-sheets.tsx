"use client"

import { createPortal } from "react-dom"
import { useTranslations } from "next-intl"
import { AlertTriangle, CheckCircle2, BrainCircuit, X } from "lucide-react"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"

// ── AI insights parser ────────────────────────────────────────────────────────

function parseInsights(text: string): { assessment: string; issues: string[] } | null {
  const issuesMatch = text.match(/Remaining issues?:\s*\n((?:[•\-*][^\n]+\n?)+)/i)
  const assessmentRaw = issuesMatch ? text.slice(0, text.search(/Remaining issues?:/i)).trim() : text.trim()
  if (!assessmentRaw && !issuesMatch) return null
  const parseBullets = (block: string) =>
    block.split("\n").map(l => l.replace(/^[•\-*]\s*/, "").replace(/\([0-9a-f]{7,10}\)/gi, "").trim()).filter(Boolean)
  return { assessment: assessmentRaw, issues: issuesMatch ? parseBullets(issuesMatch[1]) : [] }
}

// ── AI insights bottom sheet ────────────────────────────────────────────────

export function WeekInsightsSheet({ reasoning, locale: _locale, open, onClose }: { reasoning: string; locale: "es" | "en"; open: boolean; onClose: () => void }) {
  const t = useTranslations("schedule")
  if (!open) return null
  const parsed = parseInsights(reasoning)
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-background rounded-t-2xl shadow-xl px-4 pt-4 pb-8 max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit className="size-4 text-indigo-500" />
            <span className="text-[16px] font-semibold">{t("aiInsightsTitle")}</span>
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
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("remainingIssues")}</p>
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

export function WeekWarningsSheet({ days, locale, open, onClose }: { days: RotaWeekData["days"]; locale: "es" | "en"; open: boolean; onClose: () => void }) {
  const t = useTranslations("schedule")
  const allWarnings = days.flatMap((d) => d.warnings.map((w) => ({ day: d.date, ...w })))
  const allGaps = days.flatMap((d) => d.skillGaps.map((g) => ({ day: d.date, gap: g })))
  if (!open) return null
  return createPortal(
    <div className="fixed inset-0 z-[200] flex flex-col justify-end lg:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div className="relative bg-background rounded-t-2xl shadow-xl px-4 pt-4 pb-8 max-h-[65vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[16px] font-semibold">{t("weekAlerts")}</span>
          <button onClick={onClose} className="size-8 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        {allWarnings.length === 0 && allGaps.length === 0 ? (
          <div className="flex items-center gap-2 py-3">
            <CheckCircle2 className="size-5 text-emerald-500 shrink-0" />
            <span className="text-[14px] text-emerald-600">{t("noIssuesThisWeek")}</span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {allGaps.map((item, i) => {
              const dayLabel = new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { weekday: "short", day: "numeric" }).format(new Date(item.day + "T12:00:00"))
              return (
                <div key={i} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-50 border border-red-100">
                  <AlertTriangle className="size-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-medium text-red-700 capitalize">{dayLabel} · {t("uncoveredSkill")}</p>
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
