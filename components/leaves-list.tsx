"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import {
  CalendarOff, Plane, Cross, User, GraduationCap, Baby, CalendarX, FileUp,
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
import { createLeave, updateLeave, deleteLeave } from "@/app/(clinic)/leaves/actions"
import { formatDateWithYear } from "@/lib/format-date"
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

// ── Inner form (keyed to reset on open/edit change) ───────────────────────────
function LeaveForm({
  staff,
  editing,
  onSuccess,
  viewerStaffId,
}: {
  staff: Staff[]
  editing: LeaveWithStaff | null
  onSuccess: () => void
  viewerStaffId?: string | null
}) {
  const isViewerMode = !!viewerStaffId
  const t  = useTranslations("leaves")
  const tc = useTranslations("common")

  const action = editing ? updateLeave.bind(null, editing.id) : createLeave
  const [state, formAction, isPending] = useActionState(action, null)

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, startDelete] = useTransition()
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

  return (
    <form action={formAction} className="flex flex-col gap-4 px-4 flex-1 overflow-auto">
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
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-medium">{t("fields.startDate")}</label>
          <Input name="start_date" type="date" defaultValue={editing?.start_date} disabled={isPending} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-medium">{t("fields.endDate")}</label>
          <Input name="end_date" type="date" defaultValue={editing?.end_date} disabled={isPending} required />
        </div>
      </div>

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
      {(state as { error?: string } | null)?.error && (
        <p className="text-[14px] text-destructive">{(state as { error: string }).error}</p>
      )}

      {/* Footer */}
      <SheetFooter className="px-0 mt-auto">
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="flex gap-2">
            <Button type="submit" disabled={isPending || isDeleting}>
              {isPending ? tc("saving") : editing ? tc("save") : tc("create")}
            </Button>
            <Button type="button" variant="outline" disabled={isPending} onClick={onSuccess}>
              {tc("cancel")}
            </Button>
          </div>

          {editing && !confirmDelete && (!isViewerMode || editing.staff_id === viewerStaffId) && (
            <Button type="button" variant="destructive" disabled={isPending || isDeleting} onClick={() => setConfirmDelete(true)}>
              {tc("delete")}
            </Button>
          )}
          {editing && confirmDelete && (!isViewerMode || editing.staff_id === viewerStaffId) && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="destructive" disabled={isDeleting} onClick={handleDelete}>
                {isDeleting ? "…" : tc("confirm")}
              </Button>
              <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
                {tc("cancel")}
              </Button>
            </div>
          )}
        </div>
      </SheetFooter>
    </form>
  )
}

// ── Leaves table ──────────────────────────────────────────────────────────────
function LeavesTable({
  rows,
  locale,
  onEdit,
  t,
  muted,
}: {
  rows: LeaveWithStaff[]
  locale: "es" | "en"
  onEdit: (leave: LeaveWithStaff) => void
  t: ReturnType<typeof useTranslations<"leaves">>
  muted: boolean
}) {
  const cellClass = muted ? "text-muted-foreground" : ""

  return (
    <div className={`rounded-lg border border-border overflow-hidden mb-3 bg-background ${muted ? "opacity-70" : ""}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-background">
            <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.staff")}</th>
            <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.type")}</th>
            <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.from")}</th>
            <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.to")}</th>
            <th className="text-left px-4 py-2 text-[12px] font-medium text-muted-foreground">{t("columns.days")}</th>
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
              <td className="px-4 py-2.5" />
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── KPI cards ────────────────────────────────────────────────────────────────

function KpiCards({ leaves }: { leaves: LeaveWithStaff[] }) {
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
    { label: "Ausentes hoy", value: absentToday },
    { label: "Esta semana", value: thisWeekDays },
    { label: "Próx. ausencias", value: upcoming },
    { label: "Próximos 30 días", value: next30Days },
  ]

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map((kpi) => (
        <div key={kpi.label} className="rounded-xl border border-border/60 bg-background px-4 py-3">
          <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</p>
          <p className="text-[22px] font-semibold text-foreground mt-0.5 leading-tight">{kpi.value}</p>
        </div>
      ))}
    </div>
  )
}

// ── Main list ─────────────────────────────────────────────────────────────────
export function LeavesList({
  leaves,
  staff,
  userRole = "admin",
  viewerStaffId,
}: {
  leaves: LeaveWithStaff[]
  staff: Staff[]
  userRole?: "admin" | "manager" | "viewer"
  viewerStaffId?: string | null
}) {
  const isViewer = userRole === "viewer"
  const t      = useTranslations("leaves")
  const locale = useLocale() as "es" | "en"
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LeaveWithStaff | null>(null)
  const [typeFilter, setTypeFilter] = useState<LeaveType | "all">("all")
  const [showHistory, setShowHistory] = useState(false)
  const [fileImportOpen, setFileImportOpen] = useState(false)

  const filtered = leaves.filter((l) => {
    if (typeFilter !== "all" && l.type !== typeFilter) return false
    return true
  })

  const filteredUpcoming = filtered.filter((l) => l.end_date >= TODAY)
  const filteredPast     = filtered.filter((l) => l.end_date <  TODAY)

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
    <div className="flex flex-col">
      {/* KPI summary band */}
      {leaves.length > 0 && (
        <div className="-mx-6 md:-mx-8 -mt-6 md:-mt-8 px-6 md:px-8 pt-6 md:pt-8 pb-5 bg-muted/40 border-b border-border mb-5">
          <KpiCards leaves={leaves} />
        </div>
      )}

      {/* Content section */}
      <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
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
          <Button size="lg" onClick={openCreate}>{t("addLeave")}</Button>
          <Button size="lg" variant="outline" onClick={() => setFileImportOpen(true)}>
            <FileUp className="size-4" />
            Añadir desde archivo
          </Button>
        </div>
      </div>

      {/* Empty state — no leaves at all */}
      {leaves.length === 0 && (
        <EmptyState
          icon={CalendarOff}
          title={t("noLeaves")}
          description={t("noLeavesDescription")}
          action={{ label: t("addLeave"), onClick: openCreate }}
        />
      )}

      {leaves.length > 0 && filtered.length === 0 && (
        <EmptyState icon={CalendarOff} title={t("noLeaves")} description={t("noLeavesDescription")} />
      )}

      {/* Upcoming / active leaves */}
      {filteredUpcoming.length > 0 && (
        <LeavesTable rows={filteredUpcoming} locale={locale} onEdit={openEdit} t={t} muted={false} />
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
            ? (locale === "es" ? "Ocultar historial" : "Hide history")
            : (locale === "es" ? `Mostrar historial (${filteredPast.length})` : `Show history (${filteredPast.length})`)}
        </button>
      )}

      {/* Past leaves */}
      {showHistory && filteredPast.length > 0 && (
        <LeavesTable rows={filteredPast} locale={locale} onEdit={openEdit} t={t} muted />
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
