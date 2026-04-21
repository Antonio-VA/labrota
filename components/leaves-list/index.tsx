"use client"

import { useEffect, useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { CalendarOff, FileUp, Cloud, UserX, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { cancelLeave } from "@/app/(clinic)/leaves/actions"
import { LeaveFileImport } from "@/components/leave-file-import"
import { OutlookSyncPanel } from "@/components/outlook-sync-panel"
import { formatDateWithYear } from "@/lib/format-date"
import { toast } from "sonner"
import type { LeaveWithStaff, Staff } from "@/lib/types/database"

import { daysBetween, TODAY, LeaveTypeBadge, StatusBadge } from "./constants"
import { LeaveForm } from "./leave-form"
import { LeavesTable } from "./leaves-table"
import { KpiCards } from "./kpi-cards"
import { PendingRequests } from "./pending-requests"

// ── Main list ────────────────────────────────────────────────────────────────

export function LeavesList({
  leaves,
  staff,
  userRole = "admin",
  viewerStaffId,
  enableLeaveRequests = false,
  enableOutlookSync = false,
  orgId,
  holidayConfig,
}: {
  leaves: LeaveWithStaff[]
  staff: Staff[]
  userRole?: "admin" | "manager" | "viewer"
  viewerStaffId?: string | null
  enableLeaveRequests?: boolean
  enableOutlookSync?: boolean
  orgId?: string
  holidayConfig?: { counting_method: string; public_holidays_deducted: boolean } | null
}) {
  const isViewer = userRole === "viewer"
  const showLeaveDays = holidayConfig
    ? holidayConfig.counting_method === "working_days" || holidayConfig.public_holidays_deducted
    : false
  const t      = useTranslations("leaves")
  const to     = useTranslations("outlook")
  const tc     = useTranslations("common")
  const locale = useLocale() as "es" | "en"
  const router = useRouter()

  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LeaveWithStaff | null>(null)
  const [showCancelled, setShowCancelled] = useState(false)
  const [fileImportOpen, setFileImportOpen] = useState(false)
  const [outlookPanelOpen, setOutlookPanelOpen] = useState(false)
  const [, startCancelTransition] = useTransition()
  const [page, setPage] = useState(1)
  const PAGE_SIZE = 15
  const searchParams = useSearchParams()

  // Handle Outlook OAuth callback URL params
   
  useEffect(() => {
    const outlookStatus = searchParams.get("outlook")
    if (!outlookStatus) return
    const reason = searchParams.get("reason")
    if (outlookStatus === "connected") {
      toast.success(to("featureEnabled"))
      setOutlookPanelOpen(true)
    } else if (outlookStatus === "cancelled") {
      toast.info("Outlook connection cancelled")
    } else if (outlookStatus === "error") {
      toast.error(`Outlook connection failed${reason ? `: ${reason}` : ""}`)
    }
    // Clean URL params
    router.replace("/leaves", { scroll: false })
  }, [searchParams, router, to])
   

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
    const status = leave.status ?? "approved"
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

  // Separate cancelled/rejected from active leaves
  const inactiveStatuses = ["cancelled", "rejected"]
  const activeFiltered    = visibleLeaves.filter((l) => !inactiveStatuses.includes(l.status ?? "approved"))
  const cancelledFiltered = visibleLeaves.filter((l) => inactiveStatuses.includes(l.status ?? "approved"))

  const filteredUpcoming = activeFiltered
    .filter((l) => l.end_date >= TODAY)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const filteredPast = activeFiltered
    .filter((l) => l.end_date < TODAY)
    .sort((a, b) => b.start_date.localeCompare(a.start_date))

  // Pagination for upcoming leaves
  const totalPages = Math.max(1, Math.ceil(filteredUpcoming.length / PAGE_SIZE))
  const safePageUpcoming = Math.min(page, totalPages)
  const paginatedUpcoming = filteredUpcoming.slice((safePageUpcoming - 1) * PAGE_SIZE, safePageUpcoming * PAGE_SIZE)

  function openCreate() {
    setEditing(null)
    setOpen(true)
  }

  function openEdit(leave: LeaveWithStaff) {
    if (isViewer && leave.staff_id !== viewerStaffId) return
    if (enableLeaveRequests) {
      setEditing(leave)
      setOpen(true)
      return
    }
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

      {/* Pending leave requests (admins only) */}
      <PendingRequests leaves={visibleLeaves} isAdmin={!isViewer} locale={locale} />

      {/* Content section */}
      <div className="flex flex-col gap-4">

      {/* Empty state — no leaves at all */}
      {visibleLeaves.length === 0 && (
        <EmptyState
          icon={CalendarOff}
          title={t("noLeaves")}
          description={t("noLeavesDescription")}
          action={{ label: t("addLeave"), onClick: openCreate }}
        />
      )}

      {/* Upcoming section */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[14px] font-medium">{t("upcoming")}</h3>
        <div className="flex items-center gap-2">
          <Button size="lg" onClick={openCreate}>{isViewer && enableLeaveRequests ? t("sendRequest") : t("addLeave")}</Button>
          {!isViewer && (
            <Button size="sm" variant="outline" className="hidden md:inline-flex" onClick={() => setFileImportOpen(true)}>
              <FileUp className="size-4" />
              {t("addFromFile")}
            </Button>
          )}
          {userRole === "manager" && enableOutlookSync && orgId && (
            <Button size="sm" variant="outline" className="hidden md:inline-flex" onClick={() => setOutlookPanelOpen(true)}>
              <Cloud className="size-4" />
              {to("outlook")}
            </Button>
          )}
        </div>
      </div>

      {filteredUpcoming.length > 0 ? (
        <>
          <LeavesTable rows={paginatedUpcoming} locale={locale} onEdit={openEdit} t={t} muted={false} showStatus={enableLeaveRequests} onCancel={handleCancel} canCancel={canCancelLeave} hideStaffColumn={isViewer} showLeaveDays={showLeaveDays} holidayConfig={holidayConfig} />
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-1">
              <p className="text-[12px] text-muted-foreground">
                {(safePageUpcoming - 1) * PAGE_SIZE + 1}–{Math.min(safePageUpcoming * PAGE_SIZE, filteredUpcoming.length)} {t("of")} {filteredUpcoming.length}
              </p>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" disabled={safePageUpcoming <= 1} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-[12px] text-muted-foreground px-2">{safePageUpcoming} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={safePageUpcoming >= totalPages} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <EmptyState icon={CalendarOff} title={t("noLeaves")} description={t("noLeavesDescription")} />
      )}

      {/* Past leaves — always visible */}
      {filteredPast.length > 0 && (
        <>
          <h3 className="text-[14px] font-medium mt-2">{t("pastLeaves")}</h3>
          <LeavesTable rows={filteredPast} locale={locale} onEdit={openEdit} t={t} muted showStatus={enableLeaveRequests} onCancel={handleCancel} canCancel={canCancelLeave} hideStaffColumn={isViewer} showLeaveDays={showLeaveDays} holidayConfig={holidayConfig} />
        </>
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
        <LeavesTable rows={cancelledFiltered} locale={locale} onEdit={openEdit} t={t} muted showStatus={enableLeaveRequests} hideStaffColumn={isViewer} showLeaveDays={showLeaveDays} holidayConfig={holidayConfig} />
      )}

      {/* Sheet */}
      <Sheet open={open} onOpenChange={(o) => { if (!o) closeSheet() }}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle className="text-[16px]">
              {editing && enableLeaveRequests ? t("leaveDetails") : editing ? t("editLeave") : enableLeaveRequests ? t("sendRequest") : t("addLeave")}
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto py-4">
            {editing && enableLeaveRequests ? (
              /* Read-only detail view when leave requests are enabled */
              <div className="flex flex-col gap-4 px-4">
                {/* Status */}
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
                  <StatusBadge leave={editing} t={t} />
                  {editing.reviewed_at && (
                    <span className="text-[12px] text-muted-foreground">
                      {formatDateWithYear(editing.reviewed_at, locale)}
                      {editing.reviewer_name && ` · ${editing.reviewer_name}`}
                    </span>
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-col gap-3">
                  <div>
                    <p className="text-[12px] text-muted-foreground font-medium mb-0.5">{t("fields.staff")}</p>
                    <p className="text-[14px]">{editing.staff ? `${editing.staff.first_name} ${editing.staff.last_name}` : "—"}</p>
                  </div>
                  <div>
                    <p className="text-[12px] text-muted-foreground font-medium mb-0.5">{t("fields.type")}</p>
                    <LeaveTypeBadge type={editing.type} label={t(`types.${editing.type}`)} />
                  </div>
                  <div>
                    <p className="text-[12px] text-muted-foreground font-medium mb-0.5">{t("fields.dates")}</p>
                    <p className="text-[14px]">
                      {formatDateWithYear(editing.start_date, locale)} — {formatDateWithYear(editing.end_date, locale)}
                      <span className="text-muted-foreground ml-1">({daysBetween(editing.start_date, editing.end_date)}d)</span>
                    </p>
                  </div>
                  {editing.notes && (
                    <div>
                      <p className="text-[12px] text-muted-foreground font-medium mb-0.5">{t("fields.notes")}</p>
                      <p className="text-[14px] text-muted-foreground">{editing.notes}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <SheetFooter className="px-0 mt-auto">
                  <div className="flex items-center justify-between gap-2 w-full">
                    <Button type="button" variant="outline" onClick={closeSheet}>
                      {tc("close")}
                    </Button>
                    {canCancelLeave(editing) && (
                      <Button type="button" variant="destructive" onClick={() => { handleCancel(editing.id); closeSheet() }}>
                        {t("cancelLeave")}
                      </Button>
                    )}
                  </div>
                </SheetFooter>
              </div>
            ) : (
              /* Editable form (create or edit without leave requests) */
              <LeaveForm
                key={editing?.id ?? "new"}
                staff={staff}
                editing={editing}
                onSuccess={closeSheet}
                viewerStaffId={isViewer ? viewerStaffId : undefined}
                isRequestMode={enableLeaveRequests}
                onCancelLeave={enableLeaveRequests ? handleCancel : undefined}
              />
            )}
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

      {/* Outlook Sync Panel */}
      {enableOutlookSync && orgId && (
        <OutlookSyncPanel
          open={outlookPanelOpen}
          onClose={() => setOutlookPanelOpen(false)}
          orgId={orgId}
        />
      )}
    </div>
  )
}
