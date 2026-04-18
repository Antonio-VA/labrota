"use client"

import { useState, useTransition, useCallback, useEffect } from "react"
import { useTranslations } from "next-intl"
import { X, Cloud, CloudOff, RefreshCw, Unplug, Check } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  getOutlookSyncStatus,
  syncOutlookForStaff,
  syncOutlookAll,
  disconnectOutlook,
  type OutlookStaffStatus,
} from "@/app/(clinic)/leaves/outlook-actions"

function timeAgo(iso: string, t: ReturnType<typeof useTranslations>): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t("justNow")
  if (mins < 60) return t("minutesAgo", { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t("hoursAgo", { count: hours })
  const days = Math.floor(hours / 24)
  return t("daysAgo", { count: days })
}

export function OutlookSyncPanel({
  open,
  onClose,
  orgId,
}: {
  open: boolean
  onClose: () => void
  orgId: string
}) {
  const t = useTranslations("outlook")
  const [staff, setStaff] = useState<OutlookStaffStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [isPending, startTransition] = useTransition()
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const loadStatus = useCallback(async () => {
    setLoading(true)
    const data = await getOutlookSyncStatus()
    setStaff(data.staff)
    setLoading(false)
  }, [])

  /* eslint-disable react-hooks/set-state-in-effect -- fetch-on-open */
  useEffect(() => {
    if (open) loadStatus()
  }, [open, loadStatus])
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSyncOne = (staffId: string, staffName: string) => {
    startTransition(async () => {
      const result = await syncOutlookForStaff(staffId)
      if (result.errors.length > 0) {
        toast.error(result.errors[0])
      } else {
        toast.success(t("syncSuccess", { count: result.created + result.updated + result.deleted }))
      }
      if (result.created > 0 || result.deleted > 0) {
        window.dispatchEvent(new CustomEvent("labrota:notifications:refresh"))
      }
      await loadStatus()
    })
  }

  const handleSyncAll = () => {
    startTransition(async () => {
      const result = await syncOutlookAll()
      if (result.errors.length > 0) {
        toast.error(`${result.errors.length} errors during sync`)
      } else {
        toast.success(t("syncSuccess", { count: result.created + result.updated + result.deleted }))
      }
      if (result.created > 0 || result.deleted > 0) {
        window.dispatchEvent(new CustomEvent("labrota:notifications:refresh"))
      }
      await loadStatus()
    })
  }

  const handleDisconnect = (staffId: string, staffName: string, keepLeaves: boolean) => {
    startTransition(async () => {
      const result = await disconnectOutlook(staffId, keepLeaves)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("disconnectSuccess", { name: staffName }))
      }
      setDisconnecting(null)
      await loadStatus()
    })
  }

  const connectedCount = staff.filter((s) => s.connected).length

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />}

      {/* Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-full max-w-md bg-background border-l border-border shadow-xl transition-transform duration-300 flex flex-col",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Cloud className="size-5 text-primary" />
            <h2 className="text-[18px] font-medium">{t("panelTitle")}</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        {/* Actions bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
          <p className="text-[13px] text-muted-foreground">
            {t("connectedCount", { count: connectedCount, total: staff.length })}
          </p>
          {connectedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={handleSyncAll}
              className="text-[13px] gap-1.5"
            >
              <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
              {t("syncAll")}
            </Button>
          )}
        </div>

        {/* Staff list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : staff.length === 0 ? (
            <div className="p-5 text-center text-[14px] text-muted-foreground">
              {t("noStaff")}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {staff.map((s) => (
                <div key={s.staffId} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium truncate">{s.staffName}</p>
                    {s.connected ? (
                      <p className="text-[12px] text-muted-foreground truncate">
                        {s.email}
                        {s.lastSyncedAt && (
                          <> &middot; {t("lastSynced", { time: timeAgo(s.lastSyncedAt, t) })}</>
                        )}
                      </p>
                    ) : (
                      <p className="text-[12px] text-muted-foreground">{t("notConnected")}</p>
                    )}
                  </div>

                  {s.connected ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleSyncOne(s.staffId, s.staffName)}
                        disabled={isPending}
                        className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                        title={t("syncNow")}
                      >
                        <RefreshCw className={cn("size-3.5", isPending && "animate-spin")} />
                      </button>

                      {disconnecting === s.staffId ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDisconnect(s.staffId, s.staffName, true)}
                            disabled={isPending}
                            className="px-2 py-1 text-[11px] rounded bg-muted hover:bg-muted/80"
                            title={t("disconnectKeep")}
                          >
                            {t("keep")}
                          </button>
                          <button
                            onClick={() => handleDisconnect(s.staffId, s.staffName, false)}
                            disabled={isPending}
                            className="px-2 py-1 text-[11px] rounded bg-destructive/10 text-destructive hover:bg-destructive/20"
                            title={t("disconnectDelete")}
                          >
                            {t("delete")}
                          </button>
                          <button
                            onClick={() => setDisconnecting(null)}
                            className="p-1 rounded-md hover:bg-muted"
                          >
                            <X className="size-3" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDisconnecting(s.staffId)}
                          className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
                          title={t("disconnectOutlook")}
                        >
                          <Unplug className="size-3.5" />
                        </button>
                      )}
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground flex items-center gap-1.5">
                      <CloudOff className="size-3.5" />
                      {t("notConnected")}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
