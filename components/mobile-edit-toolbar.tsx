"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Pencil, MoreHorizontal, Sparkles, FileDown, Share2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface MobileEditToolbarProps {
  isEditMode: boolean
  onEnterEditMode: () => void
  onExitEditMode: () => void
  dateLabel: string
  canEdit: boolean
  onGenerateRota?: () => void
  onExportPdf?: () => void
  onShareRota?: () => void
  isPending?: boolean
}

export function MobileEditToolbar({
  isEditMode, onEnterEditMode, onExitEditMode, dateLabel, canEdit,
  onGenerateRota, onExportPdf, onShareRota, isPending,
}: MobileEditToolbarProps) {
  const t = useTranslations("schedule")
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [menuOpen])

  if (isEditMode) {
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-primary/10 border-b border-primary/20 md:hidden">
        <span className="text-[13px] font-medium text-primary">
          {t("editMode")} — {dateLabel}
        </span>
        <Button size="sm" onClick={onExitEditMode} className="h-7 text-[12px]">
          {t("done")}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between px-4 py-1.5 border-b border-border md:hidden">
      <span className="text-[13px] font-medium text-foreground">{dateLabel}</span>
      <div className="flex items-center gap-1.5">
        {canEdit && (
          <button
            onClick={onEnterEditMode}
            className="size-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:bg-accent transition-colors"
            title={t("editButton")}
          >
            <Pencil className="size-4" />
          </button>
        )}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="size-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted active:bg-accent transition-colors"
          >
            <MoreHorizontal className="size-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-9 z-50 w-48 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1">
              {canEdit && onGenerateRota && (
                <button
                  onClick={() => { setMenuOpen(false); onGenerateRota() }}
                  disabled={isPending}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-[14px] text-left hover:bg-accent transition-colors disabled:opacity-50"
                >
                  <Sparkles className="size-4" />
                  {t("generateScheduleMenu")}
                </button>
              )}
              {onExportPdf && (
                <button
                  onClick={() => { setMenuOpen(false); onExportPdf() }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-[14px] text-left hover:bg-accent transition-colors"
                >
                  <FileDown className="size-4" />
                  {t("exportPdfMenu")}
                </button>
              )}
              {onShareRota && typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={() => { setMenuOpen(false); onShareRota() }}
                  className="flex items-center gap-2 w-full px-4 py-2.5 text-[14px] text-left hover:bg-accent transition-colors"
                >
                  <Share2 className="size-4" />
                  {t("shareSchedule")}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
