"use client"

import { useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeftRight, Check, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format-date"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { SwapRequestWithNames } from "@/app/(clinic)/swaps/actions"

interface ManagerSwapPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  locale: "es" | "en"
  onCountChange?: (count: number) => void
}

export function ManagerSwapPanel({ open, onOpenChange, locale, onCountChange }: ManagerSwapPanelProps) {
  const t = useTranslations("swaps")
  const [swaps, setSwaps] = useState<SwapRequestWithNames[]>([])
  const [loading, setLoading] = useState(false)
  const [approving, startApprove] = useTransition()
  const [rejecting, startReject] = useTransition()
  const [actionId, setActionId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { getPendingSwapRequestsForManager } = await import("@/app/(clinic)/swaps/actions")
    const data = await getPendingSwapRequestsForManager()
    setSwaps(data)
    onCountChange?.(data.length)
    setLoading(false)
  }

  useEffect(() => {
    if (open) load()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleApprove(swapId: string) {
    setActionId(swapId)
    startApprove(async () => {
      const { approveSwapByManager } = await import("@/app/(clinic)/swaps/actions")
      const result = await approveSwapByManager(swapId)
      if (!result.error) {
        setSwaps(prev => prev.filter(s => s.id !== swapId))
        onCountChange?.(swaps.length - 1)
      }
      setActionId(null)
    })
  }

  function handleReject(swapId: string) {
    setActionId(swapId)
    startReject(async () => {
      const { rejectSwapByManager } = await import("@/app/(clinic)/swaps/actions")
      const result = await rejectSwapByManager(swapId)
      if (!result.error) {
        setSwaps(prev => prev.filter(s => s.id !== swapId))
        onCountChange?.(swaps.length - 1)
      }
      setActionId(null)
    })
  }

  const isActing = approving || rejecting

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[380px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-5 py-4 border-b border-border shrink-0">
          <SheetTitle className="text-[16px] font-medium flex items-center gap-2">
            <ArrowLeftRight className="size-4 text-primary" />
            {t("pendingApprovals")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : swaps.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <ArrowLeftRight className="size-8 text-muted-foreground/30" />
              <p className="text-[13px] text-muted-foreground">
                {locale === "es" ? "Sin solicitudes pendientes" : "No pending requests"}
              </p>
            </div>
          ) : (
            swaps.map(swap => (
              <div key={swap.id} className="rounded-lg border border-border bg-background p-3 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium">
                      {swap.initiatorName}
                      <span className="text-muted-foreground font-normal">
                        {" "}{locale === "es" ? "→" : "→"}{" "}
                        {swap.swap_type === "shift_swap"
                          ? (locale === "es" ? "intercambiar con" : "swap with")
                          : (locale === "es" ? "día libre, cubierto por" : "day off, covered by")}
                        {" "}{swap.targetName ?? "—"}
                      </span>
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {formatDate(swap.swap_date, locale)} · {swap.swap_shift_type}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleApprove(swap.id)}
                    disabled={isActing && actionId === swap.id}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                      "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200",
                      "disabled:opacity-50"
                    )}
                  >
                    {isActing && actionId === swap.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
                    {locale === "es" ? "Aprobar" : "Approve"}
                  </button>
                  <button
                    onClick={() => handleReject(swap.id)}
                    disabled={isActing && actionId === swap.id}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                      "bg-red-50 text-red-700 hover:bg-red-100 border border-red-200",
                      "disabled:opacity-50"
                    )}
                  >
                    {isActing && actionId === swap.id ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}
                    {locale === "es" ? "Rechazar" : "Reject"}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
