"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { formatDateWithYear } from "@/lib/format-date"
import { approveLeave, rejectLeave } from "@/app/(clinic)/leaves/actions"
import { daysBetween, LEAVE_TYPE_CONFIG } from "./constants"
import type { LeaveWithStaff, LeaveType } from "@/lib/types/database"

// ── Pending leave requests panel ─────────────────────────────────────────────

export function PendingRequests({ leaves, isAdmin, locale }: { leaves: LeaveWithStaff[]; isAdmin: boolean; locale: "es" | "en" }) {
  const t = useTranslations("leaves")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const pending = leaves.filter((l) => l.status === "pending")
  if (pending.length === 0 || !isAdmin) return null

  return (
    <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
      <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300 mb-3">
        {t("pendingRequests")} ({pending.length})
      </p>
      <div className="flex flex-col gap-2">
        {pending.map((l) => {
          const staffName = l.staff ? `${l.staff.first_name} ${l.staff.last_name}` : "—"
          const typeConf = LEAVE_TYPE_CONFIG[l.type as LeaveType]
          const days = daysBetween(l.start_date, l.end_date)
          return (
            <div key={l.id} className="flex items-center gap-3 bg-background rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800">
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium">{staffName}</p>
                <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  {typeConf && <span className={typeConf.color}>{(LEAVE_TYPE_CONFIG[l.type as LeaveType] as typeof typeConf)?.color ? l.type : l.type}</span>}
                  <span>{formatDateWithYear(l.start_date, locale)} — {formatDateWithYear(l.end_date, locale)}</span>
                  <span>({days}d)</span>
                </div>
                {l.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{l.notes}</p>}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    await approveLeave(l.id)
                    router.refresh()
                  })}
                  className="text-[12px] font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors disabled:opacity-50"
                >
                  {t("approveLeave")}
                </button>
                <button
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    await rejectLeave(l.id)
                    router.refresh()
                  })}
                  className="text-[12px] font-medium text-amber-700 dark:text-amber-400 hover:text-amber-800 px-2 py-1 rounded hover:bg-amber-100 dark:hover:bg-amber-950/40 transition-colors disabled:opacity-50"
                >
                  {t("rejectLeave")}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
