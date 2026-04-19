"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Trash2, AlertTriangle, Copy, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { copyDayFromLastWeek, regenerateDay } from "@/app/(clinic)/rota/actions"

export function SheetFooter({
  open, date, weekStart, hasAssignments,
  onSaved, onDeleteAll,
}: {
  open: boolean
  date: string | null
  weekStart: string
  hasAssignments: boolean
  onSaved: () => void
  onDeleteAll: () => void
}) {
  const t = useTranslations("assignmentSheet")
  const tc = useTranslations("common")
  const ts = useTranslations("schedule")
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [isRegenerating, startRegen] = useTransition()
  const [, startCopy] = useTransition()

  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) { setShowDeleteAll(false); setShowRegenConfirm(false) }
  }

  if (showRegenConfirm) {
    return (
      <div className="px-3 py-4 border-t border-border flex flex-col gap-2 shrink-0 bg-background">
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-col gap-2">
          <p className="text-[12px] text-foreground leading-snug">
            {t("regenerateDayConfirm")}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 px-3 text-[12px]"
              disabled={isRegenerating}
              onClick={() => {
                if (!date) return
                startRegen(async () => {
                  const result = await regenerateDay(weekStart, date)
                  if (result.error) { toast.error(result.error); return }
                  toast.success(t("dayRegenerated", { count: result.count ?? 0 }))
                  setShowRegenConfirm(false)
                  onSaved()
                })
              }}
            >
              {isRegenerating ? t("regenerating") : t("regenerate")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-3 text-[12px]" onClick={() => setShowRegenConfirm(false)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (showDeleteAll) {
    return (
      <div className="px-3 py-4 border-t border-border flex flex-col gap-2 shrink-0 bg-background">
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-3.5 text-destructive mt-0.5 shrink-0" />
            <p className="text-[12px] text-destructive leading-snug">{t("deleteDayConfirm")}</p>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-[12px] border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => { onDeleteAll(); setShowDeleteAll(false) }}
            >
              {tc("delete")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-3 text-[12px]" onClick={() => setShowDeleteAll(false)}>
              {tc("cancel")}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-3 py-4 border-t border-border flex flex-col gap-2 shrink-0 bg-background">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="gap-1.5 text-[14px] h-9"
          onClick={() => setShowRegenConfirm(true)}
          disabled={!hasAssignments}
        >
          <Sparkles className="size-4" />
          {t("regenerateDay")}
        </Button>
        {!hasAssignments && date && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[12px] gap-1.5"
            onClick={() => {
              startCopy(async () => {
                const r = await copyDayFromLastWeek(weekStart, date)
                if (r.error) toast.error(r.error)
                else { toast.success(ts("copyAssignments", { count: r.count ?? 0 })); onSaved() }
              })
            }}
          >
            <Copy className="size-3.5" />
            {t("copyPrevWeek")}
          </Button>
        )}
        <div className="flex-1" />
        {hasAssignments && (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground/50 hover:text-destructive"
            onClick={() => setShowDeleteAll(true)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  )
}
