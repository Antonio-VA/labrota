"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { ArrowLeftRight, X, Check, Loader2, Sparkles } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { formatDate } from "@/lib/format-date"
import { cn } from "@/lib/utils"
import { useCanEdit, useViewerStaffId } from "@/lib/role-context"
import type { SwapRequestWithNames } from "@/app/(clinic)/swaps/actions"

const STATUS_STYLE: Record<string, string> = {
  pending_manager: "bg-amber-100 text-amber-700 border-amber-200",
  manager_approved: "bg-amber-100 text-amber-700 border-amber-200",
  pending_target: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
}

// Module-level cache to persist across navigations
let _swapCache: { swaps: SwapRequestWithNames[]; count: number; ts: number } | null = null
const CACHE_TTL = 30_000 // 30s

export function SwapBell({ large }: { large?: boolean } = {}) {
  const locale = useLocale() as "es" | "en"
  const t = useTranslations("swaps")
  const canEdit = useCanEdit()
  const viewerStaffId = useViewerStaffId()
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(_swapCache?.count ?? 0)
  const [swaps, setSwaps] = useState<SwapRequestWithNames[]>(_swapCache?.swaps ?? [])
  const [loading, setLoading] = useState(false)
  const [actioning, setActioning] = useState<Record<string, string>>({})
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasFetched = useRef(false)

  const role = canEdit ? "manager" : "viewer"

  const fetchCount = useCallback(async () => {
    const { getSwapBadgeCount } = await import("@/app/(clinic)/swaps/actions")
    const n = await getSwapBadgeCount(role as "viewer" | "manager" | "admin", viewerStaffId ?? undefined)
    setCount(n)
    if (_swapCache) _swapCache.count = n
  }, [role, viewerStaffId])

  const fetchSwaps = useCallback(async () => {
    let data: SwapRequestWithNames[] = []
    if (canEdit) {
      const { getOrgSwapRequests } = await import("@/app/(clinic)/swaps/actions")
      data = await getOrgSwapRequests()
    } else if (viewerStaffId) {
      const { getMySwapRequests } = await import("@/app/(clinic)/swaps/actions")
      data = await getMySwapRequests(viewerStaffId)
    }
    setSwaps(data)
    _swapCache = { swaps: data, count, ts: Date.now() }
  }, [canEdit, viewerStaffId, count])

  useEffect(() => {
    // Only fetch if cache is stale or empty
    const cacheValid = _swapCache && (Date.now() - _swapCache.ts < CACHE_TTL)
    if (!cacheValid && !hasFetched.current) {
      hasFetched.current = true
      fetchCount()
      fetchSwaps()
    }
    intervalRef.current = setInterval(() => { fetchCount(); fetchSwaps() }, CACHE_TTL)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchCount, fetchSwaps])

  async function handleOpen() {
    setOpen(true)
    // Only fetch if cache is stale
    if (!_swapCache || Date.now() - _swapCache.ts > CACHE_TTL) {
      setLoading(true)
      await fetchSwaps()
      setLoading(false)
    }
  }

  async function handleAction(swapId: string, action: string, notifId: string) {
    setActioning(prev => ({ ...prev, [notifId]: action }))
    try {
      if (action === "approve") {
        const { approveSwapByManager } = await import("@/app/(clinic)/swaps/actions")
        await approveSwapByManager(swapId)
      } else if (action === "reject") {
        const { rejectSwapByManager } = await import("@/app/(clinic)/swaps/actions")
        await rejectSwapByManager(swapId)
      } else if (action === "accept") {
        const { executeSwap } = await import("@/app/(clinic)/swaps/actions")
        await executeSwap(swapId)
      } else if (action === "cancel") {
        const { cancelSwapRequest } = await import("@/app/(clinic)/swaps/actions")
        await cancelSwapRequest(swapId)
      }
      // Update local state
      const statusMap: Record<string, string> = { approve: "manager_approved", reject: "rejected", accept: "approved", cancel: "cancelled" }
      setSwaps(prev => prev.map(s => s.id === swapId ? { ...s, status: statusMap[action] ?? s.status } as SwapRequestWithNames : s))
      fetchCount()
    } finally {
      setActioning(prev => { const s = { ...prev }; delete s[notifId]; return s })
    }
  }

  const statusLabel = (status: string) => {
    switch (status) {
      case "pending_manager": return t("pendingManager")
      case "manager_approved":
      case "pending_target": return t("pendingTarget")
      case "approved": return t("approved")
      case "rejected": return t("rejected")
      case "cancelled": return t("cancelled")
      default: return status
    }
  }

  // Don't show icon if swaps aren't relevant (no staff link and not a manager)
  if (!canEdit && !viewerStaffId) return null

  return (
    <>
      {/* Swap button */}
      <button
        onClick={handleOpen}
        className={`relative ${large ? "size-11" : "size-10"} flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground active:bg-muted transition-colors`}
        title={t("mySwaps")}
      >
        <ArrowLeftRight className={large ? "size-6" : "size-5"} />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-4 flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold">
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
            <ArrowLeftRight className="size-4 text-muted-foreground" />
            <p className="text-[14px] font-medium">{t("mySwaps")}</p>
            {count > 0 && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
                {count}
              </span>
            )}
          </div>
          <button onClick={() => setOpen(false)} className="size-7 flex items-center justify-center rounded hover:bg-muted">
            <X className="size-4 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && swaps.length === 0 ? (
            <div className="flex flex-col gap-2 p-4">
              {[0, 1, 2].map((i) => <div key={i} className="shimmer-bar h-16 w-full rounded-lg" />)}
            </div>
          ) : swaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <ArrowLeftRight className="size-8 opacity-20 mb-2" />
              <p className="text-[13px]">{locale === "es" ? "No hay solicitudes de cambio" : "No swap requests"}</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {swaps.map((swap) => {
                const isInitiator = viewerStaffId === swap.initiator_staff_id
                const isTarget = viewerStaffId === swap.target_staff_id
                const isPending = ["pending_manager", "manager_approved", "pending_target"].includes(swap.status)
                const isResolved = ["approved", "rejected", "cancelled"].includes(swap.status)

                // Manager can approve/reject pending_manager
                const canApprove = canEdit && swap.status === "pending_manager"
                // Target can accept pending_target
                const canAccept = isTarget && swap.status === "pending_target"
                // Initiator can cancel pending
                const canCancel = isInitiator && isPending

                const swapLabel = swap.swap_type === "shift_swap"
                  ? `${swap.swap_shift_type} ↔ ${isInitiator ? swap.targetName : swap.initiatorName}`
                  : `${locale === "es" ? "Libre" : "Off"} → ${isInitiator ? swap.targetName : swap.initiatorName}`

                const a = actioning[swap.id]

                return (
                  <div
                    key={swap.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-border",
                      isResolved && "opacity-60"
                    )}
                  >
                    <ArrowLeftRight className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium leading-tight truncate">{swapLabel}</p>
                      {canEdit && (
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {swap.initiatorName} → {swap.targetName ?? "—"}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(swap.swap_date, locale)}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border", STATUS_STYLE[swap.status] ?? "")}>
                          {statusLabel(swap.status)}
                        </span>
                      </div>

                      {/* Manager approve/reject */}
                      {canApprove && !a && (
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => handleAction(swap.id, "approve", swap.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          >
                            <Check className="size-3" /> {locale === "es" ? "Aprobar" : "Approve"}
                          </button>
                          <button
                            onClick={() => handleAction(swap.id, "reject", swap.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                          >
                            <X className="size-3" /> {locale === "es" ? "Rechazar" : "Reject"}
                          </button>
                          <button
                            onClick={() => {
                              const prompt = locale === "es"
                                ? `¿Qué impacto tendría en la cobertura si ${swap.initiatorName} intercambia su turno ${swap.swap_shift_type} con ${swap.targetName ?? "—"} el ${swap.swap_date}?`
                                : `What would be the coverage impact if ${swap.initiatorName} swaps their ${swap.swap_shift_type} shift with ${swap.targetName ?? "—"} on ${swap.swap_date}?`
                              setOpen(false)
                              // Open AI chat with pre-filled prompt
                              window.dispatchEvent(new CustomEvent("labrota:ai-prompt", { detail: prompt }))
                              window.dispatchEvent(new Event("labrota:toggle-chat"))
                            }}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium text-primary border border-primary/20 hover:bg-primary/5 transition-colors"
                            title={locale === "es" ? "Analizar impacto con IA" : "Check impact with AI"}
                          >
                            <Sparkles className="size-3" />
                          </button>
                        </div>
                      )}

                      {/* Target accept/decline */}
                      {canAccept && !a && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={() => handleAction(swap.id, "accept", swap.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                          >
                            <Check className="size-3" /> {locale === "es" ? "Aceptar" : "Accept"}
                          </button>
                          <button
                            onClick={() => handleAction(swap.id, "cancel", swap.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-medium bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors"
                          >
                            <X className="size-3" /> {locale === "es" ? "Declinar" : "Decline"}
                          </button>
                        </div>
                      )}

                      {/* Loading indicator */}
                      {a && (
                        <div className="flex items-center gap-1 mt-2 text-[11px] text-muted-foreground">
                          <Loader2 className="size-3 animate-spin" />
                          {locale === "es" ? "Procesando..." : "Processing..."}
                        </div>
                      )}
                    </div>

                    {/* Cancel button for initiator */}
                    {canCancel && !canApprove && !a && (
                      <button
                        onClick={() => handleAction(swap.id, "cancel", swap.id)}
                        className="shrink-0 size-6 rounded flex items-center justify-center hover:bg-muted transition-colors mt-0.5"
                        title={locale === "es" ? "Cancelar" : "Cancel"}
                      >
                        <X className="size-3 text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
