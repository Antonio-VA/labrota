"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { X, Plus, Trash2, Pencil, AlertTriangle, CheckCircle2, CalendarX, Copy, Hourglass } from "lucide-react"
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
  deleteAllDayAssignments,
  updateAssignmentShift,
  setPunctionsOverride,
  setFunctionLabel,
  setTecnica,
  copyDayFromLastWeek,
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
const ROLE_BORDER: Record<string, string> = {
  lab:       "#60A5FA",
  andrology: "#34D399",
  admin:     "#94A3B8",
}
const ROLE_LABEL: Record<string, string> = {
  lab: "Emb", andrology: "And", admin: "Adm",
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

const DEPT_FOR_ROLE: Record<string, string> = { lab: "lab", andrology: "andrology" }

// ── Function + Técnica inline popover ─────────────────────────────────────────

function AssignmentPopover({
  assignment, staffSkills, tecnicas,
  onFunctionSave, onTecnicaSave, isPublished, children,
}: {
  assignment: { id: string; staff: { role: string }; function_label: string | null; tecnica_id: string | null }
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

  const staffSkillCodes = new Set(staffSkills.map((s) => s.skill))
  const staffDept = DEPT_FOR_ROLE[assignment.staff.role]
  const currentLabel = assignment.function_label ?? null

  // Show técnicas from staff's department that they are certified/trained in
  const availableTecnicas = tecnicas.filter((t) =>
    t.activa && t.department === staffDept && staffSkillCodes.has(t.codigo)
  )

  if (availableTecnicas.length === 0 || isPublished) return <>{children}</>

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className="cursor-pointer flex-1 min-w-0">
        {children}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-48 flex flex-col gap-2.5">
          {availableTecnicas.length > 0 && (
            <div>
              <p className="text-[10px] text-muted-foreground mb-1.5 font-medium">Función principal</p>
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
  onRemove, disabled, isPublished,
  onFunctionSave, onTecnicaSave,
}: {
  assignment: Assignment
  tecnica: Tecnica | null
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  onRemove: () => void
  disabled: boolean
  isPublished: boolean
  onFunctionSave: (id: string, label: string | null) => void
  onTecnicaSave: (id: string, tecnicaId: string | null) => void
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: assignment.id,
    disabled,
  })

  const pillLabel = tecnica ? tecnica.codigo : (assignment.function_label ?? null)
  const pillColor = tecnica ? (TECNICA_PILL[tecnica.color] ?? TECNICA_PILL.blue)
    : pillLabel === "SUP" ? "bg-purple-50 border-purple-200 text-purple-700"
    : pillLabel === "TRN" ? "bg-slate-50 border-slate-200 text-slate-500"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0 : 1, borderLeft: `3px solid ${ROLE_BORDER[assignment.staff.role] ?? "#94A3B8"}`, borderRadius: 4 }}
      className={cn(
        "flex items-center gap-2 py-2 text-[13px] bg-white text-slate-700 border border-slate-200",
        !disabled && "cursor-grab"
      )}
      {...listeners}
      {...attributes}
    >
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
  staff, shiftTypes, onAddToShift, disabled, onLeave,
}: {
  staff: StaffWithSkills
  shiftTypes: ShiftTypeDefinition[]
  onAddToShift: (staffId: string, shift: ShiftType) => void
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
      style={{
        opacity: isDragging ? 0 : 1,
        borderLeft: `3px solid ${onLeave ? "#FBBF24" : ROLE_BORDER[staff.role] ?? "#94A3B8"}`,
        borderRadius: 4,
      }}
      {...(onLeave ? {} : listeners)}
      {...(onLeave ? {} : attributes)}
      className={cn(
        "flex items-center gap-2 py-1.5 text-[12px] border border-slate-200",
        onLeave
          ? "text-muted-foreground/50 cursor-not-allowed select-none bg-amber-50/50 border-amber-200"
          : disabled
          ? "text-muted-foreground cursor-default bg-white"
          : "text-muted-foreground cursor-grab hover:bg-primary/5 hover:text-foreground transition-colors bg-white"
      )}
    >
      <span className="truncate flex-1">{staff.first_name} {staff.last_name}</span>
      {onLeave ? (
        <span className="text-[10px] shrink-0 flex items-center gap-1"><CalendarX className="size-3" />Baja</span>
      ) : !disabled && shiftTypes.length > 0 ? (
        <ShiftPickerButton shiftTypes={shiftTypes} onSelect={(shift) => onAddToShift(staff.id, shift)} />
      ) : null}
    </div>
  )
}

// ── Shift picker for OFF chips ────────────────────────────────────────────────

