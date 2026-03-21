"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { Star, X, Plus, Trash2, Pencil, AlertTriangle, CheckCircle2, CalendarX } from "lucide-react"
import { toast } from "sonner"
import {
  DndContext, DragOverlay, useDraggable, useDroppable,
  useSensor, useSensors, PointerSensor, type DragEndEvent,
} from "@dnd-kit/core"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import {
  upsertAssignment,
  deleteAssignment,
  setDayOpu,
  deleteAllDayAssignments,
  updateAssignmentShift,
  setPunctionsOverride,
  setFunctionLabel,
  setTecnica,
} from "@/app/(clinic)/rota/actions"
import type {
  StaffWithSkills, ShiftType, ShiftTypeDefinition, Tecnica,
} from "@/lib/types/database"
import type { RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = RotaDay["assignments"][0]

const ROLE_DOT: Record<string, string> = {
  lab:       "bg-blue-400",
  andrology: "bg-emerald-400",
  admin:     "bg-slate-400",
}
const ROLE_LABEL: Record<string, string> = {
  lab: "Lab", andrology: "And", admin: "Adm",
}
const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }

const TECNICA_PILL: Record<string, string> = {
  amber:  "bg-amber-50 border-amber-300 text-amber-800",
  blue:   "bg-blue-50 border-blue-300 text-blue-700",
  green:  "bg-green-50 border-green-300 text-green-700",
  purple: "bg-purple-50 border-purple-200 text-purple-700",
  coral:  "bg-red-50 border-red-300 text-red-700",
  teal:   "bg-teal-50 border-teal-300 text-teal-700",
  slate:  "bg-slate-100 border-slate-300 text-slate-600",
  red:    "bg-red-50 border-red-400 text-red-800",
}

const FUNCTION_TO_SKILL: Partial<Record<string, string>> = {
  OPU: "egg_collection", ICSI: "icsi", ET: "embryo_transfer", BX: "biopsy", DEN: "denudation",
}
const FUNCTION_FULL_NAME: Record<string, string> = {
  OPU: "Recogida de óvulos", ICSI: "ICSI", ET: "Transferencia embrionaria",
  BX: "Biopsia", DEN: "Denudación", SUP: "Supervisor", TRN: "En formación", AND: "Andrología",
}
const FUNCTION_LABELS_BY_ROLE: Record<string, string[]> = {
  lab:       ["OPU", "ICSI", "ET", "BX", "DEN", "SUP", "TRN"],
  andrology: ["AND", "SUP", "TRN"],
  admin:     [],
}

// ── Function + Técnica inline popover ─────────────────────────────────────────

