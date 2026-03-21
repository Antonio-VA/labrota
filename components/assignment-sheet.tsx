"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { Star, X, Plus, Trash2, Pencil, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import {
  upsertAssignment,
  deleteAssignment,
  setDayOpu,
  deleteAllDayAssignments,
  updateAssignmentShift,
  setPunctionsOverride,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftType, StaffRole, ShiftTypeDefinition } from "@/lib/types/database"
import type { RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = RotaDay["assignments"][0]

const ROLE_COLORS: Record<string, string> = {
  lab:       "bg-blue-100 text-blue-700",
  andrology: "bg-emerald-100 text-emerald-700",
  admin:     "bg-slate-100 text-slate-600",
}

const ROLE_ABBR: Record<string, string> = {
  lab: "EM", andrology: "AN", admin: "AD",
}

const ROLE_ORDER: Record<string, number>  = { lab: 0, andrology: 1, admin: 2 }
const SHIFT_ORDER: Record<string, number> = { am: 0, pm: 1, full: 2 }

function shiftLabel(shift: ShiftType, shiftTimes: ShiftTimes | null): string {
  const label = shift.toUpperCase()
  if (!shiftTimes) return label
  return `${label} · ${shiftTimes[shift]?.start ?? ""}–${shiftTimes[shift]?.end ?? ""}`
}

// ── Staff avatar ───────────────────────────────────────────────────────────────

function Avatar({ first, last, role }: { first: string; last: string; role: string }) {
  return (
    <div className={cn(
      "size-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0",
      ROLE_COLORS[role] ?? "bg-muted text-muted-foreground"
    )}>
      {ROLE_ABBR[role] ?? "?"}
    </div>
  )
}

// ── Staff card (assigned) ──────────────────────────────────────────────────────

function StaffCard({
  a, canOpu, onRemove, onToggleOpu, onChangeShift, disabled, shiftTimes, shiftTypes,
}: {
  a: Assignment
  canOpu: boolean
  onRemove: () => void
  onToggleOpu: () => void
  onChangeShift: (s: ShiftType) => void
  disabled: boolean
  shiftTimes: ShiftTimes | null
  shiftTypes: ShiftTypeDefinition[]
}) {
  const [shiftOpen, setShiftOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!shiftOpen) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setShiftOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [shiftOpen])

  return (
    <div className={cn(
      "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[13px]",
      a.is_manual_override ? "border-primary/20 bg-primary/5" : "border-border bg-background"
    )}>
      <Avatar first={a.staff.first_name} last={a.staff.last_name} role={a.staff.role} />

      <span className="flex-1 min-w-0 font-medium truncate">
        {a.staff.first_name} {a.staff.last_name}
      </span>

      <Badge variant={a.staff.role as StaffRole} className="text-[10px] px-1.5 shrink-0">
        {a.staff.role === "andrology" ? "And" : a.staff.role === "admin" ? "Adm" : "Lab"}
      </Badge>

      {/* OPU star — only lab / andrology */}
      {canOpu && (
        <button
          disabled={disabled}
          onClick={onToggleOpu}
          title={a.is_opu ? "Quitar OPU" : "Designar OPU"}
          className={cn(
            "shrink-0 transition-colors",
            a.is_opu ? "text-amber-500" : "text-muted-foreground/25 hover:text-amber-400",
            disabled && "pointer-events-none"
          )}
        >
          <Star className={cn("size-3.5", a.is_opu && "fill-amber-500")} />
        </button>
      )}

      {/* Shift pill — click to change shift */}
      {!disabled && (
        <div ref={ref} className="relative shrink-0">
          <button
            onClick={() => setShiftOpen((o) => !o)}
            className="text-[10px] font-medium text-muted-foreground border border-border rounded px-1.5 py-0.5 hover:bg-muted transition-colors"
          >
            {a.shift_type.toUpperCase()}
          </button>
          {shiftOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-border bg-background shadow-md py-1 min-w-[80px]">
              {shiftTypes.filter((st) => st.code !== a.shift_type).map((st) => (
                <button
                  key={st.code}
                  onClick={() => { setShiftOpen(false); onChangeShift(st.code) }}
                  className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[12px] hover:bg-muted/50 transition-colors"
                >
                  <span className="font-medium">{st.code}</span>
                  {shiftTimes && (
                    <span className="text-muted-foreground">{shiftTimes[st.code]?.start}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Remove */}
      {!disabled && (
        <button
          onClick={onRemove}
          className="shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

// ── Add person inline dropdown ─────────────────────────────────────────────────

function AddPersonButton({
  shift, available, onAdd, disabled,
}: {
  shift: ShiftType
  available: StaffWithSkills[]
  onAdd: (staffId: string) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  if (disabled || available.length === 0) return null

  const sorted = [...available].sort(
    (a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
  )

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[12px] text-primary/60 hover:text-primary transition-colors py-0.5 px-1 rounded"
      >
        <Plus className="size-3" />
        Añadir persona
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-border bg-background shadow-lg py-1 max-h-56 overflow-y-auto">
          {sorted.map((s) => (
            <button
              key={s.id}
              onClick={() => { setOpen(false); onAdd(s.id) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              <Avatar first={s.first_name} last={s.last_name} role={s.role} />
              <span className="text-[13px] truncate flex-1">{s.first_name} {s.last_name}</span>
              {s.preferred_shift === shift && (
                <span className="text-[10px] text-muted-foreground shrink-0">pref.</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  date: string | null
  weekStart: string
  day: RotaDay | null
  staffList: StaffWithSkills[]
  shiftTimes: ShiftTimes | null
  shiftTypes: ShiftTypeDefinition[]
  punctionsDefault: number
  punctionsOverride: Record<string, number>
  rota: { id: string; status: string; punctions_override: Record<string, number> } | null
  isPublished: boolean
  onSaved: () => void
  onPunctionsChange: (date: string, value: number | null) => void
}

export function AssignmentSheet({
  open, onOpenChange, date, weekStart, day, staffList, shiftTimes, shiftTypes,
  punctionsDefault, punctionsOverride, rota, isPublished, onSaved, onPunctionsChange,
}: Props) {
  // Local optimistic assignments
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [, startSave] = useTransition()
  const [, startDelete] = useTransition()

  // Punctions inline edit
  const [editingP, setEditingP] = useState(false)
  const [pDraft, setPDraft]     = useState("")

  // Delete-all confirmation
  const [showDeleteAll, setShowDeleteAll] = useState(false)

  // Sync from day prop whenever day changes or panel opens
  useEffect(() => {
    setAssignments(
      [...(day?.assignments ?? [])].sort((a, b) => {
        const rd = (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
        return rd !== 0 ? rd : (SHIFT_ORDER[a.shift_type] ?? 9) - (SHIFT_ORDER[b.shift_type] ?? 9)
      })
    )
  }, [day])

  useEffect(() => {
    if (!open) { setShowDeleteAll(false); setEditingP(false) }
  }, [open])

  const assignedIds = new Set(assignments.map((a) => a.staff_id))
  const offStaff    = staffList
    .filter((s) => !assignedIds.has(s.id))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))

  const effectiveP  = date ? (punctionsOverride[date] ?? punctionsDefault) : 0
  const hasOverride = date ? date in punctionsOverride : false

  // ── Helpers ────────────────────────────────────────────────────────────────

  function save(fn: () => Promise<{ error?: string }>, revert: () => void) {
    startSave(async () => {
      const r = await fn()
      if (r.error) {
        toast.error(r.error)
        revert()
      } else {
        toast.success("Guardado", { duration: 1500 })
        onSaved()
      }
    })
  }

  // ── Add staff to a shift ────────────────────────────────────────────────────

  function handleAdd(staffId: string, shift: ShiftType) {
    const staff = staffList.find((s) => s.id === staffId)
    if (!staff || !date) return

    const tempId = `temp-${Date.now()}`
    const optimistic: Assignment = {
      id: tempId,
      staff_id: staffId,
      shift_type: shift,
      is_opu: false,
      is_manual_override: true,
      trainee_staff_id: null,
      notes: null,
      function_label: null,
      staff: { id: staffId, first_name: staff.first_name, last_name: staff.last_name, role: staff.role },
    }
    setAssignments((prev) => [...prev, optimistic].sort((a, b) => {
      const rd = (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
      return rd !== 0 ? rd : (SHIFT_ORDER[a.shift_type] ?? 9) - (SHIFT_ORDER[b.shift_type] ?? 9)
    }))

    save(
      async () => {
        const r = await upsertAssignment({ weekStart, staffId, date, shiftType: shift })
        if (!r.error && r.id) {
          setAssignments((prev) => prev.map((a) => a.id === tempId ? { ...a, id: r.id! } : a))
        }
        return r
      },
      () => setAssignments((prev) => prev.filter((a) => a.id !== tempId))
    )
  }

  // ── Remove assignment ───────────────────────────────────────────────────────

  function handleRemove(assignmentId: string) {
    const prev = assignments
    setAssignments((cur) => cur.filter((a) => a.id !== assignmentId))
    save(
      () => deleteAssignment(assignmentId),
      () => setAssignments(prev)
    )
  }

  // ── Change shift of existing assignment ────────────────────────────────────

  function handleChangeShift(assignmentId: string, newShift: ShiftType) {
    const prev = assignments
    setAssignments((cur) => cur.map((a) => a.id === assignmentId ? { ...a, shift_type: newShift } : a))
    save(
      () => updateAssignmentShift(assignmentId, newShift),
      () => setAssignments(prev)
    )
  }

  // ── Toggle OPU ─────────────────────────────────────────────────────────────

  function handleToggleOpu(assignmentId: string) {
    if (!rota || !date) return
    const target = assignments.find((a) => a.id === assignmentId)
    if (!target) return

    if (target.is_opu) {
      // Clear OPU — just remove from this one
      const prev = assignments
      setAssignments((cur) => cur.map((a) => a.id === assignmentId ? { ...a, is_opu: false } : a))
      save(
        () => setDayOpu(rota.id, date, ""),   // empty string = clear all
        () => setAssignments(prev)
      )
    } else {
      // Set new OPU, clear previous
      const prev = assignments
      setAssignments((cur) => cur.map((a) => ({ ...a, is_opu: a.id === assignmentId })))
      save(
        () => setDayOpu(rota.id, date, assignmentId),
        () => setAssignments(prev)
      )
    }
  }

  // ── Add from OFF (click greyed person) ─────────────────────────────────────

  function handleAddFromOff(staffId: string) {
    const staff = staffList.find((s) => s.id === staffId)
    const shift = (staff?.preferred_shift ?? shiftTypes[0]?.code ?? "T1") as ShiftType
    handleAdd(staffId, shift)
  }

  // ── Delete all assignments for this day ────────────────────────────────────

  function handleDeleteAll() {
    if (!rota || !date) return
    const prev = assignments
    setAssignments([])
    setShowDeleteAll(false)
    save(
      () => deleteAllDayAssignments(rota.id, date),
      () => setAssignments(prev)
    )
    startDelete(async () => {})  // for pending state
  }

  // ── Punctions ──────────────────────────────────────────────────────────────

  function commitPunctions() {
    setEditingP(false)
    if (!date) return
    const n = parseInt(pDraft, 10)
    if (!isNaN(n) && n >= 0) onPunctionsChange(date, n === 0 ? null : n)
    else setPDraft(String(effectiveP))
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const dateLabel = date
    ? new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(
        new Date(date + "T12:00:00")
      )
    : ""

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[340px] sm:max-w-[340px] flex flex-col gap-0 p-0 overflow-hidden"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b px-4 py-3 flex flex-col gap-1 shrink-0">
          <p className="text-[14px] font-medium capitalize leading-tight">{dateLabel}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[12px] text-muted-foreground">Punciones:</span>
            {editingP ? (
              <input
                autoFocus
                type="number"
                min={0}
                value={pDraft}
                onChange={(e) => setPDraft(e.target.value)}
                onBlur={commitPunctions}
                onKeyDown={(e) => { if (e.key === "Enter") commitPunctions(); if (e.key === "Escape") setEditingP(false) }}
                className="w-10 text-[12px] text-center border border-primary rounded px-0.5 outline-none bg-background"
              />
            ) : (
              <button
                onClick={() => { if (!isPublished && rota) { setPDraft(String(effectiveP)); setEditingP(true) } }}
                className={cn(
                  "flex items-center gap-1 text-[12px] font-medium",
                  hasOverride ? "text-primary" : "text-foreground",
                  !isPublished && rota && "hover:text-primary cursor-pointer"
                )}
              >
                <span>{effectiveP}</span>
                {!isPublished && rota && <Pencil className="size-2.5 text-muted-foreground" />}
              </button>
            )}
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">

          {/* Shift sections */}
          {shiftTypes.map((shiftDef) => {
            const shift = shiftDef.code
            const shiftAssignments = assignments
              .filter((a) => a.shift_type === shift)
              .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
            const available = offStaff.filter((s) => !assignedIds.has(s.id))

            return (
              <div key={shift} className="border-b border-border/60">
                {/* Shift header */}
                <div className="px-4 pt-3 pb-1.5">
                  <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                    {shiftLabel(shift, shiftTimes)}
                  </span>
                </div>

                {/* Staff cards */}
                <div className="px-3 flex flex-col gap-1.5 pb-2">
                  {shiftAssignments.map((a) => (
                    <StaffCard
                      key={a.id}
                      a={a}
                      canOpu={a.staff.role === "lab" || a.staff.role === "andrology"}
                      onRemove={() => handleRemove(a.id)}
                      onToggleOpu={() => handleToggleOpu(a.id)}
                      onChangeShift={(s) => handleChangeShift(a.id, s)}
                      disabled={isPublished || a.id.startsWith("temp-")}
                      shiftTimes={shiftTimes}
                      shiftTypes={shiftTypes}
                    />
                  ))}

                  <AddPersonButton
                    shift={shift}
                    available={available}
                    onAdd={(sid) => handleAdd(sid, shift)}
                    disabled={isPublished || !rota}
                  />
                </div>
              </div>
            )
          })}

          {/* OFF section */}
          {offStaff.length > 0 && (
            <div className="border-b border-border/60">
              <div className="px-4 pt-3 pb-1.5">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  OFF
                </span>
              </div>
              <div className="px-3 flex flex-col gap-1 pb-3">
                {offStaff.map((s) => (
                  <button
                    key={s.id}
                    disabled={isPublished || !rota}
                    onClick={() => handleAddFromOff(s.id)}
                    className={cn(
                      "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-dashed border-border text-[12px] text-left transition-colors",
                      !isPublished && rota
                        ? "hover:border-primary/50 hover:bg-primary/5 hover:text-foreground cursor-pointer"
                        : "cursor-default",
                      "text-muted-foreground"
                    )}
                  >
                    <div className={cn(
                      "size-6 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0 opacity-50",
                      ROLE_COLORS[s.role] ?? "bg-muted text-muted-foreground"
                    )}>
                      {ROLE_ABBR[s.role] ?? "?"}
                    </div>
                    <span className="truncate flex-1">{s.first_name} {s.last_name}</span>
                    {!isPublished && rota && (
                      <Plus className="size-3 shrink-0 opacity-50" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Destructive actions */}
          {!isPublished && rota && assignments.length > 0 && (
            <div className="px-4 py-4">
              {!showDeleteAll ? (
                <button
                  onClick={() => setShowDeleteAll(true)}
                  className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="size-3.5" />
                  Eliminar turno del día
                </button>
              ) : (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="size-3.5 text-destructive mt-0.5 shrink-0" />
                    <p className="text-[12px] text-destructive leading-snug">
                      ¿Eliminar todas las asignaciones de este día?
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-[12px] border-destructive/30 text-destructive hover:bg-destructive/5"
                      onClick={handleDeleteAll}
                    >
                      Eliminar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-3 text-[12px]"
                      onClick={() => setShowDeleteAll(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
