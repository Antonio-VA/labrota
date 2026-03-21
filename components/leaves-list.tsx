"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { CalendarOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import type { LeaveWithStaff, Staff, LeaveType } from "@/lib/types/database"

// ── Days between two ISO date strings (inclusive) ─────────────────────────────
function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T12:00:00")
  const e = new Date(end + "T12:00:00")
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
}

const TODAY = new Date().toISOString().split("T")[0]

// ── Leave type badge ───────────────────────────────────────────────────────────
const TYPE_VARIANTS: Record<LeaveType, "destructive" | "secondary" | "outline"> = {
  annual:   "secondary",
  sick:     "destructive",
  personal: "outline",
  other:    "outline",
}

// ── Inner form (keyed to reset on open/edit change) ───────────────────────────
function LeaveForm({
  staff,
  editing,
  onSuccess,
}: {
  staff: Staff[]
  editing: LeaveWithStaff | null
  onSuccess: () => void
}) {
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
          <option value="annual">{t("types.annual")}</option>
          <option value="sick">{t("types.sick")}</option>
          <option value="personal">{t("types.personal")}</option>
          <option value="other">{t("types.other")}</option>
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

          {editing && !confirmDelete && (
            <Button type="button" variant="destructive" disabled={isPending || isDeleting} onClick={() => setConfirmDelete(true)}>
              {tc("delete")}
            </Button>
          )}
          {editing && confirmDelete && (
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
    <div className={`rounded-lg border border-border overflow-hidden mb-3 bg-white ${muted ? "opacity-70" : ""}`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-white">
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
                <Badge variant={TYPE_VARIANTS[leave.type]} className={muted ? "opacity-60" : ""}>
                  {t(`types.${leave.type}`)}
                </Badge>
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

// ── Main list ─────────────────────────────────────────────────────────────────
export function LeavesList({
  leaves,
  staff,
}: {
  leaves: LeaveWithStaff[]
  staff: Staff[]
}) {
  const t      = useTranslations("leaves")
  const locale = useLocale() as "es" | "en"
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LeaveWithStaff | null>(null)
  const [typeFilter, setTypeFilter] = useState<LeaveType | "all">("all")
  const [showHistory, setShowHistory] = useState(false)

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
    setEditing(leave)
    setOpen(true)
  }

  function closeSheet() {
    setOpen(false)
    setEditing(null)
  }

  return (
    <>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as LeaveType | "all")}
          className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="all">{t("columns.type")}: —</option>
          <option value="annual">{t("types.annual")}</option>
          <option value="sick">{t("types.sick")}</option>
          <option value="personal">{t("types.personal")}</option>
          <option value="other">{t("types.other")}</option>
        </select>
        <Button onClick={openCreate}>{t("addLeave")}</Button>
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
            />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
