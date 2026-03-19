"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Trash2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { upsertAssignment, deleteAssignment } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, StaffRole, ShiftType } from "@/lib/types/database"
import type { RotaDay } from "@/app/(clinic)/rota/actions"

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = RotaDay["assignments"][0]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string | null
  weekStart: string
  editAssignment: Assignment | null
  staffList: StaffWithSkills[]
  assignedStaffIds: string[]
  onSaved: () => void
  isPublished: boolean
  locale: string
}

// ── Role colors ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<StaffRole, string> = {
  lab:       "bg-blue-600 text-white",
  andrology: "bg-emerald-600 text-white",
  admin:     "bg-slate-500 text-white",
}

const ROLE_TABS: Array<{ key: StaffRole | "all"; label: string }> = [
  { key: "all",       label: "Todos" },
  { key: "lab",       label: "Lab" },
  { key: "andrology", label: "Andrología" },
  { key: "admin",     label: "Admin" },
]

const SHIFT_TYPES: ShiftType[] = ["am", "pm", "full"]

// ── Component ─────────────────────────────────────────────────────────────────

export function AssignmentSheet({
  open,
  onOpenChange,
  date,
  weekStart,
  editAssignment,
  staffList,
  assignedStaffIds,
  onSaved,
  isPublished,
}: Props) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")

  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const [shiftType, setShiftType]             = useState<ShiftType>("am")
  const [supervision, setSupervision]         = useState(false)
  const [traineeId, setTraineeId]             = useState<string | null>(null)
  const [notes, setNotes]                     = useState("")
  const [roleTab, setRoleTab]                 = useState<StaffRole | "all">("all")
  const [error, setError]                     = useState<string | null>(null)
  const [isPending, startTransition]          = useTransition()
  const [isDeleting, startDeleteTransition]   = useTransition()

  const isEditing = !!editAssignment

  // Sync form state from editAssignment when sheet opens
  useEffect(() => {
    if (!open) return
    setError(null)
    if (editAssignment) {
      setSelectedStaffId(editAssignment.staff_id)
      setShiftType(editAssignment.shift_type)
      setSupervision(!!editAssignment.trainee_staff_id)
      setTraineeId(editAssignment.trainee_staff_id ?? null)
      setNotes(editAssignment.notes ?? "")
    } else {
      setSelectedStaffId(null)
      setShiftType("am")
      setSupervision(false)
      setTraineeId(null)
      setNotes("")
    }
    setRoleTab("all")
  }, [open, editAssignment])

  const filteredStaff = staffList.filter((s) =>
    roleTab === "all" ? true : s.role === roleTab
  )

  // Trainee candidates: active staff, different from the supervisor
  const traineeCandidates = staffList.filter((s) => s.id !== selectedStaffId)

  function handleSave() {
    if (!selectedStaffId || !date) return
    setError(null)
    startTransition(async () => {
      const result = await upsertAssignment({
        weekStart,
        assignmentId: editAssignment?.id,
        staffId: selectedStaffId,
        date,
        shiftType,
        notes: notes.trim() || null,
        traineeStaffId: supervision ? traineeId : null,
      })
      if (result.error) {
        setError(result.error)
      } else {
        onSaved()
        onOpenChange(false)
      }
    })
  }

  function handleDelete() {
    if (!editAssignment) return
    setError(null)
    startDeleteTransition(async () => {
      const result = await deleteAssignment(editAssignment.id)
      if (result.error) {
        setError(result.error)
      } else {
        onSaved()
        onOpenChange(false)
      }
    })
  }

  const dateLabel = date
    ? new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(
        new Date(date + "T12:00:00")
      )
    : ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[360px] sm:max-w-[360px] flex flex-col gap-0 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle>{isEditing ? t("editAssignment") : t("addAssignment")}</SheetTitle>
          {date && (
            <p className="text-[13px] text-muted-foreground capitalize">{dateLabel}</p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">

          {/* Staff selector */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium">{t("selectStaff")}</label>

            {/* Role filter tabs */}
            <div className="flex items-center gap-0.5 rounded-lg border border-border p-0.5 self-start">
              {ROLE_TABS.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setRoleTab(tab.key as StaffRole | "all")}
                  className={cn(
                    "rounded-md px-2.5 py-0.5 text-[12px] transition-colors",
                    roleTab === tab.key
                      ? "bg-background shadow-sm font-medium"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Staff list */}
            <div className="flex flex-col gap-1 max-h-52 overflow-y-auto">
              {filteredStaff.length === 0 && (
                <p className="text-[13px] text-muted-foreground py-2">{t("noActiveStaff")}</p>
              )}
              {filteredStaff.map((s) => {
                const isAssigned = assignedStaffIds.includes(s.id) && s.id !== editAssignment?.staff_id
                const isSelected = selectedStaffId === s.id
                return (
                  <button
                    key={s.id}
                    disabled={isPublished}
                    onClick={() => setSelectedStaffId(s.id)}
                    className={cn(
                      "flex items-center gap-2.5 px-2.5 py-2 rounded-lg border text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40",
                      isPublished && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <div className={cn(
                      "size-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
                      ROLE_COLORS[s.role]
                    )}>
                      {s.first_name[0]?.toUpperCase()}{s.last_name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium truncate">{s.first_name} {s.last_name}</p>
                    </div>
                    {isAssigned && (
                      <span className="text-[11px] text-amber-600 shrink-0">{t("alreadyAssigned")}</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Shift type */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium">{t("shift")}</label>
            <div className="flex gap-2">
              {SHIFT_TYPES.map((st) => (
                <button
                  key={st}
                  disabled={isPublished}
                  onClick={() => setShiftType(st)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg border text-[13px] transition-colors",
                    shiftType === st
                      ? "border-primary bg-primary/5 font-medium text-primary"
                      : "border-border hover:bg-muted/40 text-muted-foreground",
                    isPublished && "opacity-50 cursor-not-allowed"
                  )}
                >
                  {st.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Supervisión toggle */}
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium">{t("supervision")}</label>
            <button
              disabled={isPublished}
              onClick={() => { setSupervision(!supervision); if (supervision) setTraineeId(null) }}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                supervision ? "bg-primary" : "bg-border",
                isPublished && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block size-4 rounded-full bg-white shadow transition-transform",
                supervision ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          </div>

          {/* Trainee selector */}
          {supervision && (
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium">{t("supervisee")}</label>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {traineeCandidates.map((s) => {
                  const isSelected = traineeId === s.id
                  return (
                    <button
                      key={s.id}
                      disabled={isPublished}
                      onClick={() => setTraineeId(isSelected ? null : s.id)}
                      className={cn(
                        "flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg border text-left transition-colors",
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/40",
                        isPublished && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className={cn(
                        "size-6 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0",
                        ROLE_COLORS[s.role]
                      )}>
                        {s.first_name[0]?.toUpperCase()}{s.last_name[0]?.toUpperCase()}
                      </div>
                      <span className="text-[13px] truncate">{s.first_name} {s.last_name}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <label className="text-[13px] font-medium">{tc("notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPublished}
              placeholder={tc("optional")}
              rows={2}
              className={cn(
                "w-full rounded-lg border border-input bg-background px-3 py-2 text-[13px] outline-none resize-none",
                "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                "placeholder:text-muted-foreground",
                isPublished && "opacity-50 cursor-not-allowed"
              )}
            />
          </div>

          {error && (
            <p className="text-[13px] text-destructive">{error}</p>
          )}
        </div>

        <SheetFooter className="border-t px-4 py-3 flex-row gap-2">
          {isEditing && !isPublished && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting || isPending}
              className="text-destructive border-destructive/30 hover:bg-destructive/5"
            >
              <Trash2 className="size-3.5" />
              {t("deleteAssignment")}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {tc("cancel")}
          </Button>
          {!isPublished && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!selectedStaffId || isPending || isDeleting}
            >
              {isPending ? tc("saving") : tc("save")}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// ── Staff role badge label helper ─────────────────────────────────────────────

export function RoleBadge({ role }: { role: StaffRole }) {
  return <Badge variant={role}>{role}</Badge>
}
