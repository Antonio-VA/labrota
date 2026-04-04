"use client"

import { useEffect, useRef, useState } from "react"
import { MoreHorizontal, Sparkles, CalendarDays, Share, Rows3, Check, Star } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

export function MobileOverflow({ onGenerateWeek, onGenerateDay, onShare, isPending, compact, onToggleCompact, deptColor, onToggleDeptColor, highlight, onToggleHighlight, isFavorite, hasFavorite, onSaveFavorite, onGoToFavorite }: { onGenerateWeek: () => void; onGenerateDay?: () => void; onShare?: () => void; isPending?: boolean; compact?: boolean; onToggleCompact?: () => void; deptColor?: boolean; onToggleDeptColor?: () => void; highlight?: boolean; onToggleHighlight?: () => void; isFavorite?: boolean; hasFavorite?: boolean; onSaveFavorite?: () => void; onGoToFavorite?: () => void }) {
  const t = useTranslations("schedule")
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])
  return (
    <div className="relative shrink-0" ref={ref}>
      <button onClick={() => setOpen((v) => !v)} className="size-9 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent">
        <MoreHorizontal className="size-5" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-[100] w-56 rounded-2xl border border-border bg-background shadow-lg overflow-hidden py-1.5">
          <button onClick={() => { setOpen(false); onGenerateWeek() }} disabled={isPending} className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-left hover:bg-accent transition-colors disabled:opacity-50">
            <Sparkles className="size-4.5 shrink-0" />
            {locale === "es" ? "Generar semana" : "Generate week"}
          </button>
          {onGenerateDay && (
            <button onClick={() => { setOpen(false); onGenerateDay() }} disabled={isPending} className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-left hover:bg-accent transition-colors disabled:opacity-50">
              <CalendarDays className="size-4.5 shrink-0" />
              {locale === "es" ? "Regenerar día" : "Regenerate day"}
            </button>
          )}
          {onShare && (
            <button onClick={() => { setOpen(false); onShare() }} className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-left hover:bg-accent transition-colors">
              <Share className="size-4.5 shrink-0" />
              {locale === "es" ? "Compartir imagen" : "Share image"}
            </button>
          )}
          {onToggleCompact && (
            <>
              <div className="h-px bg-border mx-3 my-1" />
              <button onClick={() => { onToggleCompact(); setOpen(false) }} className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-left hover:bg-accent transition-colors">
                <Rows3 className="size-4.5 shrink-0" />
                {locale === "es" ? "Vista compacta" : "Compact view"}
                {compact && <Check className="size-4 text-primary ml-auto" />}
              </button>
              {onToggleDeptColor && (
                <button onClick={() => { onToggleDeptColor(); setOpen(false) }} className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-left hover:bg-accent transition-colors">
                  <span className="size-4.5 rounded-sm shrink-0" style={{ borderLeft: "3px solid #3B82F6", borderTop: "3px solid #10B981", borderRight: "3px solid #64748B", borderBottom: "3px solid #F59E0B" }} />
                  {locale === "es" ? "Colores departamento" : "Department colors"}
                  {deptColor && <Check className="size-4 text-primary ml-auto" />}
                </button>
              )}
              {onToggleHighlight && (
                <button onClick={() => { onToggleHighlight(); setOpen(false) }} className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-left hover:bg-accent transition-colors">
                  <span className="size-4.5 rounded-sm shrink-0" style={{ backgroundColor: "#FDE047" }} />
                  {locale === "es" ? "Resaltar" : "Highlights"}
                  {highlight && <Check className="size-4 text-primary ml-auto" />}
                </button>
              )}
            </>
          )}
          {!isFavorite && (hasFavorite && onGoToFavorite ? (
            <>
              <div className="h-px bg-border mx-3 my-1" />
              <button onClick={() => { onGoToFavorite(); setOpen(false) }} className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-left hover:bg-accent transition-colors">
                <Star className="size-4.5 shrink-0 text-amber-400 fill-amber-400" />
                {t("goToFavoriteView")}
              </button>
            </>
          ) : onSaveFavorite ? (
            <>
              <div className="h-px bg-border mx-3 my-1" />
              <button onClick={() => { onSaveFavorite(); setOpen(false) }} className="flex items-center gap-3 w-full px-4 py-3.5 text-[14px] text-left hover:bg-accent transition-colors">
                <Star className="size-4.5 shrink-0" />
                {t("saveFavoriteView")}
              </button>
            </>
          ) : null)}
        </div>
      )}
    </div>
  )
}
