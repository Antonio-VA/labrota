"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { X, Clock, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getSnapshots, restoreSnapshot, type RotaSnapshot } from "@/lib/rota-snapshots"

const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

export function RotaHistoryPanel({
  open, onOpenChange, weekStart, date, onRestored,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekStart: string
  date: string | null
  onRestored?: () => void
}) {
  const t = useTranslations("schedule")
  const locale = useLocale()
  const [snapshots, setSnapshots] = useState<RotaSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open || !date) return
    setLoading(true)
    setSelectedId(null)
    setConfirmRestore(false)
    getSnapshots(weekStart, date).then((data) => {
      setSnapshots(data)
      setLoading(false)
    })
  }, [open, weekStart, date])

  const selected = selectedId ? snapshots.find((s) => s.id === selectedId) : null

  function handleRestore() {
    if (!selectedId) return
    startTransition(async () => {
      const result = await restoreSnapshot(selectedId)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("versionRestored"))
        onOpenChange(false)
        onRestored?.()
      }
      setConfirmRestore(false)
    })
  }

  function formatTime(iso: string) {
    const d = new Date(iso)
    return d.toLocaleString(locale === "es" ? "es-ES" : "en-GB", {
      day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
    })
  }

  return (
    <>
      {open && <div className="fixed inset-0 z-40" onClick={() => onOpenChange(false)} />}
      <div className={cn(
        "fixed right-0 top-0 bottom-0 z-50 bg-background border-l border-border shadow-xl",
        "flex flex-col transition-transform duration-200 ease-out w-[480px] max-w-[90vw]",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <p className="text-[14px] font-medium">{t("versionHistory")}</p>
            {date && <span className="text-[12px] text-muted-foreground">{date}</span>}
          </div>
          <button onClick={() => onOpenChange(false)} className="size-7 flex items-center justify-center rounded hover:bg-muted">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: version list */}
          <div className="w-[180px] border-r border-border overflow-y-auto shrink-0">
            {loading ? (
              <div className="p-3 text-[12px] text-muted-foreground">{t("loading")}</div>
            ) : snapshots.length === 0 ? (
              <div className="p-3 text-[12px] text-muted-foreground italic">{t("noVersions")}</div>
            ) : (
              snapshots.map((snap) => (
                <button
                  key={snap.id}
                  onClick={() => { setSelectedId(snap.id); setConfirmRestore(false) }}
                  className={cn(
                    "w-full text-left px-3 py-2.5 border-b border-border transition-colors",
                    selectedId === snap.id ? "bg-accent" : "hover:bg-muted/50"
                  )}
                >
                  <p className="text-[12px] font-medium">{formatTime(snap.created_at)}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {snap.assignments.length} {t("assignments")}
                  </p>
                  {snap.user_email && (
                    <p className="text-[10px] text-muted-foreground truncate">{snap.user_email}</p>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Right: preview + restore */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="flex-1 overflow-y-auto p-4">
                  <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-3">{t("staffPreview")}</p>
                  {(() => {
                    // Group by shift
                    const byShift: Record<string, typeof selected.assignments> = {}
                    for (const a of selected.assignments) {
                      if (!byShift[a.shift_type]) byShift[a.shift_type] = []
                      byShift[a.shift_type].push(a)
                    }
                    return Object.entries(byShift).map(([shift, staff]) => (
                      <div key={shift} className="mb-3">
                        <p className="text-[12px] font-semibold text-foreground mb-1">{shift}</p>
                        <div className="flex flex-col gap-1">
                          {staff.map((a) => (
                            <div
                              key={a.id}
                              className="flex items-center gap-2 text-[12px] px-2 py-1 rounded border border-border"
                              style={{ borderLeft: `3px solid ${ROLE_COLOR[a.staff.role] ?? "#64748B"}` }}
                            >
                              <span>{a.staff.first_name} {a.staff.last_name}</span>
                              {a.function_label && (
                                <span className="text-[10px] text-muted-foreground ml-auto">{a.function_label}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))
                  })()}
                  {selected.assignments.length === 0 && (
                    <p className="text-[12px] text-muted-foreground italic">{t("noAssignmentsInVersion")}</p>
                  )}
                </div>
                {/* Restore button */}
                <div className="border-t border-border px-4 py-3 shrink-0">
                  {confirmRestore ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-[12px] text-destructive font-medium">{t("confirmRestoreMsg")}</p>
                      <div className="flex gap-2">
                        <Button size="sm" variant="destructive" onClick={handleRestore} disabled={isPending} className="flex-1">
                          {isPending ? t("restoring") : t("confirmRestore")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmRestore(false)} className="flex-1">
                          {t("cancelRestore")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => setConfirmRestore(true)} className="w-full gap-1.5">
                      <RotateCcw className="size-3.5" />
                      {t("restoreVersion")}
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[13px] text-muted-foreground">
                {t("selectVersion")}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
