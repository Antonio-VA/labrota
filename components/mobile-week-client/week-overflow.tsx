"use client"

import { useState, useEffect, useRef, useLayoutEffect } from "react"
import { createPortal } from "react-dom"
import { useTranslations, useLocale } from "next-intl"
import { MoreHorizontal, Sparkles, FileDown, Grid3X3, Users, Check, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"

export function WeekOverflow({ weekStart, data, onRefresh, highlightEnabled, onToggleHighlight, onGenerateWeek, weekViewMode, onToggleViewMode, deptColor, onToggleDeptColor, isFavourite, hasFavourite, onSaveFavourite, onGoToFavourite, taskDaysAsRows, onToggleTaskDaysAsRows }: {
  weekStart: string; data: RotaWeekData | null; onRefresh?: () => void
  highlightEnabled?: boolean; onToggleHighlight?: () => void
  onGenerateWeek?: () => void
  weekViewMode?: "task" | "person"; onToggleViewMode?: () => void
  deptColor?: boolean; onToggleDeptColor?: () => void
  isFavourite?: boolean; hasFavourite?: boolean; onSaveFavourite?: () => void; onGoToFavourite?: () => void
  taskDaysAsRows?: boolean; onToggleTaskDaysAsRows?: () => void
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
    function h(e: Event) {
      if (dropRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener("mousedown", h)
    document.addEventListener("touchstart", h)
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("touchstart", h) }
  }, [open])

  return (
    <div className="shrink-0">
      <button ref={btnRef} onClick={() => setOpen((v) => !v)} className="size-9 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
        <MoreHorizontal className="size-5" />
      </button>
      {open && pos && createPortal(
        <div ref={dropRef} className="fixed z-[9999] w-52 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1" style={{ top: pos.top, right: pos.right }}>
          {onGenerateWeek && (
            <>
              <button
                onClick={() => { setOpen(false); onGenerateWeek() }}
                className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors"
              >
                <Sparkles className="size-4" />
                {t("generateRota")}
              </button>
              <div className="h-px bg-border mx-3 my-0.5" />
            </>
          )}
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
          <div className="h-px bg-border mx-3 my-0.5" />
          {onToggleTaskDaysAsRows && data?.rotaDisplayMode === "by_task" && weekViewMode !== "person" && (
            <button onClick={() => { onToggleTaskDaysAsRows(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
              <Grid3X3 className="size-4 shrink-0" />
              {t("daysAsRows")}
              {taskDaysAsRows && <Check className="size-4 text-primary ml-auto" />}
            </button>
          )}
          {onToggleViewMode && data?.rotaDisplayMode !== "by_task" && (
            <button onClick={() => { onToggleViewMode(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
              <Users className="size-4" />
              {t("byPerson")}
              {weekViewMode === "person" && <Check className="size-4 text-primary ml-auto" />}
            </button>
          )}
          {onToggleDeptColor && (
            <button onClick={() => { onToggleDeptColor(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
              <span className="size-3.5 rounded-full bg-gradient-to-br from-amber-400 via-blue-400 to-emerald-400 shrink-0" />
              {t("staffColorsShort")}
              {deptColor && <Check className="size-4 text-primary ml-auto" />}
            </button>
          )}
          {onToggleHighlight && weekViewMode !== "person" && (
            <button onClick={() => { onToggleHighlight(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
              <span className="size-4 rounded-sm shrink-0" style={{ backgroundColor: "#FDE047" }} />
              {t("highlights")}
              {highlightEnabled && <Check className="size-4 text-primary ml-auto" />}
            </button>
          )}
          {(onSaveFavourite || (hasFavourite && !isFavourite && onGoToFavourite)) && (
            <>
              <div className="h-px bg-border mx-3 my-0.5" />
              {hasFavourite && !isFavourite && onGoToFavourite && (
                <button onClick={() => { onGoToFavourite(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                  <Star className="size-4 fill-amber-400 text-amber-400" />
                  {t("goToFavoriteView")}
                </button>
              )}
              {onSaveFavourite && (
                <button onClick={() => { onSaveFavourite(); setOpen(false) }} className="flex items-center gap-2.5 w-full px-4 py-3 text-[14px] text-left hover:bg-accent transition-colors">
                  <Star className={cn("size-4", isFavourite ? "fill-amber-400 text-amber-400" : "")} />
                  {t("saveFavoriteView")}
                </button>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
