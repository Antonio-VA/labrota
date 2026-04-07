"use client"

import { useEffect, useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { ArrowLeftRight, X, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDate } from "@/lib/format-date"
import { Badge } from "@/components/ui/badge"
import type { SwapRequestWithNames } from "@/app/(clinic)/swaps/actions"

interface SwapRequestsListProps {
  staffId: string
  locale: "es" | "en"
}

const STATUS_STYLE: Record<string, string> = {
  pending_manager: "bg-amber-100 text-amber-700 border-amber-200",
  manager_approved: "bg-amber-100 text-amber-700 border-amber-200",
  pending_target: "bg-blue-100 text-blue-700 border-blue-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
}

export function SwapRequestsList({ staffId, locale }: SwapRequestsListProps) {
  const t = useTranslations("swaps")
  const [swaps, setSwaps] = useState<SwapRequestWithNames[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, startCancel] = useTransition()

  useEffect(() => {
    let mounted = true
    async function load() {
      const { getMySwapRequests } = await import("@/app/(clinic)/swaps/actions")
      const data = await getMySwapRequests(staffId)
      if (mounted) {
        setSwaps(data)
        setLoading(false)
      }
    }
    load()
    return () => { mounted = false }
  }, [staffId])

  function handleCancel(swapId: string) {
    startCancel(async () => {
      const { cancelSwapRequest } = await import("@/app/(clinic)/swaps/actions")
      const result = await cancelSwapRequest(swapId)
      if (!result.error) {
        setSwaps(prev => prev.map(s => s.id === swapId ? { ...s, status: "cancelled" } : s))
      }
    })
  }

  if (loading) return null
  if (swaps.length === 0) return null

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

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t("mySwaps")}</p>
      {swaps.slice(0, 5).map(swap => {
        const isInitiator = swap.initiator_staff_id === staffId
        const otherName = isInitiator ? swap.targetName : swap.initiatorName
        const canCancel = isInitiator && ["pending_manager", "manager_approved", "pending_target"].includes(swap.status)

        return (
          <div key={swap.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-background">
            <ArrowLeftRight className="size-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium truncate">
                {swap.swap_type === "shift_swap"
                  ? `${swap.swap_shift_type} ↔ ${otherName ?? "—"}`
                  : `${locale === "es" ? "Libre" : "Off"} → ${otherName ?? "—"}`}
              </p>
              <p className="text-[11px] text-muted-foreground">{formatDate(swap.swap_date, locale)}</p>
            </div>
            <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded border shrink-0", STATUS_STYLE[swap.status] ?? "")}>
              {statusLabel(swap.status)}
            </span>
            {canCancel && (
              <button
                onClick={() => handleCancel(swap.id)}
                disabled={cancelling}
                className="shrink-0 size-6 rounded flex items-center justify-center hover:bg-muted transition-colors"
                title={locale === "es" ? "Cancelar" : "Cancel"}
              >
                {cancelling ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3 text-muted-foreground" />}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
