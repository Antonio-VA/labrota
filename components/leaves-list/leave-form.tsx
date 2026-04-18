"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { Info, AlertCircle, CheckCircle2, AlertTriangle, Paperclip, X as XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { SheetFooter } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { createLeave, updateLeave, deleteLeave, requestLeave, previewLeaveBalance, uploadLeaveAttachment } from "@/app/(clinic)/leaves/actions"
import { DateRangePicker } from "./date-range-picker"
import { ALL_LEAVE_TYPES } from "./constants"
import type { LeaveWithStaff, Staff } from "@/lib/types/database"

// ── Leave create/edit form ───────────────────────────────────────────────────

export function LeaveForm({
  staff,
  editing,
  onSuccess,
  viewerStaffId,
  isRequestMode,
  onCancelLeave,
}: {
  staff: Staff[]
  editing: LeaveWithStaff | null
  onSuccess: () => void
  viewerStaffId?: string | null
  isRequestMode?: boolean
  onCancelLeave?: (leaveId: string) => void
}) {
  const isViewerMode = !!viewerStaffId
  const t  = useTranslations("leaves")
  const tc = useTranslations("common")

  // In request mode (viewer + leave requests enabled), use requestLeave action
  const useRequestFlow = isRequestMode && isViewerMode && !editing
  const action = editing ? updateLeave.bind(null, editing.id) : createLeave
  const [state, formAction, isPending] = useActionState(action, null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, startDelete] = useTransition()
  const [isRequesting, startRequest] = useTransition()
  const [requestError, setRequestError] = useState<string | null>(null)
  const [startDate, setStartDate] = useState<string | null>(editing?.start_date ?? null)
  const [endDate, setEndDate] = useState<string | null>(editing?.end_date ?? null)
  const [leaveType, setLeaveType] = useState<string>(editing?.type ?? "annual")
  const [balancePreview, setBalancePreview] = useState<Awaited<ReturnType<typeof previewLeaveBalance>>>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const locale = useLocale() as "es" | "en"
  const router = useRouter()

  // Live balance preview — debounced, only in request mode
  /* eslint-disable react-hooks/set-state-in-effect -- debounced fetch-on-change */
  useEffect(() => {
    if (!useRequestFlow || !viewerStaffId || !startDate || !endDate || endDate < startDate) {
      setBalancePreview(null)
      return
    }
    setPreviewLoading(true)
    const timer = setTimeout(async () => {
      const result = await previewLeaveBalance({ staffId: viewerStaffId, type: leaveType, startDate, endDate })
      setBalancePreview(result)
      setPreviewLoading(false)
    }, 350)
    return () => clearTimeout(timer)
  }, [useRequestFlow, viewerStaffId, startDate, endDate, leaveType])
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if ((state as { success?: boolean } | null)?.success) {
      toast.success(t("leaveSaved"))
      router.refresh()
      onSuccess()
    }
  }, [state, onSuccess, router, editing, t])

  function handleDelete() {
    startDelete(async () => {
      await deleteLeave(editing!.id)
      router.refresh()
      onSuccess()
    })
  }

  function handleRequestSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startRequest(async () => {
      let attachmentUrl: string | undefined
      if (attachmentFile) {
        const uploadFd = new FormData()
        uploadFd.set("file", attachmentFile)
        const up = await uploadLeaveAttachment(uploadFd)
        if (up.error) { setRequestError(up.error); return }
        attachmentUrl = up.url
      }
      const result = await requestLeave({
        staffId: fd.get("staff_id") as string,
        type: fd.get("type") as import("@/lib/types/database").LeaveType,
        startDate: fd.get("start_date") as string,
        endDate: fd.get("end_date") as string,
        notes: (fd.get("notes") as string) || undefined,
        attachmentUrl,
      })
      if (result.error) { setRequestError(result.error); return }
      toast.success(t("requestSent"))
      if (result.info) toast.info(result.info)
      router.refresh()
      onSuccess()
    })
  }

  const pending = isPending || isRequesting

  return (
    <form action={useRequestFlow ? undefined : formAction} onSubmit={useRequestFlow ? handleRequestSubmit : undefined} className="flex flex-col gap-4 px-4 flex-1 overflow-auto">
      {/* Request mode banner */}
      {useRequestFlow && (
        <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-[13px] text-sky-700">
          <Info className="size-4 mt-0.5 shrink-0" />
          <span>{t("requestBanner")}</span>
        </div>
      )}
      {/* Staff */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[14px] font-medium">{t("fields.staff")}</label>
        {isViewerMode ? (
          <>
            <input type="hidden" name="staff_id" value={viewerStaffId!} />
            <div className="h-8 w-full rounded-lg border border-input bg-muted/50 px-2.5 text-sm flex items-center text-muted-foreground">
              {staff.find((s) => s.id === viewerStaffId)?.first_name ?? ""} {staff.find((s) => s.id === viewerStaffId)?.last_name ?? ""}
            </div>
          </>
        ) : (
          <select
            name="staff_id"
            defaultValue={editing?.staff_id ?? ""}
            disabled={isPending}
            required
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            <option value="" disabled>— {t("fields.staff")} —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.first_name} {s.last_name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[14px] font-medium">{t("fields.type")}</label>
        <select
          name="type"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          disabled={isPending}
          className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {ALL_LEAVE_TYPES.map((lt) => (
            <option key={lt} value={lt}>{t(`types.${lt}`)}</option>
          ))}
        </select>
      </div>

      {/* Dates */}
      <input type="hidden" name="start_date" value={startDate ?? ""} />
      <input type="hidden" name="end_date" value={endDate ?? ""} />
      <DateRangePicker
        startDate={startDate}
        endDate={endDate}
        onChange={(s, e) => { setStartDate(s); setEndDate(e) }}
        disabled={isPending}
        locale={locale}
        label={t("fields.dates")}
      />

      {/* Balance preview */}
      {useRequestFlow && (balancePreview || previewLoading) && (
        <div className={cn(
          "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[13px] transition-all",
          previewLoading
            ? "border-border bg-muted/40 text-muted-foreground"
            : balancePreview?.blocked
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : balancePreview?.overflow?.needed
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-emerald-300 bg-emerald-50 text-emerald-800"
        )}>
          {previewLoading ? (
            <div className="size-4 rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground animate-spin shrink-0" />
          ) : balancePreview?.blocked ? (
            <AlertCircle className="size-4 shrink-0" />
          ) : balancePreview?.overflow?.needed ? (
            <AlertTriangle className="size-4 shrink-0" />
          ) : (
            <CheckCircle2 className="size-4 shrink-0" />
          )}
          <span>
            {previewLoading
              ? t("checkingBalance")
              : balancePreview?.blocked
                ? t("insufficientBalance", { available: balancePreview.available, daysCounted: balancePreview.daysCounted })
                : balancePreview?.overflow?.needed
                  ? t("overflowBalance", { mainDays: balancePreview.overflow.mainDays, mainType: balancePreview.leaveTypeName ?? leaveType, overflowDays: balancePreview.overflow.overflowDays, overflowType: balancePreview.overflow.overflowTypeName ?? "" })
                  : balancePreview?.found
                    ? t("balanceRequested", { daysCounted: balancePreview.daysCounted, remaining: balancePreview.available - balancePreview.daysCounted })
                    : null
            }
          </span>
        </div>
      )}

      {/* Notes */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[14px] font-medium">
          {t("fields.notes")}
          <span className="ml-1 text-[12px] font-normal text-muted-foreground">({tc("optional")})</span>
        </label>
        <textarea
          name="notes"
          defaultValue={editing?.notes ?? ""}
          disabled={isPending}
          rows={3}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 resize-none"
        />
      </div>

      {/* Attachment — only in request mode */}
      {useRequestFlow && (
        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-medium">
            {t("attachment")}
            <span className="ml-1 text-[12px] font-normal text-muted-foreground">({tc("optional")})</span>
          </label>
          {attachmentFile ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2">
              <Paperclip className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-[13px] flex-1 truncate">{attachmentFile.name}</span>
              <button type="button" onClick={() => setAttachmentFile(null)} className="text-muted-foreground hover:text-foreground">
                <XIcon className="size-3.5" />
              </button>
            </div>
          ) : (
            <label className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 cursor-pointer hover:bg-muted/40 transition-colors">
              <Paperclip className="size-3.5 text-muted-foreground shrink-0" />
              <span className="text-[13px] text-muted-foreground">
                {t("attachmentHint")}
              </span>
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (f.size > 10 * 1024 * 1024) { toast.error(t("fileExceedsLimit")); return }
                  setAttachmentFile(f)
                }}
              />
            </label>
          )}
        </div>
      )}

      {/* Error */}
      {((state as { error?: string } | null)?.error || requestError) && (
        <p className="text-[14px] text-destructive">{(state as { error?: string } | null)?.error ?? requestError}</p>
      )}

      {/* Footer */}
      <SheetFooter className="px-0 mt-auto">
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || isDeleting || (useRequestFlow && !!balancePreview?.blocked)}>
              {pending ? tc("saving") : useRequestFlow ? t("submitRequest") : editing ? tc("save") : tc("create")}
            </Button>
            <Button type="button" variant="outline" disabled={pending} onClick={onSuccess}>
              {tc("cancel")}
            </Button>
          </div>

          {editing && (!isViewerMode || editing.staff_id === viewerStaffId) && (() => {
            const status = editing.status ?? "approved"
            const showCancel = onCancelLeave && (status === "pending" || status === "approved")
            const showDelete = !isViewerMode && !showCancel

            if (showCancel && !confirmDelete) {
              return (
                <Button type="button" variant="destructive" disabled={pending || isDeleting} onClick={() => setConfirmDelete(true)}>
                  {t("cancelLeave")}
                </Button>
              )
            }
            if (showDelete && !confirmDelete) {
              return (
                <Button type="button" variant="destructive" disabled={pending || isDeleting} onClick={() => setConfirmDelete(true)}>
                  {tc("delete")}
                </Button>
              )
            }
            if (confirmDelete) {
              return (
                <div className="flex items-center gap-2">
                  <Button type="button" variant="destructive" disabled={isDeleting} onClick={() => {
                    if (showCancel) { onCancelLeave!(editing.id); onSuccess() }
                    else handleDelete()
                  }}>
                    {isDeleting ? "…" : tc("confirm")}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                    {tc("cancel")}
                  </Button>
                </div>
              )
            }
            return null
          })()}
        </div>
      </SheetFooter>
    </form>
  )
}
