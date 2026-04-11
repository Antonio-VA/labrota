"use client"

import { useState, useTransition, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { toast } from "sonner"
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { quickCreateLeave, previewLeaveBalance } from "@/app/(clinic)/leaves/actions"

export function InlineLeaveForm({ staffId, open, onClose, onCreated }: { staffId: string | null; open: boolean; onClose: () => void; onCreated: () => void }) {
  const t = useTranslations("schedule")
  const tl = useTranslations("leaves")
  const tc = useTranslations("common")
  const locale = useLocale() as "es" | "en"
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState("annual")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [notes, setNotes] = useState("")
  const [balancePreview, setBalancePreview] = useState<Awaited<ReturnType<typeof previewLeaveBalance>>>(null)

  useEffect(() => {
    if (!staffId || !startDate || !endDate || endDate < startDate) { setBalancePreview(null); return }
    const timer = setTimeout(async () => {
      const result = await previewLeaveBalance({ staffId, type, startDate, endDate })
      setBalancePreview(result)
    }, 350)
    return () => clearTimeout(timer)
  }, [staffId, type, startDate, endDate])

  function reset() {
    setType("annual")
    setStartDate("")
    setEndDate("")
    setNotes("")
    onClose()
  }

  function handleSubmit() {
    if (!staffId || !startDate || !endDate) return
    startTransition(async () => {
      const result = await quickCreateLeave({ staffId, type, startDate, endDate, notes })
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("leaveRecorded"))
        reset()
        onCreated()
      }
    })
  }

  if (!open) return null

  return (
    <div className="px-5 py-3 border-t border-border flex flex-col gap-2">
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">{t("newLeave")}</p>
      <select
        value={type}
        onChange={(e) => setType(e.target.value)}
        className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none w-full"
      >
        <option value="annual">{tl("types.annual")}</option>
        <option value="sick">{tl("types.sick")}</option>
        <option value="personal">{tl("types.personal")}</option>
        <option value="training">{tl("types.training")}</option>
        <option value="maternity">{tl("types.maternity")}</option>
        <option value="other">{tl("types.other")}</option>
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); if (!endDate || endDate < e.target.value) setEndDate(e.target.value) }}
          className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none"
        />
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          min={startDate}
          className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none"
        />
      </div>
      {balancePreview && (
        <div className={cn(
          "flex items-center gap-1.5 rounded px-2 py-1.5 text-[11px]",
          balancePreview.blocked
            ? "bg-destructive/10 text-destructive"
            : balancePreview.overflow?.needed
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
        )}>
          {balancePreview.blocked
            ? <AlertCircle className="size-3 shrink-0" />
            : balancePreview.overflow?.needed
              ? <AlertTriangle className="size-3 shrink-0" />
              : <CheckCircle2 className="size-3 shrink-0" />
          }
          <span>
            {balancePreview.blocked
              ? (locale === "es" ? `Saldo insuf.: ${balancePreview.available}d disp., ${balancePreview.daysCounted}d sol.` : `Low balance: ${balancePreview.available}d avail., ${balancePreview.daysCounted}d req.`)
              : balancePreview.overflow?.needed
                ? `${balancePreview.overflow.mainDays}d + ${balancePreview.overflow.overflowDays}d ${balancePreview.overflow.overflowTypeName ?? ""}`
                : balancePreview.found
                  ? (locale === "es" ? `${balancePreview.daysCounted}d · ${balancePreview.available - balancePreview.daysCounted}d restantes` : `${balancePreview.daysCounted}d · ${balancePreview.available - balancePreview.daysCounted}d left`)
                  : null
            }
          </span>
        </div>
      )}
      <input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t("notesOptional")}
        className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none w-full"
      />
      <div className="flex items-center gap-2 mt-1">
        <Button size="sm" onClick={handleSubmit} disabled={isPending || !startDate || !endDate} className="text-[12px] h-7">
          {isPending ? tc("saving") : tc("save")}
        </Button>
        <button onClick={reset} className="text-[12px] text-muted-foreground hover:underline">
          {tc("cancel")}
        </button>
      </div>
    </div>
  )
}
