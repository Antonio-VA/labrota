"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Bell, X, Check, AlertTriangle, CalendarDays, ArrowLeftRight, Loader2 } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { formatDateTime } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/app/(clinic)/notification-actions"
import type { Notification } from "@/lib/types/database"

const SWAP_TYPES = new Set(["swap_request", "swap_pending_target", "swap_approved", "swap_rejected"])

const TYPE_ICON: Record<string, React.ReactNode> = {
  leave_impact:        <AlertTriangle className="size-4 text-amber-500 shrink-0" />,
  info:                <CalendarDays className="size-4 text-primary shrink-0" />,
  shift_change:        <CalendarDays className="size-4 text-blue-500 shrink-0" />,
  swap_request:        <ArrowLeftRight className="size-4 text-primary shrink-0" />,
  swap_pending_target: <ArrowLeftRight className="size-4 text-amber-500 shrink-0" />,
}

export function NotificationBell({ large }: { large?: boolean } = {}) {
  const locale = useLocale() as "es" | "en"
  const t = useTranslations("notifications")
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)
  const [swapActioning, setSwapActioning] = useState<Record<string, "approving" | "rejecting">>({})
  const [swapActioned, setSwapActioned] = useState<Set<string>>(new Set())

  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const delayRef = useRef(30_000) // start at 30s
  const countRef = useRef(0)

  const refreshList = useCallback(() => {
    getNotifications().then((all) => {
      setNotifications(all.filter(n => !SWAP_TYPES.has(n.type)))
      setLoading(false)
    })
  }, [])

  const scheduleNext = useCallback(() => {
    if (intervalRef.current) clearTimeout(intervalRef.current)
    intervalRef.current = setTimeout(() => {
      getUnreadCount().then((n) => {
        // If new notifications arrived, refresh the list immediately
        if (n > countRef.current) refreshList()
        countRef.current = n
        setCount(n)
        delayRef.current = 30_000
        scheduleNext()
      }).catch(() => {
        // Back off on failure: double up to 5 minutes
        delayRef.current = Math.min(delayRef.current * 2, 300_000)
        scheduleNext()
      })
    }, delayRef.current)
  }, [refreshList])

  useEffect(() => {
    getUnreadCount().then((n) => { countRef.current = n; setCount(n) })
    // Prefetch notifications in background so opening is instant
    refreshList()
    scheduleNext()
    return () => { if (intervalRef.current) clearTimeout(intervalRef.current) }
  }, [scheduleNext, refreshList])

  // Immediately refresh when another component (e.g. Outlook sync panel) signals new notifications
  useEffect(() => {
    function handleRefresh() {
      getUnreadCount().then((n) => { countRef.current = n; setCount(n) })
      refreshList()
    }
    window.addEventListener("labrota:notifications:refresh", handleRefresh)
    return () => window.removeEventListener("labrota:notifications:refresh", handleRefresh)
  }, [refreshList])

  function handleOpen() {
    setOpen(true)
    // Always refresh on open — show loading only if list is currently empty
    if (notifications.length === 0) setLoading(true)
    refreshList()
  }

  async function handleMarkRead(id: string) {
    await markAsRead(id)
    setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n))
    setCount((c) => Math.max(0, c - 1))
  }

  async function handleMarkAllRead() {
    await markAllAsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    setCount(0)
  }

  function handleClickNotification(n: Notification) {
    if (!n.read) handleMarkRead(n.id)
    // Navigate to affected week if available
    const weeks = (n.data as { affectedWeeks?: string[] })?.affectedWeeks
    if (weeks?.[0]) {
      window.location.href = `/?week=${weeks[0]}`
    }
    setOpen(false)
  }

  async function handleApproveSwap(n: Notification, swapId: string) {
    setSwapActioning(prev => ({ ...prev, [n.id]: "approving" }))
    const { approveSwapByManager } = await import("@/app/(clinic)/swaps/actions")
    await approveSwapByManager(swapId)
    setSwapActioned(prev => new Set([...prev, n.id]))
    setSwapActioning(prev => { const s = { ...prev }; delete s[n.id]; return s })
    if (!n.read) handleMarkRead(n.id)
  }

  async function handleRejectSwap(n: Notification, swapId: string) {
    setSwapActioning(prev => ({ ...prev, [n.id]: "rejecting" }))
    const { rejectSwapByManager } = await import("@/app/(clinic)/swaps/actions")
    await rejectSwapByManager(swapId)
    setSwapActioned(prev => new Set([...prev, n.id]))
    setSwapActioning(prev => { const s = { ...prev }; delete s[n.id]; return s })
    if (!n.read) handleMarkRead(n.id)
  }

  async function handleAcceptSwap(n: Notification, swapId: string) {
    setSwapActioning(prev => ({ ...prev, [n.id]: "approving" }))
    const { executeSwap } = await import("@/app/(clinic)/swaps/actions")
    await executeSwap(swapId)
    setSwapActioned(prev => new Set([...prev, n.id]))
    setSwapActioning(prev => { const s = { ...prev }; delete s[n.id]; return s })
    if (!n.read) handleMarkRead(n.id)
  }

  async function handleDeclineSwap(n: Notification, swapId: string) {
    setSwapActioning(prev => ({ ...prev, [n.id]: "rejecting" }))
    const { cancelSwapRequest } = await import("@/app/(clinic)/swaps/actions")
    await cancelSwapRequest(swapId)
    setSwapActioned(prev => new Set([...prev, n.id]))
    setSwapActioning(prev => { const s = { ...prev }; delete s[n.id]; return s })
    if (!n.read) handleMarkRead(n.id)
  }

  return (
    <>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className={`relative ${large ? "size-11" : "size-10"} flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:bg-muted transition-colors`}
        title={t("title")}
      >
        <Bell className={large ? "size-6" : "size-5"} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {/* Panel overlay */}
      {open && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}

      {/* Panel */}
      <div className={cn(
        "fixed right-0 top-0 bottom-0 z-50 bg-background border-l border-border shadow-xl",
        "flex flex-col transition-transform duration-200 ease-out w-[360px]",
        open ? "translate-x-0" : "translate-x-full",
      )}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-muted-foreground" />
            <p className="text-[14px] font-medium">{t("title")}</p>
            {count > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-600 dark:text-red-400">
                {count}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors"
              >
                {t("markAllRead")}
              </button>
            )}
            <button onClick={() => setOpen(false)} className="size-7 flex items-center justify-center rounded hover:bg-muted">
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((i) => <div key={i} className="shimmer-bar h-16 w-full rounded-lg" />)}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Bell className="size-8 opacity-20 mb-2" />
              <p className="text-[13px]">{t("empty")}</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => {
                const swapId = (n.data as { swapId?: string })?.swapId
                const isSwapRequest = n.type === "swap_request" && swapId
                const isSwapTarget = n.type === "swap_pending_target" && swapId
                const actioning = swapActioning[n.id]
                const actioned = swapActioned.has(n.id)

                if (isSwapTarget) {
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 border-b border-border",
                        n.read || actioned ? "bg-background" : "bg-amber-500/5"
                      )}
                    >
                      {TYPE_ICON.swap_pending_target}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-[13px] leading-tight", !n.read && !actioned && "font-medium")}>{n.title}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">{formatDateTime(n.created_at, locale)}</p>
                        {actioned ? (
                          <p className="text-[11px] text-emerald-600 mt-1.5 flex items-center gap-1">
                            <Check className="size-3" />
                            {t("done")}
                          </p>
                        ) : (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleAcceptSwap(n, swapId!)}
                              disabled={!!actioning}
                              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            >
                              {actioning === "approving" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                              {t("accept")}
                            </button>
                            <button
                              onClick={() => handleDeclineSwap(n, swapId!)}
                              disabled={!!actioning}
                              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              {actioning === "rejecting" ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                              {t("decline")}
                            </button>
                          </div>
                        )}
                      </div>
                      {!n.read && !actioned && (
                        <span className="size-2 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                      )}
                    </div>
                  )
                }

                if (isSwapRequest) {
                  return (
                    <div
                      key={n.id}
                      className={cn(
                        "flex items-start gap-3 px-4 py-3 border-b border-border",
                        n.read || actioned ? "bg-background" : "bg-primary/5"
                      )}
                    >
                      {TYPE_ICON.swap_request}
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-[13px] leading-tight", !n.read && !actioned && "font-medium")}>{n.title}</p>
                        <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-1">{formatDateTime(n.created_at, locale)}</p>
                        {actioned ? (
                          <p className="text-[11px] text-emerald-600 mt-1.5 flex items-center gap-1">
                            <Check className="size-3" />
                            {t("done")}
                          </p>
                        ) : (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleApproveSwap(n, swapId!)}
                              disabled={!!actioning}
                              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                            >
                              {actioning === "approving" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                              {t("approve")}
                            </button>
                            <button
                              onClick={() => handleRejectSwap(n, swapId!)}
                              disabled={!!actioning}
                              className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50"
                            >
                              {actioning === "rejecting" ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                              {t("reject")}
                            </button>
                          </div>
                        )}
                      </div>
                      {!n.read && !actioned && (
                        <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                      )}
                    </div>
                  )
                }

                return (
                  <button
                    key={n.id}
                    onClick={() => handleClickNotification(n)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 text-left border-b border-border transition-colors",
                      n.read ? "bg-background" : "bg-primary/5",
                      "hover:bg-muted"
                    )}
                  >
                    {TYPE_ICON[n.type] ?? TYPE_ICON.info}
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[13px] leading-tight", !n.read && "font-medium")}>{n.title}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1">
                        {formatDateTime(n.created_at, locale)}
                      </p>
                    </div>
                    {!n.read && (
                      <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