function ShiftPickerButton({ shiftTypes, onSelect }: { shiftTypes: ShiftTypeDefinition[]; onSelect: (shift: ShiftType) => void }) {
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

  if (shiftTypes.length === 1) {
    return (
      <button
        onClick={(e) => { e.stopPropagation(); onSelect(shiftTypes[0].code) }}
        onPointerDown={(e) => e.stopPropagation()}
        className="shrink-0"
      >
        <Plus className="size-3 opacity-40 hover:opacity-100 transition-opacity" />
      </button>
    )
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Plus className="size-3 opacity-40 hover:opacity-100 transition-opacity" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-border bg-background shadow-lg py-1 w-28">
          {shiftTypes.map((st) => (
            <button
              key={st.code}
              onClick={(e) => { e.stopPropagation(); onSelect(st.code); setOpen(false) }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-muted/50 transition-colors text-[12px]"
            >
              <span className="font-medium">{st.code}</span>
              <span className="text-muted-foreground text-[10px]">{st.start_time}</span>
            </button>
          ))}
        </div>
      )}
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
              <span className="w-0.5 h-4 shrink-0 rounded-full" style={{ background: ROLE_BORDER[s.role] ?? "#94A3B8" }} />
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
      is_manual_override: true,
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
                      {shiftAssignments.length > 0 && (
                        <span className="font-normal normal-case tracking-normal ml-1.5 text-slate-400">
                          · {shiftAssignments.length} {shiftAssignments.length === 1 ? "persona" : "personas"}
                        </span>
                      )}
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
                          onRemove={() => handleRemove(a.id)}
                          disabled={isPublished || a.id.startsWith("temp-")}
                          isPublished={isPublished}
                          onFunctionSave={handleFunctionSave}
                          onTecnicaSave={handleTecnicaSave}
                        />
                      )
                    })}
                    {shiftAssignments.length === 0 && (
                      <div className="rounded-lg border border-dashed border-slate-200 py-3 flex items-center justify-center text-[11px] text-slate-300 select-none">
                        Arrastra aquí o + Añadir
                      </div>
                    )}
                  </div>
                </DroppableShiftRow>
              )
            })}

            {/* OFF section separator */}
            <div className="mx-4 my-1" style={{
              borderBottom: "1px dashed #ccddee",
            }} />
            <DroppableOffSection className="transition-colors">
              <div className="px-4 pt-2 pb-1.5">
                <span className="text-[12px] text-slate-400 italic">OFF · No programados</span>
              </div>
              <div className="px-3 flex flex-col gap-1 pb-3 bg-slate-50/50 min-h-[40px]">
                {offStaff.map((s) => (
                  <DraggableOffChip
                    key={s.id}
                    staff={s}
                    shiftTypes={shiftTypes}
                    onAddToShift={handleAdd}
                    disabled={isPublished || !rota}
                    onLeave={false}
                  />
                ))}
                {onLeaveStaff.map((s) => (
                  <DraggableOffChip
                    key={s.id}
                    staff={s}
                    shiftTypes={shiftTypes}
                    onAddToShift={() => {}}
                    disabled={true}
                    onLeave={true}
                  />
                ))}
                {offStaff.length === 0 && onLeaveStaff.length === 0 && (
                  <p className="text-[11px] text-slate-300 italic py-1 select-none">Todo el personal asignado</p>
                )}
              </div>
            </DroppableOffSection>

            {/* Actions */}
            {!isPublished && rota && (
              <div className="px-4 py-3 flex flex-col gap-3">
                {/* Copy from last week */}
                {assignments.length === 0 && date && (
                  <button
                    onClick={() => {
                      startSave(async () => {
                        const r = await copyDayFromLastWeek(weekStart, date)
                        if (r.error) toast.error(r.error)
                        else { toast.success(`${r.count} asignaciones copiadas`); onSaved() }
                      })
                    }}
                    className="flex items-center gap-1.5 text-[12px] text-primary/70 hover:text-primary transition-colors"
                  >
                    <Copy className="size-3.5" />
                    Copiar de semana anterior
                  </button>
                )}
                {/* Delete all */}
                {assignments.length > 0 && (!showDeleteAll ? (
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
                ))}
              </div>
            )}
          </div>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {activeAssignment && (
              <div
                className="flex items-center gap-2 py-2 bg-white text-[13px] shadow-lg w-[330px] text-slate-700 border border-slate-200"
                style={{ borderLeft: `3px solid ${ROLE_BORDER[activeAssignment.staff.role] ?? "#94A3B8"}`, borderRadius: 4, paddingLeft: 8, paddingRight: 10 }}
              >
                <span className="font-medium truncate flex-1">
                  {activeAssignment.staff.first_name} {activeAssignment.staff.last_name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {ROLE_LABEL[activeAssignment.staff.role]}
                </span>
              </div>
            )}
            {activeOffStaff && (
              <div
                className="flex items-center gap-2 py-1.5 bg-white text-[12px] shadow-md w-[330px] text-slate-600 border border-slate-200"
                style={{ borderLeft: `3px solid ${ROLE_BORDER[activeOffStaff.role] ?? "#94A3B8"}`, borderRadius: 4, paddingLeft: 8, paddingRight: 10 }}
              >
                <span className="truncate">{activeOffStaff.first_name} {activeOffStaff.last_name}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      </SheetContent>
    </Sheet>
  )
}
