"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { X, Clock, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { getWeekSnapshots, restoreWeekSnapshot, type RotaSnapshot, type SnapshotAssignment } from "@/lib/rota-snapshots"
import { formatDate, formatDateTime } from "@/lib/format-date"

const DOW_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = []
  const d = new Date(weekStart + "T12:00:00")
  for (let i = 0; i < 7; i++) {
    dates.push(d.toISOString().split("T")[0])
    d.setDate(d.getDate() + 1)
  }
  return dates
}

export function RotaHistoryPanel({
  open, onOpenChange, weekStart, onRestored,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  weekStart: string
  onRestored?: () => void
}) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")
  const locale = useLocale()
  const [snapshots, setSnapshots] = useState<RotaSnapshot[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirmRestore, setConfirmRestore] = useState(false)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelectedId(null)
    setConfirmRestore(false)
    getWeekSnapshots(weekStart).then((data) => {
      setSnapshots(data)
      setLoading(false)
    })
  }, [open, weekStart])

  const selected = selectedId ? snapshots.find((s) => s.id === selectedId) : null
  const weekDates = getWeekDates(weekStart)

  function handleRestore() {
    if (!selectedId) return
    startTransition(async () => {
      const result = await restoreWeekSnapshot(selectedId)
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
    return formatDateTime(iso, locale as "es" | "en")
  }

  if (!open) return null

  // Build grid data for selected snapshot
  const byDate: Record<string, SnapshotAssignment[]> = {}
  if (selected) {
    for (const a of selected.assignments) {
      const d = a.date ?? weekStart
      if (!byDate[d]) byDate[d] = []
      byDate[d].push(a)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={() => onOpenChange(false)} />

      {/* Modal */}
      <div className="fixed inset-4 z-50 bg-background rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden max-w-[1100px] max-h-[700px] mx-auto my-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <Clock className="size-4 text-muted-foreground" />
            <p className="text-[14px] font-medium">{t("versionHistory")}</p>
            <span className="text-[12px] text-muted-foreground">
              {formatDate(weekStart, locale as "es" | "en")} – {formatDate(weekDates[6], locale as "es" | "en")}
            </span>
          </div>
          <button onClick={() => onOpenChange(false)} className="size-7 flex items-center justify-center rounded hover:bg-muted">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: version list */}
          <div className="w-[200px] border-r border-border overflow-y-auto shrink-0 bg-muted/30">
            {loading ? (
              <div className="p-4 text-[12px] text-muted-foreground">{tc("loading")}</div>
            ) : snapshots.length === 0 ? (
              <div className="p-4 text-[12px] text-muted-foreground italic">{t("noVersions")}</div>
            ) : (
              snapshots.map((snap) => (
                <button
                  key={snap.id}
                  onClick={() => { setSelectedId(snap.id); setConfirmRestore(false) }}
                  className={cn(
                    "w-full text-left px-4 py-3 border-b border-border transition-colors",
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

          {/* Right: week grid preview */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selected ? (
              <>
                <div className="flex-1 overflow-auto p-4">
                  {/* Week grid */}
                  <div className="rounded-lg border border-border overflow-hidden">
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
                      {/* Day headers */}
                      {weekDates.map((date) => {
                        const d = new Date(date + "T12:00:00")
                        const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
                        const dayN = String(d.getDate())
                        return (
                          <div key={date} className="flex flex-col items-center py-2 border-b border-r last:border-r-0 border-border bg-muted">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{wday}</span>
                            <span className="text-[15px] font-semibold text-primary">{dayN}</span>
                          </div>
                        )
                      })}

                      {/* Day cells with assignments */}
                      {weekDates.map((date) => {
                        const dayAssignments = byDate[date] ?? []
                        // Group by shift
                        const byShift: Record<string, typeof dayAssignments> = {}
                        for (const a of dayAssignments) {
                          if (!byShift[a.shift_type]) byShift[a.shift_type] = []
                          byShift[a.shift_type].push(a)
                        }
                        return (
                          <div key={date} className="border-r last:border-r-0 border-border p-2 min-h-[120px] bg-background">
                            {Object.keys(byShift).length === 0 ? (
                              <span className="text-[11px] text-muted-foreground italic">—</span>
                            ) : (
                              Object.entries(byShift).map(([shift, staff]) => (
                                <div key={shift} className="mb-2 last:mb-0">
                                  <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">{shift}</p>
                                  {staff.map((a) => (
                                    <div
                                      key={a.id}
                                      className="text-[11px] py-0.5 px-1.5 rounded mb-0.5 border border-border"
                                      style={{ borderLeft: `3px solid ${ROLE_COLOR[a.staff.role] ?? "#64748B"}` }}
                                    >
                                      {a.staff.first_name} {a.staff.last_name[0]}.
                                    </div>
                                  ))}
                                </div>
                              ))
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Restore bar */}
                <div className="border-t border-border px-5 py-3 shrink-0 flex items-center gap-3">
                  {confirmRestore ? (
                    <>
                      <p className="text-[12px] text-destructive font-medium flex-1">{t("confirmRestoreMsg")}</p>
                      <Button size="sm" variant="destructive" onClick={handleRestore} disabled={isPending}>
                        {isPending ? t("restoring") : t("confirmRestore")}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setConfirmRestore(false)}>
                        {tc("cancel")}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setConfirmRestore(true)} className="gap-1.5 ml-auto">
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