function AssignmentPopover({
  assignment, staffSkills, tecnicas,
  onFunctionSave, onTecnicaSave, isPublished, children,
}: {
  assignment: { id: string; staff: { role: string }; function_label: string | null; is_opu: boolean; tecnica_id: string | null }
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  onFunctionSave: (id: string, label: string | null) => void
  onTecnicaSave: (id: string, tecnicaId: string | null) => void
  isPublished: boolean
  children: React.ReactNode
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

  const allLabels     = FUNCTION_LABELS_BY_ROLE[assignment.staff.role] ?? []
  const currentLabel  = assignment.function_label ?? (assignment.is_opu ? "OPU" : null)
  const skillLevelMap = Object.fromEntries(staffSkills.map((s) => [s.skill, s.level]))
  const certifiedSet  = new Set(staffSkills.filter((s) => s.level === "certified").map((s) => s.skill))

  const functionLabels = allLabels.filter((fn) => {
    const req = FUNCTION_TO_SKILL[fn]
    if (!req) return true
    return skillLevelMap[req] === "certified" || skillLevelMap[req] === "training"
  })

  const availableTecnicas = tecnicas.filter((t) =>
    t.activa && (t.required_skill === null || certifiedSet.has(t.required_skill))
  )

  const hasAnything = functionLabels.length > 0 || availableTecnicas.length > 0
  if (!hasAnything || isPublished) return <>{children}</>

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className="cursor-pointer flex-1 min-w-0">
        {children}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-48 flex flex-col gap-2.5">
          {functionLabels.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Función</p>
              <div className="flex flex-wrap gap-1.5">
                {functionLabels.map((fn) => {
                  const isActive      = currentLabel === fn
                  const reqSkill      = FUNCTION_TO_SKILL[fn]
                  const isTraining    = reqSkill ? skillLevelMap[reqSkill] === "training" : false
                  const color = fn === "OPU" ? "bg-amber-50 border-amber-300 text-amber-800"
                    : fn === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
                    : fn === "TRN" ? "bg-slate-50 border-slate-200 text-slate-500"
                    : "bg-blue-50 border-blue-200 text-blue-700"
                  return (
                    <button
                      key={fn}
                      title={FUNCTION_FULL_NAME[fn] ?? fn}
                      onClick={(e) => {
                        e.stopPropagation()
                        onFunctionSave(assignment.id, isActive ? null : fn)
                        setOpen(false)
                      }}
                      className={cn(
                        "relative text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-opacity",
                        color,
                        isActive ? "ring-1 ring-offset-1 ring-current" : "opacity-70 hover:opacity-100"
                      )}
                    >
                      {fn}
                      {isTraining && (
                        <span className="absolute -top-1 -right-1 size-2 rounded-full bg-amber-400 border border-white" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {availableTecnicas.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Técnica</p>
              <div className="flex flex-wrap gap-1">
                {availableTecnicas.map((tec) => {
                  const isActive = assignment.tecnica_id === tec.id
                  const color    = TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue
                  return (
                    <button
                      key={tec.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onTecnicaSave(assignment.id, isActive ? null : tec.id)
                        setOpen(false)
                      }}
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded border transition-opacity",
                        color,
                        isActive ? "ring-1 ring-offset-1 ring-current" : "opacity-60 hover:opacity-100"
                      )}
                    >
                      {tec.codigo}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Draggable staff card ───────────────────────────────────────────────────────

function DraggableCard({
  assignment, tecnica, staffSkills, tecnicas,
  canOpu, onRemove, onToggleOpu, disabled, isPublished,
  onFunctionSave, onTecnicaSave,
}: {
  assignment: Assignment
  tecnica: Tecnica | null
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  canOpu: boolean
  onRemove: () => void
  onToggleOpu: () => void
  disabled: boolean
  isPublished: boolean
  onFunctionSave: (id: string, label: string | null) => void
  onTecnicaSave: (id: string, tecnicaId: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: assignment.id,
    disabled,
  })

  const pillLabel = tecnica ? tecnica.codigo
    : assignment.function_label ?? (assignment.is_opu ? "OPU" : null)
  const pillColor = tecnica ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : pillLabel === "OPU" ? "bg-amber-50 border-amber-300 text-amber-800"
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-slate-50 border-slate-200 text-slate-500"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0 : 1 }}
      className={cn(
        "flex items-center gap-2 px-2.5 py-2 rounded-lg border text-[13px] bg-white",
        assignment.is_manual_override ? "border-primary/20" : "border-border",
        !disabled && "cursor-grab"
      )}
      {...listeners}
      {...attributes}
    >
      <span className={cn("size-2 rounded-full shrink-0", ROLE_DOT[assignment.staff.role] ?? "bg-slate-400")} />

      {/* Clickable area for function/técnica popover */}
      <AssignmentPopover
        assignment={assignment}
        staffSkills={staffSkills}
        tecnicas={tecnicas}
        onFunctionSave={onFunctionSave}
        onTecnicaSave={onTecnicaSave}
        isPublished={isPublished}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <span className="font-medium truncate">
            {assignment.staff.first_name} {assignment.staff.last_name}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground shrink-0">
            {ROLE_LABEL[assignment.staff.role] ?? assignment.staff.role}
          </span>
          {pillLabel && pillColor && (
            <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 ml-auto", pillColor)}>
              {pillLabel}
            </span>
          )}
        </div>
      </AssignmentPopover>

      {/* OPU star */}
      {canOpu && (
        <button
          disabled={disabled}
          onClick={(e) => { e.stopPropagation(); onToggleOpu() }}
          onPointerDown={(e) => e.stopPropagation()}
          title={assignment.is_opu ? "Quitar OPU" : "Designar OPU"}
          className={cn(
            "shrink-0 transition-colors",
            assignment.is_opu ? "text-amber-500" : "text-muted-foreground/25 hover:text-amber-400",
            disabled && "pointer-events-none"
          )}
        >
          <Star className={cn("size-3.5", assignment.is_opu && "fill-amber-500")} />
        </button>
      )}

      {/* Remove */}
      {!disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}

// ── Draggable OFF staff chip ───────────────────────────────────────────────────

function DraggableOffChip({
  staff, onAdd, disabled, onLeave,
}: {
  staff: StaffWithSkills
  onAdd: () => void
  disabled: boolean
  onLeave: boolean
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `off-${staff.id}`,
    disabled: disabled || onLeave,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0 : 1 }}
      {...(onLeave ? {} : listeners)}
      {...(onLeave ? {} : attributes)}
      className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-dashed text-[12px]",
        onLeave
          ? "border-border/50 text-muted-foreground/50 cursor-not-allowed select-none"
          : disabled
          ? "border-border text-muted-foreground cursor-default"
          : "border-border text-muted-foreground cursor-grab hover:border-primary/40 hover:bg-primary/5 hover:text-foreground transition-colors"
      )}
    >
      <span className={cn(
        "size-2 rounded-full shrink-0",
        onLeave ? "bg-amber-400 opacity-50" : ROLE_DOT[staff.role] ?? "bg-slate-400"
      )} />
      <span className="truncate flex-1">{staff.first_name} {staff.last_name}</span>
      {onLeave
        ? <span className="text-[10px] shrink-0 flex items-center gap-1"><CalendarX className="size-3" />Baja</span>
        : !disabled && <Plus className="size-3 shrink-0 opacity-40" />
      }
    </div>
  )
}

// ── Droppable shift row ───────────────────────────────────────────────────────

function DroppableShiftRow({
  shiftCode, children, className,
}: {
  shiftCode: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `shift-${shiftCode}` })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-blue-50")}>
      {children}
    </div>
  )
}

function DroppableOffSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: "off-section" })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-blue-50/50")}>
      {children}
    </div>
  )
}

// ── Add person dropdown ────────────────────────────────────────────────────────

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

  const sorted = [...available].sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[12px] text-primary/60 hover:text-primary transition-colors py-0.5 px-1 rounded"
      >
        <Plus className="size-3" />
        Añadir
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 w-52 rounded-xl border border-border bg-background shadow-lg py-1 max-h-56 overflow-y-auto">
          {sorted.map((s) => (
            <button
              key={s.id}
              onClick={() => { setOpen(false); onAdd(s.id) }}
              className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors"
            >
              <span className={cn("size-2 rounded-full shrink-0", ROLE_DOT[s.role] ?? "bg-slate-400")} />
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
  onLeaveStaffIds: string[]
  shiftTimes: ShiftTimes | null
  shiftTypes: ShiftTypeDefinition[]
  tecnicas: Tecnica[]
  punctionsDefault: number
  punctionsOverride: Record<string, number>
  rota: { id: string; status: string; punctions_override: Record<string, number> } | null
  isPublished: boolean
  onSaved: () => void
  onPunctionsChange: (date: string, value: number | null) => void
}

export function AssignmentSheet({
  open, onOpenChange, date, weekStart, day, staffList, onLeaveStaffIds,
  shiftTimes, shiftTypes, tecnicas,
  punctionsDefault, punctionsOverride, rota, isPublished, onSaved, onPunctionsChange,
}: Props) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [, startSave] = useTransition()

  const [editingP, setEditingP]       = useState(false)
  const [pDraft, setPDraft]           = useState("")
  const [showDeleteAll, setShowDeleteAll] = useState(false)

  // Sync from day prop
  useEffect(() => {
    setAssignments(
      [...(day?.assignments ?? [])].sort((a, b) =>
        (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
      )
    )
  }, [day])

  useEffect(() => {
    if (!open) { setShowDeleteAll(false); setEditingP(false) }
  }, [open])

  // ── Derived ────────────────────────────────────────────────────────────────

  const assignedIds  = new Set(assignments.map((a) => a.staff_id))
  const leaveIds     = new Set(onLeaveStaffIds)
  const unassigned   = staffList
    .filter((s) => !assignedIds.has(s.id))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
  const offStaff     = unassigned.filter((s) => !leaveIds.has(s.id))
  const onLeaveStaff = unassigned.filter((s) => leaveIds.has(s.id))

  const effectiveP   = date ? (punctionsOverride[date] ?? punctionsDefault) : 0
  const hasOverride  = date ? date in punctionsOverride : false

  const skillGaps = day?.skillGaps ?? []
  const allCovered = skillGaps.length === 0

  const dateLabel = date
    ? new Intl.DateTimeFormat("es", { weekday: "long", day: "numeric", month: "long" }).format(
        new Date(date + "T12:00:00")
      )
    : ""

  // ── Optimistic helpers ─────────────────────────────────────────────────────

  function save(fn: () => Promise<{ error?: string }>, revert: () => void) {
    startSave(async () => {
      const r = await fn()
      if (r.error) { toast.error(r.error); revert() }
      else { onSaved() }
    })
  }

  function patchAssignment(id: string, patch: Partial<Assignment>) {
    setAssignments((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a))
  }

  // ── Add ────────────────────────────────────────────────────────────────────

  function handleAdd(staffId: string, shift: ShiftType) {
    const staff = staffList.find((s) => s.id === staffId)
    if (!staff || !date) return

    const tempId = `temp-${Date.now()}`
    const optimistic: Assignment = {
      id: tempId, staff_id: staffId, shift_type: shift,
      is_opu: false, is_manual_override: true,
      trainee_staff_id: null, notes: null, function_label: null, tecnica_id: null,
      staff: { id: staffId, first_name: staff.first_name, last_name: staff.last_name, role: staff.role },
    }
    setAssignments((prev) => [...prev, optimistic].sort(
      (a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
    ))

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

  // ── Remove ─────────────────────────────────────────────────────────────────

  function handleRemove(assignmentId: string) {
    const prev = assignments
    setAssignments((cur) => cur.filter((a) => a.id !== assignmentId))
    save(() => deleteAssignment(assignmentId), () => setAssignments(prev))
  }

  // ── Change shift ───────────────────────────────────────────────────────────

  function handleChangeShift(assignmentId: string, newShift: ShiftType) {
    const prev = assignments
    setAssignments((cur) => cur.map((a) => a.id === assignmentId ? { ...a, shift_type: newShift } : a))
    save(() => updateAssignmentShift(assignmentId, newShift), () => setAssignments(prev))
  }

  // ── OPU ───────────────────────────────────────────────────────────────────

  function handleToggleOpu(assignmentId: string) {
    if (!rota || !date) return
    const target = assignments.find((a) => a.id === assignmentId)
    if (!target) return

    const prev = assignments
    if (target.is_opu) {
      setAssignments((cur) => cur.map((a) => a.id === assignmentId ? { ...a, is_opu: false } : a))
      save(() => setDayOpu(rota.id, date, ""), () => setAssignments(prev))
    } else {
      setAssignments((cur) => cur.map((a) => ({ ...a, is_opu: a.id === assignmentId })))
      save(() => setDayOpu(rota.id, date, assignmentId), () => setAssignments(prev))
    }
  }

  // ── Function label ─────────────────────────────────────────────────────────

  function handleFunctionSave(assignmentId: string, label: string | null) {
    patchAssignment(assignmentId, { function_label: label } as never)
    startSave(async () => {
      const r = await setFunctionLabel(assignmentId, label)
      if (r.error) toast.error(r.error)
    })
  }

  // ── Técnica ───────────────────────────────────────────────────────────────

  function handleTecnicaSave(assignmentId: string, tecnicaId: string | null) {
    patchAssignment(assignmentId, { tecnica_id: tecnicaId } as never)
    startSave(async () => {
      const r = await setTecnica(assignmentId, tecnicaId)
      if (r.error) toast.error(r.error)
    })
  }

  // ── Delete all ────────────────────────────────────────────────────────────

  function handleDeleteAll() {
    if (!rota || !date) return
    const prev = assignments
    setAssignments([])
    setShowDeleteAll(false)
    save(() => deleteAllDayAssignments(rota.id, date), () => setAssignments(prev))
  }

  // ── Punctions ─────────────────────────────────────────────────────────────

  function commitPunctions() {
    setEditingP(false)
    if (!date) return
    const n = parseInt(pDraft, 10)
    if (!isNaN(n) && n >= 0) onPunctionsChange(date, n === 0 ? null : n)
    else setPDraft(String(effectiveP))
  }

  // ── Drag and drop ─────────────────────────────────────────────────────────

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || !date) return

    const activeId  = String(active.id)
    const overId    = String(over.id)

    // OFF staff → shift row
    if (activeId.startsWith("off-")) {
      if (overId === "off-section") return
      const staffId = activeId.slice(4)
      if (!overId.startsWith("shift-")) return
      const shiftCode = overId.slice(6)
      handleAdd(staffId, shiftCode as ShiftType)
      return
    }

    // Existing assignment → shift row or OFF
    const sourceAssignment = assignments.find((a) => a.id === activeId)
    if (!sourceAssignment) return

    if (overId === "off-section") {
      handleRemove(activeId)
      return
    }

    if (overId.startsWith("shift-")) {
      const newShift = overId.slice(6)
      if (newShift === sourceAssignment.shift_type) return
      handleChangeShift(activeId, newShift as ShiftType)
    }
  }

  // ── Drag overlay content ──────────────────────────────────────────────────

  const [activeId, setActiveId] = useState<string | null>(null)
  const activeAssignment = activeId ? assignments.find((a) => a.id === activeId) : null
  const activeOffStaff   = activeId?.startsWith("off-")
    ? staffList.find((s) => s.id === activeId.slice(4))
    : null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[380px] sm:max-w-[380px] flex flex-col gap-0 p-0 overflow-hidden"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="border-b px-4 py-3 flex flex-col gap-1.5 shrink-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[14px] font-medium capitalize leading-tight">{dateLabel}</p>
            {/* Coverage indicator */}
            {assignments.length > 0 && (
              allCovered ? (
                <CheckCircle2 className="size-4 text-emerald-500 shrink-0 mt-0.5" />
              ) : (
                <Tooltip>
                  <TooltipTrigger render={
                    <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-0.5 cursor-default" />
                  } />
                  <TooltipContent side="left" className="max-w-[200px]">
                    <p className="font-medium text-[12px] mb-1">Habilidades sin cobertura</p>
                    {skillGaps.map((sk) => (
                      <p key={sk} className="text-[11px] text-muted-foreground">· {sk}</p>
                    ))}
                  </TooltipContent>
                </Tooltip>
              )
            )}
          </div>
          {/* Punctions */}
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitPunctions()
                  if (e.key === "Escape") setEditingP(false)
                }}
                className="w-10 text-[12px] text-center border border-primary rounded px-0.5 outline-none bg-background"
              />
            ) : (
              <button
                onClick={() => {
                  if (!isPublished && rota) { setPDraft(String(effectiveP)); setEditingP(true) }
                }}
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
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={(e) => { setActiveId(null); handleDragEnd(e) }}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex-1 overflow-y-auto">

            {/* Shift sections */}
            {shiftTypes.map((shiftDef) => {
              const shift = shiftDef.code
              const shiftAssignments = assignments
                .filter((a) => a.shift_type === shift)
                .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
              const available = offStaff.filter((s) => !assignedIds.has(s.id))

              const timeLabel = shiftTimes?.[shift]
                ? ` · ${shiftTimes[shift].start}–${shiftTimes[shift].end}`
                : ""

              return (
                <DroppableShiftRow
                  key={shift}
                  shiftCode={shift}
                  className="border-b border-border/60 transition-colors"
                >
                  {/* Shift header */}
                  <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                      {shift.toUpperCase()}{timeLabel}
                    </span>
                    <AddPersonButton
                      shift={shift}
                      available={available}
                      onAdd={(sid) => handleAdd(sid, shift)}
                      disabled={isPublished || !rota}
                    />
                  </div>

                  {/* Staff cards */}
                  <div className="px-3 flex flex-col gap-1.5 pb-3 min-h-[40px]">
                    {shiftAssignments.map((a) => {
                      const staffMember = staffList.find((s) => s.id === a.staff_id)
                      const tecnica     = tecnicas.find((t) => t.id === a.tecnica_id) ?? null
                      return (
                        <DraggableCard
                          key={a.id}
                          assignment={a}
                          tecnica={tecnica}
                          staffSkills={staffMember?.staff_skills ?? []}
                          tecnicas={tecnicas}
                          canOpu={a.staff.role === "lab" || a.staff.role === "andrology"}
                          onRemove={() => handleRemove(a.id)}
                          onToggleOpu={() => handleToggleOpu(a.id)}
                          disabled={isPublished || a.id.startsWith("temp-")}
                          isPublished={isPublished}
                          onFunctionSave={handleFunctionSave}
                          onTecnicaSave={handleTecnicaSave}
                        />
                      )
                    })}
                    {shiftAssignments.length === 0 && (
                      <div className="text-[11px] text-slate-300 italic py-1 select-none">Sin asignaciones</div>
                    )}
                  </div>
                </DroppableShiftRow>
              )
            })}

            {/* OFF section */}
            <DroppableOffSection className="border-b border-border/60 transition-colors">
              <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">OFF</span>
              </div>
              <div className="px-3 flex flex-col gap-1 pb-3 bg-slate-50 min-h-[40px]">
                {offStaff.map((s) => (
                  <DraggableOffChip
                    key={s.id}
                    staff={s}
                    onAdd={() => handleAdd(s.id, (s.preferred_shift ?? shiftTypes[0]?.code ?? "T1") as ShiftType)}
                    disabled={isPublished || !rota}
                    onLeave={false}
                  />
                ))}
                {onLeaveStaff.map((s) => (
                  <DraggableOffChip
                    key={s.id}
                    staff={s}
                    onAdd={() => {}}
                    disabled={true}
                    onLeave={true}
                  />
                ))}
                {offStaff.length === 0 && onLeaveStaff.length === 0 && (
                  <p className="text-[11px] text-slate-300 italic py-1 select-none">Todo el personal asignado</p>
                )}
              </div>
            </DroppableOffSection>

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

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {activeAssignment && (
              <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-white text-[13px] shadow-lg w-[330px]">
                <span className={cn("size-2 rounded-full shrink-0", ROLE_DOT[activeAssignment.staff.role] ?? "bg-slate-400")} />
                <span className="font-medium truncate flex-1">
                  {activeAssignment.staff.first_name} {activeAssignment.staff.last_name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {ROLE_LABEL[activeAssignment.staff.role]}
                </span>
              </div>
            )}
            {activeOffStaff && (
              <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-dashed border-primary/40 bg-white text-[12px] shadow-md w-[330px]">
                <span className={cn("size-2 rounded-full shrink-0", ROLE_DOT[activeOffStaff.role] ?? "bg-slate-400")} />
                <span className="truncate">{activeOffStaff.first_name} {activeOffStaff.last_name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </SheetContent>
    </Sheet>
  )
}
