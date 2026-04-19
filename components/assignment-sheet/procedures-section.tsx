"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Pencil, Info } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { RotaDay } from "@/app/(clinic)/rota/actions"

type Assignment = RotaDay["assignments"][0]

export function ProceduresSection({
  open, date, effectiveP, hasOverride, biopsyForecast,
  assignments, isPublished, rota, onPunctionsChange,
}: {
  open: boolean
  date: string | null
  effectiveP: number
  hasOverride: boolean
  biopsyForecast?: number
  assignments: Assignment[]
  isPublished: boolean
  rota: { id: string } | null
  onPunctionsChange: (date: string, value: number | null) => void
}) {
  const t = useTranslations("assignmentSheet")
  const tc = useTranslations("common")
  const [editingP, setEditingP] = useState(false)
  const [pDraft, setPDraft] = useState("")

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) setEditingP(false)
  }

  function commitPunctions() {
    setEditingP(false)
    if (!date) return
    const n = parseInt(pDraft, 10)
    if (!isNaN(n) && n >= 0) onPunctionsChange(date, n === 0 ? null : n)
    else setPDraft(String(effectiveP))
  }

  const p = effectiveP
  const b = biopsyForecast ?? 0
  const totalProc = p + b
  const embCount = assignments.filter((a) => a.staff.role === "lab").length
  const androCount = assignments.filter((a) => a.staff.role === "andrology").length
  const qualifiedCount = embCount + androCount
  const pbIndex = totalProc > 0 ? (qualifiedCount / totalProc) : 0
  const pbIndexStr = pbIndex.toFixed(1)
  const indexColor = totalProc > 0
    ? pbIndex >= 1.0 ? "text-emerald-600" : pbIndex >= 0.75 ? "text-amber-600" : "text-destructive"
    : "text-muted-foreground"

  return (
    <div className="flex flex-col gap-1.5">
      {editingP ? (
        <div className="flex flex-col gap-2 bg-muted/30 rounded-lg px-3 py-2.5 border border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[12px] text-muted-foreground">{t("pickups")}</span>
              <input
                autoFocus
                type="number"
                min={0}
                value={pDraft}
                onChange={(e) => setPDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") commitPunctions(); if (e.key === "Escape") setEditingP(false) }}
                className="w-14 text-[13px] text-center border border-primary rounded px-1 py-1 outline-none bg-background font-medium"
              />
            </div>
            {biopsyForecast !== undefined && (
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-muted-foreground">{t("biopsies")}</span>
                <input
                  type="number"
                  min={0}
                  defaultValue={biopsyForecast}
                  className="w-14 text-[13px] font-medium text-center border border-input rounded px-1 py-1 bg-background outline-none focus:border-primary"
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={commitPunctions}
              className="flex-1 text-[12px] font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:opacity-90 transition-opacity"
            >
              {tc("save")}
            </button>
            <button
              onClick={() => setEditingP(false)}
              className="text-[12px] text-muted-foreground px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
            >
              {tc("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => {
            if (!isPublished && rota) { setPDraft(String(effectiveP)); setEditingP(true) }
          }}
          className={cn(
            "flex items-center gap-3 text-[12px] rounded-lg px-3 py-2 transition-colors text-left",
            !isPublished && rota && "hover:bg-muted/50 cursor-pointer active:bg-muted"
          )}
        >
          <span className="text-muted-foreground">{t("pickups")}: </span>
          <span className={cn("font-medium", hasOverride ? "text-primary" : "text-foreground")}>{effectiveP}</span>
          {biopsyForecast !== undefined && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-muted-foreground">{t("biopsies")}: </span>
              <span className="font-medium text-foreground">{biopsyForecast}</span>
            </>
          )}
          {!isPublished && rota && <Pencil className="size-3 text-muted-foreground ml-1" />}
        </button>
      )}

      {totalProc > 0 && (
        <div className="flex items-center gap-2 px-3 pb-1 text-[11px]">
          <span className={cn("font-bold tabular-nums text-[13px]", indexColor)}>
            P+B: {pbIndexStr}
          </span>
          <Tooltip>
            <TooltipTrigger render={
              <Info className="size-3 text-muted-foreground/50 cursor-help" />
            } />
            <TooltipContent side="bottom" className="whitespace-pre-line text-[11px] max-w-[280px]">
              {t("pbTooltip", {
                staff: qualifiedCount,
                emb: embCount,
                andro: androCount,
                total: totalProc,
                pickups: p,
                biopsies: b,
              })}
            </TooltipContent>
          </Tooltip>
          <span className="text-muted-foreground">
            {qualifiedCount} {t("qualifiedStaff")} ({embCount} emb + {androCount} andro) ÷ {totalProc}
          </span>
        </div>
      )}
    </div>
  )
}
