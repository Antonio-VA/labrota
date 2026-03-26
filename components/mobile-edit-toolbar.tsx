"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Pencil, MoreHorizontal, Sparkles, FileDown, Share2, Rows3, Users, AlertTriangle } from "lucide-react"
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
  viewMode?: "shift" | "person"
  onViewModeChange?: (mode: "shift" | "person") => void
  warningCount?: number
  onWarningsClick?: () => void
}

export function MobileEditToolbar({
  isEditMode, onEnterEditMode, onExitEditMode, dateLabel, canEdit,
  onGenerateRota, onExportPdf, onShareRota, isPending,
  viewMode = "shift", onViewModeChange, warningCount = 0, onWarningsClick,
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
      <div className="flex items-center justify-between px-3 py-1.5 bg-primary/10 border-b border-primary/20 md:hidden">
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
    <div className="flex items-center gap-1.5 px-3 py-1 border-b border-border md:hidden">
      {/* Date label */}
      <span className="text-[13px] font-medium text-foreground flex-1 min-w-0 truncate">{dateLabel}</span>

      {/* Shift/Person toggle icons */}
      {onViewModeChange && (
        <div className="flex items-center gap-0 rounded-md border border-border p-0.5 shrink-0">
          <button
            onClick={() => onViewModeChange("shift")}
            className={cn(
              "size-7 flex items-center justify-center rounded transition-colors",
              viewMode === "shift" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            <Rows3 className="size-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange("person")}
            className={cn(
              "size-7 flex items-center justify-center rounded transition-colors",
              viewMode === "person" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            <Users className="size-3.5" />
          </button>
        </div>
      )}

      {/* Warnings */}
      {warningCount > 0 && onWarningsClick && (
        <button
          onClick={onWarningsClick}
          className="relative size-7 flex items-center justify-center rounded-full text-amber-500 active:bg-amber-50 shrink-0"
        >
          <AlertTriangle className="size-4" />
          <span className="absolute -top-0.5 -right-0.5 size-3.5 flex items-center justify-center rounded-full bg-amber-500 text-white text-[8px] font-bold">
            {warningCount > 9 ? "9+" : warningCount}
          </span>
        </button>
      )}

      {/* Edit */}
      {canEdit && (
        <button
          onClick={onEnterEditMode}
          className="size-7 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent shrink-0"
        >
          <Pencil className="size-3.5" />
        </button>
      )}

      {/* Overflow */}
      <div className="relative shrink-0" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="size-7 flex items-center justify-center rounded-full text-muted-foreground active:bg-accent"
        >
          <MoreHorizontal className="size-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-8 z-50 w-48 rounded-xl border border-border bg-background shadow-lg overflow-hidden py-1">
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
  )
}
