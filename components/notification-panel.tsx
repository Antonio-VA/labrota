"use client"

import { useState, useEffect, useCallback } from "react"
import { Bell, X, Check, AlertTriangle, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
} from "@/app/(clinic)/notification-actions"
import type { Notification } from "@/lib/types/database"

const TYPE_ICON: Record<string, React.ReactNode> = {
  leave_impact: <AlertTriangle className="size-4 text-amber-500 shrink-0" />,
  info:         <CalendarDays className="size-4 text-primary shrink-0" />,
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(() => {
    getUnreadCount().then(setCount)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [refresh])

  function handleOpen() {
    setOpen(true)
    setLoading(true)
    getNotifications().then((n) => { setNotifications(n); setLoading(false) })
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

  return (
    <>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative size-8 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        title="Notificaciones"
      >
        <Bell className="size-4" />
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
            <p className="text-[14px] font-medium">Notificaciones</p>
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
                Marcar todas leídas
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
              <p className="text-[13px]">Sin notificaciones</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {notifications.map((n) => (
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
                      {new Date(n.created_at).toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="size-2 rounded-full bg-primary shrink-0 mt-1.5" />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
