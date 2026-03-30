"use client"

import { useActionState, useEffect, useState, useTransition, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import {
  CalendarOff, Plane, Cross, User, GraduationCap, Baby, CalendarX, FileUp, Info, UserX, ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react"
import { LeaveFileImport } from "@/components/leave-file-import"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { createLeave, updateLeave, deleteLeave, approveLeave, rejectLeave, requestLeave, cancelLeave } from "@/app/(clinic)/leaves/actions"
import { formatDateWithYear } from "@/lib/format-date"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { LeaveWithStaff, Staff, LeaveType } from "@/lib/types/database"

// ── Days between two ISO date strings (inclusive) ─────────────────────────────
function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T12:00:00")
  const e = new Date(end + "T12:00:00")
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

const TODAY = new Date().toISOString().split("T")[0]

// ── Leave type config (icon + color) ─────────────────────────────────────────

const LEAVE_TYPE_CONFIG: Record<LeaveType, {
  icon: React.ElementType
  color: string      // text color
  bg: string         // light background
  border: string     // subtle border
}> = {
  annual:    { icon: Plane,          color: "text-sky-600 dark:text-sky-400",       bg: "bg-sky-50 dark:bg-sky-950/40",       border: "border-sky-200 dark:border-sky-800" },
  sick:      { icon: Cross,         color: "text-red-600 dark:text-red-400",       bg: "bg-red-50 dark:bg-red-950/40",       border: "border-red-200 dark:border-red-800" },
  personal:  { icon: User,          color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-50 dark:bg-violet-950/40", border: "border-violet-200 dark:border-violet-800" },
  training:  { icon: GraduationCap, color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-50 dark:bg-amber-950/40",   border: "border-amber-200 dark:border-amber-800" },
  maternity: { icon: Baby,          color: "text-pink-600 dark:text-pink-400",     bg: "bg-pink-50 dark:bg-pink-950/40",     border: "border-pink-200 dark:border-pink-800" },
  other:     { icon: CalendarX,     color: "text-slate-600 dark:text-slate-400",   bg: "bg-slate-50 dark:bg-slate-950/40",   border: "border-slate-200 dark:border-slate-800" },
}

const ALL_LEAVE_TYPES: LeaveType[] = ["annual", "sick", "personal", "training", "maternity", "other"]

function LeaveTypeBadge({ type, label }: { type: LeaveType; label: string }) {
  const cfg = LEAVE_TYPE_CONFIG[type] ?? LEAVE_TYPE_CONFIG.other
  const Icon = cfg.icon
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12px] font-medium", cfg.bg, cfg.border, cfg.color)}>
      <Icon className="size-3" />
      {label}
    </span>
  )
}

// ── Date range picker (booking.com style) ────────────────────────────────────

const MONTH_NAMES: Record<string, string[]> = {
  es: ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"],
  en: ["January","February","March","April","May","June","July","August","September","October","November","December"],
}
const DAY_NAMES: Record<string, string[]> = {
  es: ["Lu","Ma","Mi","Ju","Vi","Sá","Do"],
  en: ["Mo","Tu","We","Th","Fr","Sa","Su"],
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function DateRangePicker({
  startDate,
  endDate,
  onChange,
  disabled,
  locale,
  label,
}: {
  startDate: string | null
  endDate: string | null
  onChange: (start: string, end: string) => void
  disabled?: boolean
  locale: "es" | "en"
  label: string
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [selecting, setSelecting] = useState<"start" | "end">("start")
  const [tempStart, setTempStart] = useState<string | null>(startDate)
  const [tempEnd, setTempEnd] = useState<string | null>(endDate)
  const today = new Date()
  const initialMonth = startDate ? new Date(startDate + "T12:00:00") : today
  const [viewYear, setViewYear] = useState(initialMonth.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialMonth.getMonth())

  const months = MONTH_NAMES[locale] ?? MONTH_NAMES.en
  const days = DAY_NAMES[locale] ?? DAY_NAMES.en

  const prevMonth = useCallback(() => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1) }
    else setViewMonth((m) => m - 1)
  }, [viewMonth])
  const nextMonth = useCallback(() => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1) }
    else setViewMonth((m) => m + 1)
  }, [viewMonth])

  function handleDayClick(iso: string) {
    if (selecting === "start") {
      setTempStart(iso)
      setTempEnd(null)
      setSelecting("end")
    } else {
      if (tempStart && iso < tempStart) {
        // Tapped before start — restart
        setTempStart(iso)
        setTempEnd(null)
        setSelecting("end")
      } else {
        setTempEnd(iso)
        onChange(tempStart!, iso)
        setSelecting("start")
        setIsOpen(false)
      }
    }
  }

  function handleOpen() {
    if (disabled) return
    setTempStart(startDate)
    setTempEnd(endDate)
    setSelecting("start")
    if (startDate) {
      const d = new Date(startDate + "T12:00:00")
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
    setIsOpen(true)
  }

  // Build calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  let startDow = firstDay.getDay() - 1 // Mon=0
  if (startDow < 0) startDow = 6
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (number | null)[] = Array(startDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const fmtDisplay = (iso: string | null) => {
    if (!iso) return "—"
    const d = new Date(iso + "T12:00:00")
    return d.toLocaleDateString(locale, { day: "numeric", month: "short" })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[14px] font-medium">{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-left flex items-center gap-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
      >
        <CalendarDays className="size-4 text-muted-foreground shrink-0" />
        <span className={startDate ? "text-foreground" : "text-muted-foreground"}>
          {startDate && endDate
            ? `${fmtDisplay(startDate)} — ${fmtDisplay(endDate)}`
            : startDate
              ? fmtDisplay(startDate)
              : locale === "es" ? "Seleccionar fechas" : "Select dates"}
        </span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/20 flex items-end md:items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false) }}>
            <div className="bg-background border border-border rounded-xl shadow-lg p-4 w-full max-w-[320px] animate-in fade-in-0 zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
              {/* Selection hint */}
              <p className="text-[12px] text-muted-foreground text-center mb-2">
                {selecting === "start"
                  ? (locale === "es" ? "Selecciona fecha de inicio" : "Select start date")
                  : (locale === "es" ? "Selecciona fecha de fin" : "Select end date")}
              </p>

              {/* Month nav */}
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronLeft className="size-4" />
                </button>
                <span className="text-[14px] font-medium">
                  {months[viewMonth]} {viewYear}
                </span>
                <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-muted transition-colors">
                  <ChevronRight className="size-4" />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 gap-0 mb-0.5">
                {days.map((d) => (
                  <div key={d} className="text-[11px] font-medium text-muted-foreground text-center py-1">{d}</div>
                ))}
              </div>

              {/* Day grid */}
              <div className="grid grid-cols-7 gap-0">
                {cells.map((day, i) => {
                  if (day === null) return <div key={i} />
                  const iso = toISO(new Date(viewYear, viewMonth, day))
                  const isStart = iso === tempStart
                  const isEnd = iso === tempEnd
                  const inRange = tempStart && tempEnd && iso > tempStart && iso < tempEnd
                  const isToday = iso === toISO(today)

                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleDayClick(iso)}
                      className={cn(
                        "h-8 text-[13px] rounded-md transition-colors relative",
                        isStart || isEnd
                          ? "bg-primary text-white font-semibold"
                          : inRange
                            ? "bg-primary/10 text-primary font-medium"
                            : isToday
                              ? "font-semibold text-primary"
                              : "text-foreground hover:bg-muted",
                      )}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Inner form (keyed to reset on open/edit change) ───────────────────────────
function LeaveForm({
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
  const locale = useLocale() as "es" | "en"
  const router = useRouter()

  useEffect(() => {
    if ((state as { success?: boolean } | null)?.success) {
      router.refresh()
      onSuccess()
    }
  }, [state, onSuccess, router])

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
      const result = await requestLeave({
        staffId: fd.get("staff_id") as string,
        type: fd.get("type") as string,
        startDate: fd.get("start_date") as string,
        endDate: fd.get("end_date") as string,
        notes: (fd.get("notes") as string) || undefined,
      })
      if (result.error) { setRequestError(result.error); return }
      toast.success(t("requestSent"))
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
          defaultValue={editing?.type ?? "annual"}
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

      {/* Error */}
      {((state as { error?: string } | null)?.error || requestError) && (
        <p className="text-[14px] text-destructive">{(state as { error?: string } | null)?.error ?? requestError}</p>
      )}

      {/* Footer */}
      <SheetFooter className="px-0 mt-auto">
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || isDeleting}>
              {pending ? tc("saving") : useRequestFlow ? t("sendRequest") : editing ? tc("save") : tc("create")}
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

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ leave, t }: { leave: LeaveWithStaff; t: ReturnType<typeof useTranslations<"leaves">> }) {
  const cfg: Record<string, { bg: string; text: string }> = {
    pending:   { bg: "bg-amber-50 border-amber-200", text: "text-amber-700" },
    approved:  { bg: "bg-emerald-50 border-emerald-200", text: "text-emerald-700" },
    rejected:  { bg: "bg-red-50 border-red-200", text: "text-red-700" },
    cancelled: { bg: "bg-slate-50 border-slate-200", text: "text-slate-500" },
  }
  const c = cfg[leave.status] ?? cfg.pending
  const reviewerInfo = leave.reviewed_at && leave.reviewer_name
    ? ` · ${leave.reviewer_name}`
    : ""
  const timeInfo = leave.reviewed_at
    ? ` · ${new Date(leave.reviewed_at).toLocaleDateString()}`
    : ""

  return (
    <div className="flex flex-col gap-0.5">
      <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium w-fit", c.bg, c.text)}>
        {t(`status.${leave.status}`)}
      </span>
      {(reviewerInfo || timeInfo) && leave.status !== "pending" && (
        <span className="text-[10px] text-muted-foreground leading-tight">
          {timeInfo.replace(" · ", "")}{reviewerInfo}
        </span>
      )}
    </div>
  )
}

// ── Mobile leave card ────────────────────────────────────────────────────────
function LeaveCard({
  leave,
  locale,
  onEdit,
  onCancel,
  t,
  muted,
  showStatus,
  canCancel,
}: {
  leave: LeaveWithStaff
  locale: "es" | "en"
  onEdit: (leave: LeaveWithStaff) => void
  onCancel?: (leaveId: string) => void
  t: ReturnType<typeof useTranslations<"leaves">>
  muted: boolean
  showStatus?: boolean
  canCancel?: boolean
}) {
  const days = daysBetween(leave.start_date, leave.end_date)
  return (
    <div
      className={cn("rounded-lg border border-border bg-background px-3.5 py-3 active:bg-muted/40 transition-colors", muted && "opacity-70")}
      onClick={() => onEdit(leave)}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className={cn("text-[14px] font-medium leading-tight", muted && "text-muted-foreground")}>
          {leave.staff.first_name} {leave.staff.last_name}
        </p>
        {showStatus && <StatusBadge leave={leave} t={t} />}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <LeaveTypeBadge type={leave.type} label={t(`types.${leave.type}`)} />
        <span className={cn("text-[12px]", muted ? "text-muted-foreground" : "text-foreground/70")}>
          {formatDateWithYear(leave.start_date, locale)} — {formatDateWithYear(leave.end_date, locale)}
        </span>
        <span className="text-[12px] text-muted-foreground">({days}d)</span>
      </div>
      {onCancel && canCancel && (
        <button
          onClick={(e) => { e.stopPropagation(); onCancel(leave.id) }}
          className="mt-2 text-[12px] text-muted-foreground hover:text-destructive transition-colors"
        >
          {t("cancelLeave")}
        </button>
      )}
    </div>
  )
}

// ── Leaves table + mobile cards ──────────────────────────────────────────────
function LeavesTable({
  rows,
  locale,
  onEdit,
  onCancel,
  t,
  muted,
  showStatus,
  canCancel,
}: {
  rows: LeaveWithStaff[]
  locale: "es" | "en"
  onEdit: (leave: LeaveWithStaff) => void
  onCancel?: (leaveId: string) => void
  t: ReturnType<typeof useTranslations<"leaves">>
  muted: boolean
  showStatus?: boolean
  canCancel?: (leave: LeaveWithStaff) => boolean
}) {
  const cellClass = muted ? "text-muted-foreground" : ""

  return (
    <>
      {/* Mobile cards */}
      <div className="flex flex-col gap-2 md:hidden mb-3">
        {rows.map((leave) => (
          <LeaveCard
            key={leave.id}
            leave={leave}
            locale={locale}
            onEdit={onEdit}
            onCancel={onCancel}
            t={t}
            muted={muted}
            showStatus={showStatus}
            canCancel={canCancel?.(leave)}
          />
        ))}
      </div>

      {/* Desktop table */}
      <div className={`hidden md:block rounded-lg border border-border overflow-hidden mb-3 bg-background ${muted ? "opacity-70" : ""}`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-background">
              <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.staff")}</th>
              <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.type")}</th>
              <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.from")}</th>
              <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.to")}</th>
              <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.days")}</th>
              {showStatus && <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.status")}</th>}
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((leave) => (
              <tr
                key={leave.id}
                className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => onEdit(leave)}
              >
                <td className={`px-4 py-2.5 font-medium ${cellClass}`}>
                  {leave.staff.first_name} {leave.staff.last_name}
                </td>
                <td className="px-4 py-2.5">
                  <LeaveTypeBadge type={leave.type} label={t(`types.${leave.type}`)} />
                </td>
                <td className={`px-4 py-2.5 ${cellClass}`}>{formatDateWithYear(leave.start_date, locale)}</td>
                <td className={`px-4 py-2.5 ${cellClass}`}>{formatDateWithYear(leave.end_date, locale)}</td>
                <td className={`px-4 py-2.5 ${cellClass}`}>{daysBetween(leave.start_date, leave.end_date)}</td>
                {showStatus && (
                  <td className="px-4 py-2.5">
                    <StatusBadge leave={leave} t={t} />
                  </td>
                )}
                <td className="px-4 py-2.5 text-right">
                  {onCancel && canCancel?.(leave) && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onCancel(leave.id) }}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      {t("cancelLeave")}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

// ── KPI cards ────────────────────────────────────────────────────────────────

function KpiCards({ leaves }: { leaves: LeaveWithStaff[] }) {
  const t = useTranslations("leaves")
  // Ausentes hoy — distinct staff off today
  const absentToday = new Set(
    leaves.filter((l) => l.start_date <= TODAY && l.end_date >= TODAY).map((l) => l.staff_id)
  ).size

  // Esta semana — total absence-days overlapping this Mon–Sun
  const todayDate = new Date(TODAY + "T12:00:00")
  const dayOfWeek = todayDate.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekStart = new Date(todayDate)
  weekStart.setDate(todayDate.getDate() + mondayOffset)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)
  const wsISO = weekStart.toISOString().split("T")[0]
  const weISO = weekEnd.toISOString().split("T")[0]

  let thisWeekDays = 0
  for (const l of leaves) {
    if (l.end_date < wsISO || l.start_date > weISO) continue
    const clampStart = l.start_date < wsISO ? wsISO : l.start_date
    const clampEnd = l.end_date > weISO ? weISO : l.end_date
    thisWeekDays += daysBetween(clampStart, clampEnd)
  }

  // Proximas ausencias — leaves starting within next 7 days (not today)
  const sevenDaysOut = new Date(todayDate)
  sevenDaysOut.setDate(todayDate.getDate() + 7)
  const sevenISO = sevenDaysOut.toISOString().split("T")[0]
  const upcoming = leaves.filter((l) => l.start_date > TODAY && l.start_date <= sevenISO).length

  // Próximos 30 días — total absence days in next 30 days
  const thirtyDaysOut = new Date(todayDate)
  thirtyDaysOut.setDate(todayDate.getDate() + 30)
  const thirtyISO = thirtyDaysOut.toISOString().split("T")[0]
  let next30Days = 0
  for (const l of leaves) {
    if (l.end_date < TODAY || l.start_date > thirtyISO) continue
    const clampStart = l.start_date < TODAY ? TODAY : l.start_date
    const clampEnd = l.end_date > thirtyISO ? thirtyISO : l.end_date
    next30Days += daysBetween(clampStart, clampEnd)
  }

  const cards = [
    { label: t("absentToday"), value: absentToday },
    { label: t("thisWeek"), value: thisWeekDays },
    { label: t("upcomingLeaves"), value: upcoming },
    { label: t("next30Days"), value: next30Days },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
      {cards.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-border/60 bg-background px-3 md:px-4 py-2.5 md:py-3">
          <p className="text-[11px] md:text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</p>
          <p className="text-[20px] md:text-[22px] font-semibold text-foreground mt-0.5 leading-tight">{kpi.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Pending requests ──────────────────────────────────────────────────────────

function PendingRequests({ leaves, isAdmin, locale }: { leaves: LeaveWithStaff[]; isAdmin: boolean; locale: "es" | "en" }) {
  const t = useTranslations("leaves")
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const pending = leaves.filter((l) => l.status === "pending")
  if (pending.length === 0 || !isAdmin) return null

  return (
    <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
      <p className="text-[13px] font-medium text-amber-800 mb-3">
        {t("pendingRequests")} ({pending.length})
      </p>
      <div className="flex flex-col gap-2">
        {pending.map((l) => {
          const staffName = l.staff ? `${l.staff.first_name} ${l.staff.last_name}` : "—"
          const typeConf = LEAVE_TYPE_CONFIG[l.type as LeaveType]
          const days = daysBetween(l.start_date, l.end_date)
          return (
            <div key={l.id} className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-amber-200">
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
                  className="text-[12px] font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded hover:bg-emerald-50 transition-colors disabled:opacity-50"
                >
                  {t("approveLeave")}
                </button>
                <button
                  disabled={isPending}
                  onClick={() => startTransition(async () => {
                    await rejectLeave(l.id)
                    router.refresh()
                  })}
                  className="text-[12px] font-medium text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
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

// ── Main list ─────────────────────────────────────────────────────────────────
export function LeavesList({
  leaves,
  staff,
  userRole = "admin",
  viewerStaffId,
  enableLeaveRequests = false,
}: {
  leaves: LeaveWithStaff[]
  staff: Staff[]
  userRole?: "admin" | "manager" | "viewer"
  viewerStaffId?: string | null
  enableLeaveRequests?: boolean
}) {
  const isViewer = userRole === "viewer"
  const t      = useTranslations("leaves")
  const locale = useLocale() as "es" | "en"
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LeaveWithStaff | null>(null)
  const [typeFilter, setTypeFilter] = useState<LeaveType | "all">("all")
  const [showHistory, setShowHistory] = useState(false)
  const [showCancelled, setShowCancelled] = useState(false)
  const [fileImportOpen, setFileImportOpen] = useState(false)
  const [, startCancelTransition] = useTransition()

  function handleCancel(leaveId: string) {
    toast(t("cancelConfirm"), {
      action: {
        label: t("confirmCancel"),
        onClick: () => {
          startCancelTransition(async () => {
            await cancelLeave(leaveId)
            toast.success(t("cancelledSuccess"))
            router.refresh()
          })
        },
      },
    })
  }

  function canCancelLeave(leave: LeaveWithStaff): boolean {
    // Viewers can cancel their own pending/approved leaves
    // Admins/managers can cancel any pending/approved leave
    const status = leave.status ?? "approved" // DB default before migration
    if (status !== "pending" && status !== "approved") return false
    if (isViewer) return leave.staff_id === viewerStaffId
    return true
  }

  // Viewers without linked staff can't access leaves
  if (isViewer && !viewerStaffId) {
    return (
      <EmptyState
        icon={UserX}
        title={t("notLinked")}
        description={t("notLinkedDescription")}
      />
    )
  }

  // Filter leaves: viewers see only their own
  const visibleLeaves = isViewer
    ? leaves.filter((l) => l.staff_id === viewerStaffId)
    : leaves

  const filtered = visibleLeaves.filter((l) => {
    if (typeFilter !== "all" && l.type !== typeFilter) return false
    return true
  })

  // Separate cancelled from active leaves
  const activeFiltered    = filtered.filter((l) => (l.status ?? "approved") !== "cancelled")
  const cancelledFiltered = filtered.filter((l) => (l.status ?? "approved") === "cancelled")

  const filteredUpcoming = activeFiltered.filter((l) => l.end_date >= TODAY)
  const filteredPast     = activeFiltered.filter((l) => l.end_date <  TODAY)

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(leave: LeaveWithStaff) {
    // Viewers can only edit their own leaves
    if (isViewer && leave.staff_id !== viewerStaffId) return
    setEditing(leave)
    setOpen(true)
  }

  function closeSheet() {
    setOpen(false)
    setEditing(null)
  }

  return (
    <div className="flex flex-col pb-16 md:pb-0">
      {/* KPI summary band — hide for viewers */}
      {!isViewer && visibleLeaves.length > 0 && (
        <div className="hidden md:block -mx-8 -mt-8 px-8 pt-8 pb-5 bg-muted/40 border-b border-border mb-5">
          <KpiCards leaves={visibleLeaves.filter((l) => l.status !== "cancelled" && l.status !== "rejected")} />
        </div>
      )}

      {/* Viewer info banner */}
      {isViewer && (
        <div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-700 mb-4">
          <Info className="size-4 mt-0.5 shrink-0" />
          <span>{enableLeaveRequests ? t("viewerRequestInfo") : t("viewerApprovalInfo")}</span>
        </div>
      )}

      {/* Pending leave requests (admins only) */}
      <PendingRequests leaves={visibleLeaves} isAdmin={!isViewer} locale={locale} />

      {/* Content section */}
      <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 md:gap-3 mb-4 flex-wrap">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as LeaveType | "all")}
          className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">{t("columns.type")}: —</option>
          {ALL_LEAVE_TYPES.map((lt) => (
            <option key={lt} value={lt}>{t(`types.${lt}`)}</option>
          ))}
        </select>
        <div className="flex items-center gap-2">
          <Button size="lg" onClick={openCreate}>{isViewer && enableLeaveRequests ? t("sendRequest") : t("addLeave")}</Button>
          {!isViewer && (
            <Button size="lg" variant="outline" className="hidden md:inline-flex" onClick={() => setFileImportOpen(true)}>
              <FileUp className="size-4" />
              {t("addFromFile")}
            </Button>
          )}
        </div>
      </div>

      {/* Empty state — no leaves at all */}
      {visibleLeaves.length === 0 && (
        <EmptyState
          icon={CalendarOff}
          title={t("noLeaves")}
          description={t("noLeavesDescription")}
          action={{ label: t("addLeave"), onClick: openCreate }}
        />
      )}

      {visibleLeaves.length > 0 && filtered.length === 0 && (
        <EmptyState icon={CalendarOff} title={t("noLeaves")} description={t("noLeavesDescription")} />
      )}

      {/* Upcoming / active leaves */}
      {filteredUpcoming.length > 0 && (
        <LeavesTable rows={filteredUpcoming} locale={locale} onEdit={openEdit} t={t} muted={false} showStatus={enableLeaveRequests} onCancel={handleCancel} canCancel={canCancelLeave} />
      )}

      {filteredUpcoming.length === 0 && filteredPast.length > 0 && (
        <EmptyState icon={CalendarOff} title={t("noLeaves")} description={t("noLeavesDescription")} />
      )}

      {/* History toggle */}
      {filteredPast.length > 0 && (
        <button
          onClick={() => setShowHistory((v) => !v)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <span>{showHistory ? "▾" : "▸"}</span>
          {showHistory
            ? t("hideHistory")
            : t("showHistory", { count: filteredPast.length })}
        </button>
      )}

      {/* Past leaves */}
      {showHistory && filteredPast.length > 0 && (
        <LeavesTable rows={filteredPast} locale={locale} onEdit={openEdit} t={t} muted showStatus={enableLeaveRequests} onCancel={handleCancel} canCancel={canCancelLeave} />
      )}

      {/* Cancelled toggle */}
      {cancelledFiltered.length > 0 && (
        <button
          onClick={() => setShowCancelled((v) => !v)}
          className="flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          <span>{showCancelled ? "▾" : "▸"}</span>
          {showCancelled
            ? t("hideCancelled")
            : t("showCancelled", { count: cancelledFiltered.length })}
        </button>
      )}

      {/* Cancelled leaves */}
      {showCancelled && cancelledFiltered.length > 0 && (
        <LeavesTable rows={cancelledFiltered} locale={locale} onEdit={openEdit} t={t} muted showStatus={enableLeaveRequests} />
      )}

      {/* Sheet */}
      <Sheet open={open} onOpenChange={(o) => { if (!o) closeSheet() }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="text-[16px]">
              {editing ? t("editLeave") : t("addLeave")}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto py-4">
            <LeaveForm
              key={editing?.id ?? "new"}
              staff={staff}
              editing={editing}
              onSuccess={closeSheet}
              viewerStaffId={isViewer ? viewerStaffId : undefined}
              isRequestMode={enableLeaveRequests}
              onCancelLeave={enableLeaveRequests ? handleCancel : undefined}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* File import modal */}
      {fileImportOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setFileImportOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[600px] max-h-[80vh] overflow-y-auto p-6">
            <LeaveFileImport
              staff={staff.map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name }))}
              onClose={() => setFileImportOpen(false)}
            />
          </div>
        </>
      )}
      </div>
    </div>
  )
}
