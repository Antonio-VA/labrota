"use client"

import { useEffect, useRef, useState } from "react"
import { useLocale, useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

// ── Day stats (punciones + biopsy forecast) ──────────────────────────────────

export function DayStatsInput({ date, value, defaultValue, isOverride, onChange, onBiopsyChange, disabled, biopsyForecast, biopsyTooltip, compact }: {
  date: string; value: number; defaultValue: number; isOverride: boolean
  onChange: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  disabled: boolean
  biopsyForecast: number; biopsyTooltip: string
  compact?: boolean
}) {
  const t = useTranslations("schedule")
  const locale = useLocale()
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [biopsyDraft, setBiopsyDraft] = useState(String(biopsyForecast))
  const popRef            = useRef<HTMLDivElement>(null)

  useEffect(() => { setDraft(String(value)) }, [value])
  useEffect(() => { setBiopsyDraft(String(biopsyForecast)) }, [biopsyForecast])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function save() {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n >= 0) onChange(date, n === defaultValue ? null : n)
    else setDraft(String(value))
  }

  // Autosave punctions when draft changes (debounced)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!open) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      const n = parseInt(draft, 10)
      if (!isNaN(n) && n >= 0 && n !== value) {
        onChange(date, n === defaultValue ? null : n)
      }
    }, 600)
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current) }
  }, [draft, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autosave biopsies when biopsyDraft changes (debounced)
  const biopsySaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (!open || !onBiopsyChange) return
    if (biopsySaveTimeoutRef.current) clearTimeout(biopsySaveTimeoutRef.current)
    biopsySaveTimeoutRef.current = setTimeout(() => {
      const n = parseInt(biopsyDraft, 10)
      if (!isNaN(n) && n >= 0 && n !== biopsyForecast) {
        onBiopsyChange(date, n)
      }
    }, 600)
    return () => { if (biopsySaveTimeoutRef.current) clearTimeout(biopsySaveTimeoutRef.current) }
  }, [biopsyDraft, open]) // eslint-disable-line react-hooks/exhaustive-deps

  function reset() {
    onChange(date, null)
    setOpen(false)
  }

  const pLabel = `PU:${value}`
  const bLabel = biopsyForecast > 0 ? `B:${biopsyForecast}` : "B:0"
  const puncLabel = "PU"

  if (disabled) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          compact ? (
            <span className="flex items-center gap-1 text-[11px] font-medium tabular-nums text-muted-foreground cursor-default">
              <span className={isOverride ? "text-primary" : "text-foreground/70"}>{pLabel}</span>
              <span className="text-foreground/70">{bLabel}</span>
            </span>
          ) : (
            <span className="flex items-center gap-3 cursor-default">
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60 font-medium">{puncLabel}</span>
                <span className={cn("text-[13px] font-semibold tabular-nums", isOverride ? "text-primary" : "text-foreground/70")}>{value}</span>
              </span>
              <span className="flex flex-col items-start gap-0.5">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60 font-medium">Bio</span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground/70">{biopsyForecast}</span>
              </span>
            </span>
          )
        } />
        <TooltipContent side="bottom">
          {biopsyForecast > 0 ? biopsyTooltip : t("punctionsLabel", { count: value })}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div ref={popRef} className="relative">
      <Tooltip>
        <TooltipTrigger render={
          compact ? (
            <button
              onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setOpen((o) => !o) }}
              className="flex items-center gap-1 text-[11px] font-medium tabular-nums rounded px-1 py-0.5 transition-colors hover:bg-muted cursor-pointer"
            >
              <span className={isOverride ? "text-primary" : "text-muted-foreground"}>{pLabel}</span>
              <span className="text-muted-foreground">{bLabel}</span>
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setOpen((o) => !o) }}
              className="flex items-center gap-3 rounded px-1.5 py-1 transition-colors hover:bg-muted cursor-pointer"
            >
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60 font-medium">{puncLabel}</span>
                <span className={cn("text-[13px] font-semibold tabular-nums", isOverride ? "text-primary" : "text-foreground")}>{value}</span>
              </div>
              <div className="flex flex-col items-start gap-0.5">
                <span className="text-[9px] uppercase tracking-wide text-muted-foreground/60 font-medium">Bio</span>
                <span className="text-[13px] font-semibold tabular-nums text-foreground">{biopsyForecast}</span>
              </div>
            </button>
          )
        } />
        {!open && (
          <TooltipContent side="bottom">
            {t("clickToEdit")}{isOverride ? ` · Default: ${defaultValue}` : ""}
          </TooltipContent>
        )}
      </Tooltip>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2.5 w-36 flex flex-col gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
            <span className="text-[11px] text-muted-foreground text-right">{t("punctions")}</span>
            <input
              autoFocus
              type="number"
              min={0}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") { setOpen(false); setDraft(String(value)) } }}
              className="w-14 text-[12px] text-center border border-input rounded px-1 py-1 outline-none focus:border-primary bg-background"
            />
            <span className="text-[11px] text-muted-foreground text-right">{t("biopsies")}</span>
            <input
              type="number"
              min={0}
              value={biopsyDraft}
              onChange={(e) => setBiopsyDraft(e.target.value)}
              className="w-14 text-[12px] text-center border border-input rounded px-1 py-1 outline-none focus:border-primary bg-background"
            />
          </div>
          {isOverride && (
            <button
              onClick={reset}
              className="text-[11px] text-muted-foreground border border-border rounded px-2 py-1 hover:bg-muted transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  )
}
