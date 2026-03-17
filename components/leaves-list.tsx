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

  const filtered = leaves.filter((l) => {
    if (typeFilter !== "all" && l.type !== typeFilter) return false
    return true
  })

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

      {/* Empty state */}
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

      {/* Table */}
      {filtered.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {/* Header */}
          <div className="hidden md:grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 py-2 bg-muted/40 border-b border-border">
            <span className="text-[13px] font-medium text-muted-foreground">{t("columns.staff")}</span>
            <span className="text-[13px] font-medium text-muted-foreground w-28">{t("columns.type")}</span>
            <span className="text-[13px] font-medium text-muted-foreground w-36">{t("columns.from")}</span>
            <span className="text-[13px] font-medium text-muted-foreground w-36">{t("columns.to")}</span>
            <span className="text-[13px] font-medium text-muted-foreground w-14 text-right">{t("columns.days")}</span>
            <span className="w-14" />
          </div>

          {/* Rows */}
          {filtered.map((leave) => {
            const days = daysBetween(leave.start_date, leave.end_date)
            return (
              <div
                key={leave.id}
                className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 items-center px-4 py-3 border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => openEdit(leave)}
              >
                {/* Staff */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[14px] font-medium truncate">
                    {leave.staff.first_name} {leave.staff.last_name}
                  </span>
                  <Badge variant={leave.staff.role as "lab" | "andrology" | "admin"} className="hidden md:inline-flex">
                    {leave.staff.role}
                  </Badge>
                </div>

                {/* Type */}
                <div className="hidden md:flex w-28">
                  <Badge variant={TYPE_VARIANTS[leave.type]}>
                    {t(`types.${leave.type}`)}
                  </Badge>
                </div>

                {/* From */}
                <div className="hidden md:block w-36">
                  <span className="text-[14px]">{formatDateWithYear(leave.start_date, locale)}</span>
                </div>

                {/* To */}
                <div className="hidden md:block w-36">
                  <span className="text-[14px]">{formatDateWithYear(leave.end_date, locale)}</span>
                </div>

                {/* Days */}
                <div className="hidden md:block w-14 text-right">
                  <span className="text-[14px] text-muted-foreground">{days}d</span>
                </div>

                {/* Mobile: show dates + days */}
                <div className="md:hidden text-right">
                  <p className="text-[13px] text-muted-foreground">
                    {formatDateWithYear(leave.start_date, locale)}
                  </p>
                  <p className="text-[12px] text-muted-foreground">{days}d</p>
                </div>

                {/* Edit hint on desktop (row is clickable) */}
                <div className="hidden md:block w-14" />
              </div>
            )
          })}
        </div>
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
