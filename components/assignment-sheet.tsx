"use client"

import { useState, useEffect, useRef, useTransition } from "react"
import { useTranslations } from "next-intl"
import { X, Plus, Trash2, Pencil, AlertTriangle, CheckCircle2, CalendarX, Copy, Hourglass, Users, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { formatTime } from "@/lib/format-time"
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
import { regenerateDay } from "@/app/(clinic)/rota/actions"

// ── Types ──────────────────────────────────────────────────────────────────────

type Assignment = RotaDay["assignments"][0]

const ROLE_DOT: Record<string, string> = {
  lab:       "bg-blue-400",
  andrology: "bg-emerald-400",
  admin:     "bg-slate-400",
}
import { DEFAULT_DEPT_BORDER } from "@/lib/department-colors"
const ROLE_BORDER: Record<string, string> = { ...DEFAULT_DEPT_BORDER }
const ROLE_LABEL: Record<string, string> = {
  lab: "Emb", andrology: "And", admin: "Adm",
}
const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }

const TECNICA_PILL: Record<string, string> = {
  amber:  "bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400",
  blue:   "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
  green:  "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
  purple: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
  coral:  "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
  teal:   "bg-teal-500/10 border-teal-500/30 text-teal-600 dark:text-teal-400",
  slate:  "bg-muted border-border text-muted-foreground",
  red:    "bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400",
}

const DEPT_FOR_ROLE: Record<string, string> = { lab: "lab", andrology: "andrology" }

// ── Function + Técnica inline popover ─────────────────────────────────────────

function AssignmentPopover({
  assignment, staffSkills, tecnicas, departments = [],
  onFunctionSave, onTecnicaSave, isPublished, children,
}: {
  assignment: { id: string; staff: { role: string }; function_label: string | null; tecnica_id: string | null }
  staffSkills: { skill: string; level: string }[]
  tecnicas: Tecnica[]
  departments?: import("@/lib/types/database").Department[]
  onFunctionSave: (id: string, label: string | null) => void
  onTecnicaSave: (id: string, tecnicaId: string | null) => void
  isPublished: boolean
  children: React.ReactNode
}) {
  const tSheet = useTranslations("assignmentSheet")
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

  // Sub-departments for the staff member's role department
  const roleDept = departments.find((d) => d.parent_id == null && d.code === assignment.staff.role)
  const roleSubDepts = roleDept ? departments.filter((d) => d.parent_id === roleDept.id) : []

  if ((availableTecnicas.length === 0 && roleSubDepts.length === 0) || isPublished) return <>{children}</>

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <div onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }} className="cursor-pointer flex-1 min-w-0">
        {children}
      </div>
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg py-1.5 w-52">
          <p className="text-[11px] font-semibold px-2.5 mb-1">{tSheet("assignment")}</p>
          {/* Sub-departments for staff's role */}
          {roleSubDepts.length > 0 && (
            <>
              <p className="text-[10px] text-muted-foreground font-medium mb-1 px-2.5">{tSheet("departmentLabel")}</p>
              <div className="flex flex-col">
                {roleSubDepts.map((dept) => {
                  const isActive = currentLabel === dept.code
                  return (
                    <button
                      key={dept.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onFunctionSave(assignment.id, isActive ? null : dept.code)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-muted"
                      )}
                    >
                      <span className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: dept.colour }} />
                      <span className={cn("text-[12px] truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{dept.name}</span>
                      {isActive && <span className="ml-auto text-[10px] text-primary">✓</span>}
                    </button>
                  )
                })}
              </div>
            </>
          )}
          {/* Tareas section */}
          {availableTecnicas.length > 0 && (
            <>
              <div className="h-px bg-border mx-2 my-1" />
              <p className="text-[10px] text-muted-foreground font-medium mb-1 px-2.5">{tSheet("tasksLabel")}</p>
              <div className="flex flex-col">
                {availableTecnicas.map((tec) => {
                  const isActive = assignment.tecnica_id === tec.id
                  const color = TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue
                  return (
                    <button
                      key={tec.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        onTecnicaSave(assignment.id, isActive ? null : tec.id)
                        setOpen(false)
                      }}
                      className={cn(
                        "flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors",
                        isActive ? "bg-accent" : "hover:bg-muted"
                      )}
                    >
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border shrink-0", color, isActive && "ring-1 ring-offset-1 ring-current")}>
                        {tec.codigo}
                      </span>
                      <span className={cn("text-[12px] truncate", isActive ? "font-medium text-foreground" : "text-muted-foreground")}>{tec.nombre_es}</span>
                    </button>
                  )
                })}
              </div>
            </>
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
    : pillLabel === "TRN" ? "bg-slate-50 border-border text-slate-500"
    : pillLabel ? "bg-blue-50 border-blue-200 text-blue-700"
    : null

  return (
    <div
      ref={setNodeRef}
      style={{ opacity: isDragging ? 0 : 1, borderLeft: `3px solid ${ROLE_BORDER[assignment.staff.role] ?? "#94A3B8"}`, borderRadius: 4 }}
      className={cn(
        "flex items-center gap-2.5 pl-3 pr-2 py-2 min-h-[40px] text-[13px] bg-background text-foreground border border-border",
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
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-medium truncate leading-tight">
            {assignment.staff.first_name} {assignment.staff.last_name}
          </span>
          <span className="text-[10px] font-medium text-muted-foreground shrink-0 leading-tight">
            {ROLE_LABEL[assignment.staff.role] ?? assignment.staff.role}
          </span>
          {pillLabel && pillColor && (
            <span className={cn("text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 ml-auto leading-tight", pillColor)}>
              {pillLabel}
            </span>
          )}
        </div>
      </AssignmentPopover>

      {/* Remove — clear tap target with padding */}
      {!disabled && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          onPointerDown={(e) => e.stopPropagation()}
          className="shrink-0 p-1 -mr-1 rounded text-muted-foreground/30 hover:text-destructive hover:bg-red-50 transition-colors"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ── Draggable OFF staff chip ───────────────────────────────────────────────────

function DraggableOffChip({
  staff, shiftTypes, onAddToShift, disabled, onLeave, timeFormat = "24h",
}: {
  staff: StaffWithSkills
  shiftTypes: ShiftTypeDefinition[]
  onAddToShift: (staffId: string, shift: ShiftType) => void
  disabled: boolean
  onLeave: boolean
  timeFormat?: string
}) {
  const tLeave = useTranslations("mySchedule")
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
        "flex items-center gap-1.5 py-1 px-2 text-[13px] font-medium border border-border rounded",
        onLeave
          ? "text-muted-foreground/50 cursor-not-allowed select-none bg-amber-500/5 border-amber-500/20"
          : disabled
          ? "text-muted-foreground cursor-default bg-background"
          : "text-foreground cursor-grab hover:bg-primary/5 transition-colors bg-background"
      )}
    >
      <span className="truncate flex-1">{staff.first_name} {staff.last_name[0]}.</span>
      {onLeave ? (
        <span className="text-[10px] shrink-0 flex items-center gap-1"><CalendarX className="size-3" />{tLeave("leave")}</span>
      ) : !disabled && shiftTypes.length > 0 ? (
        <ShiftPickerButton shiftTypes={shiftTypes} onSelect={(shift) => onAddToShift(staff.id, shift)} timeFormat={timeFormat} />
      ) : null}
    </div>
  )
}

// ── Shift picker for OFF chips ────────────────────────────────────────────────

function ShiftPickerButton({ shiftTypes, onSelect, timeFormat = "24h" }: { shiftTypes: ShiftTypeDefinition[]; onSelect: (shift: ShiftType) => void; timeFormat?: string }) {
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
              <span className="text-muted-foreground text-[10px]">{formatTime(st.start_time, timeFormat)}</span>
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
    <div ref={setNodeRef} className={cn(className, isOver && "bg-accent")}>
      {children}
    </div>
  )
}

function DroppableOffSection({ children, className }: { children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: "off-section" })
  return (
    <div ref={setNodeRef} className={cn(className, isOver && "bg-accent/50")}>
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
  const tAdd = useTranslations("common")
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
        {tAdd("add")}
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
  departments?: import("@/lib/types/database").Department[]
  punctionsDefault: number
  punctionsOverride: Record<string, number>
  rota: { id: string; status: string; punctions_override: Record<string, number> } | null
  isPublished: boolean
  onSaved: () => void
  onPunctionsChange: (date: string, value: number | null) => void
  timeFormat?: string
  biopsyForecast?: number
  rotaDisplayMode?: string
  taskConflictThreshold?: number
}

export function AssignmentSheet({
  open, onOpenChange, date, weekStart, day, staffList, onLeaveStaffIds,
  shiftTimes, shiftTypes, tecnicas, departments: deptsProp,
  punctionsDefault, punctionsOverride, rota, isPublished, onSaved, onPunctionsChange,
  timeFormat = "24h", biopsyForecast, rotaDisplayMode = "by_shift", taskConflictThreshold = 3,
}: Props) {
  const t = useTranslations("assignmentSheet")
  const tc = useTranslations("common")
  const ts = useTranslations("schedule")
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Merge department colours into the module-level ROLE_BORDER for sub-components
  for (const d of deptsProp ?? []) ROLE_BORDER[d.code] = d.colour

  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [, startSave] = useTransition()

  const [editingP, setEditingP]       = useState(false)
  const [pDraft, setPDraft]           = useState("")
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [isRegenerating, startRegen] = useTransition()

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
  const warnings = day?.warnings ?? []
  const allCovered = skillGaps.length === 0 && warnings.length === 0

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
      trainee_staff_id: null, notes: null, function_label: null, tecnica_id: null, whole_team: false,
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
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-medium capitalize leading-tight">{dateLabel}</p>
            {/* Coverage indicator */}
            {assignments.length > 0 && (
              allCovered ? (
                <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
              ) : (
                <Tooltip>
                  <TooltipTrigger render={
                    <AlertTriangle className="size-3.5 text-amber-500 shrink-0 cursor-default" />
                  } />
                  <TooltipContent side="bottom" className="max-w-[240px]">
                    {skillGaps.length > 0 && (
                      <>
                        <p className="font-medium text-[12px] mb-1">{t("uncoveredTasks")}</p>
                        {skillGaps.map((sk) => (
                          <p key={sk} className="text-[11px] text-muted-foreground">· {sk}</p>
                        ))}
                      </>
                    )}
                    {warnings.length > 0 && (
                      <>
                        {skillGaps.length > 0 && <div className="h-px bg-border my-1" />}
                        {warnings.map((w, i) => (
                          <p key={i} className="text-[11px] text-muted-foreground">· {w.message}</p>
                        ))}
                      </>
                    )}
                  </TooltipContent>
                </Tooltip>
              )
            )}
          </div>
          {/* Pick ups + Biopsies — single clickable zone */}
          {editingP ? (
            <div className="flex flex-col gap-2 bg-muted/30 rounded-lg px-3 py-2.5 border border-border">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-muted-foreground">{t("pickups")}</span>
                  <input
                    autoFocus
                    type="number"
                    min={0}
                    value={pDraft}
                    onChange={(e) => setPDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitPunctions(); if (e.key === "Escape") setEditingP(false) }}
                    className="w-14 text-[13px] text-center border border-primary rounded px-1 py-1 outline-none bg-background font-medium"
                  />
                </div>
                {biopsyForecast !== undefined && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[12px] text-muted-foreground">{t("biopsies")}</span>
                    <input
                      type="number"
                      min={0}
                      defaultValue={biopsyForecast}
                      className="w-14 text-[13px] font-medium text-center border border-input rounded px-1 py-1 bg-background outline-none focus:border-primary"
                    />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={commitPunctions}
                  className="flex-1 text-[12px] font-medium bg-primary text-primary-foreground rounded-md px-3 py-1.5 hover:opacity-90 transition-opacity"
                >
                  {tc("save")}
                </button>
                <button
                  onClick={() => setEditingP(false)}
                  className="text-[12px] text-muted-foreground px-3 py-1.5 rounded-md hover:bg-muted transition-colors"
                >
                  {tc("cancel")}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => {
                if (!isPublished && rota) { setPDraft(String(effectiveP)); setEditingP(true) }
              }}
              className={cn(
                "flex items-center gap-3 text-[12px] rounded-lg px-3 py-2 transition-colors text-left",
                !isPublished && rota && "hover:bg-muted/50 cursor-pointer active:bg-muted"
              )}
            >
              <span className="text-muted-foreground">{t("pickups")}: </span>
              <span className={cn("font-medium", hasOverride ? "text-primary" : "text-foreground")}>{effectiveP}</span>
              {biopsyForecast !== undefined && (
                <>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="text-muted-foreground">{t("biopsies")}: </span>
                  <span className="font-medium text-foreground">{biopsyForecast}</span>
                </>
              )}
              {!isPublished && rota && <Pencil className="size-3 text-muted-foreground ml-auto" />}
            </button>
          )}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={(e) => { setActiveId(null); handleDragEnd(e) }}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex-1 overflow-y-auto">

            {/* Task swimlane view (by_task mode) */}
            {rotaDisplayMode === "by_task" && (() => {
              const activeTecnicas = (tecnicas ?? []).filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
              const leaveSet = new Set(onLeaveStaffIds)

              // Count technique assignments per staff for conflict detection
              const techCountByStaff: Record<string, number> = {}
              for (const a of assignments) {
                if (a.function_label) techCountByStaff[a.staff_id] = (techCountByStaff[a.staff_id] ?? 0) + 1
              }
              const conflictIds = new Set(Object.entries(techCountByStaff).filter(([, c]) => c > taskConflictThreshold).map(([id]) => id))

              return (
                <div className="flex flex-col">
                  {activeTecnicas.map((tecnica) => {
                    const techAssignments = assignments.filter((a) => a.function_label === tecnica.codigo)
                    const assignedIds = new Set(techAssignments.map((a) => a.staff_id))
                    const qualifiedStaff = staffList.filter((s) => s.staff_skills.some((sk) => sk.skill === tecnica.codigo))
                    const isWholeTeam = techAssignments.some((a) => (a as unknown as { whole_team?: boolean }).whole_team)

                    return (
                      <div key={tecnica.id} className="border-b border-border px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                          <span
                            className="size-2 rounded-full shrink-0"
                            style={{ background: tecnica.color === "blue" ? "#60A5FA" : tecnica.color === "green" ? "#34D399" : tecnica.color === "amber" ? "#FBBF24" : tecnica.color === "purple" ? "#A78BFA" : tecnica.color === "coral" ? "#F87171" : tecnica.color === "teal" ? "#2DD4BF" : "#94A3B8" }}
                          />
                          <span className="text-[14px] font-medium">{tecnica.nombre_es}</span>
                          <span className="text-[11px] text-muted-foreground">({techAssignments.length}/3)</span>
                        </div>

                        {isWholeTeam ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 text-primary px-2 py-1 text-[12px] font-semibold">
                              <Users className="size-3" /> {t("wholeTeam")}
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 flex-wrap">
                            {techAssignments.map((a) => {
                              const onLeave = leaveSet.has(a.staff_id)
                              const hasConflict = conflictIds.has(a.staff_id)
                              return (
                                <span
                                  key={a.id}
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium",
                                    onLeave ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" :
                                    hasConflict ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" :
                                    "bg-muted text-foreground"
                                  )}
                                >
                                  {a.staff.first_name} {a.staff.last_name[0]}.
                                  {!isPublished && (
                                    <button onClick={() => handleRemove(a.id)} className="hover:text-destructive">
                                      <X className="size-3" />
                                    </button>
                                  )}
                                </span>
                              )
                            })}
                            {!isPublished && techAssignments.length < 3 && (
                              <span className="text-[11px] text-muted-foreground italic">
                                {techAssignments.length === 0 ? ts("dragHint") : ""}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Shift sections (by_shift mode) */}
            {rotaDisplayMode !== "by_task" && <>
            {shiftTypes.map((shiftDef) => {
              const shift = shiftDef.code
              const shiftAssignments = assignments
                .filter((a) => a.shift_type === shift)
                .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
              const available = offStaff.filter((s) => !assignedIds.has(s.id))

              const timeLabel = shiftTimes?.[shift]
                ? ` · ${formatTime(shiftTimes[shift].start, timeFormat)}–${formatTime(shiftTimes[shift].end, timeFormat)}`
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
                          · {shiftAssignments.length} {shiftAssignments.length === 1 ? ts("persona") : ts("personas")}
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
                      <div className="rounded-lg border border-dashed border-border py-3 flex items-center justify-center text-[11px] text-slate-300 select-none">
                        {t("dragHint")}
                      </div>
                    )}
                  </div>
                </DroppableShiftRow>
              )
            })}

            {/* OFF section separator */}
            <div className="mx-4 my-1" style={{
              borderBottom: "1px dashed var(--border)",
            }} />
            <DroppableOffSection className="transition-colors">
              <div className="px-4 pt-2 pb-1.5">
                <span className="text-[12px] text-muted-foreground italic">{t("offFree")}</span>
              </div>
              <div className="px-3 flex flex-col gap-1 pb-3 bg-muted/50 min-h-[40px]">
                {offStaff.map((s) => (
                  <DraggableOffChip
                    key={s.id}
                    staff={s}
                    shiftTypes={shiftTypes}
                    onAddToShift={handleAdd}
                    disabled={isPublished || !rota}
                    onLeave={false}
                    timeFormat={timeFormat}
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
                    timeFormat={timeFormat}
                  />
                ))}
                {offStaff.length === 0 && onLeaveStaff.length === 0 && (
                  <p className="text-[11px] text-slate-300 italic py-1 select-none">{t("allStaffAssigned")}</p>
                )}
              </div>
            </DroppableOffSection>

            {/* Actions — top bar */}
            {!isPublished && rota && (
              <div className="px-4 py-2 flex items-center gap-2 border-b border-border">
                <button
                  onClick={() => setShowRegenConfirm(true)}
                  disabled={assignments.length === 0}
                  className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                >
                  <Sparkles className="size-3.5" />
                  {t("regenerateDay")}
                </button>
                {assignments.length === 0 && date && (
                  <button
                    onClick={() => {
                      startSave(async () => {
                        const r = await copyDayFromLastWeek(weekStart, date)
                        if (r.error) toast.error(r.error)
                        else { toast.success(ts("copyAssignments", { count: r.count ?? 0 })); onSaved() }
                      })
                    }}
                    className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Copy className="size-3.5" />
                    {t("copyPrevWeek")}
                  </button>
                )}
                <div className="flex-1" />
                {assignments.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger render={
                      <button
                        onClick={() => setShowDeleteAll(true)}
                        className="text-muted-foreground/50 hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    } />
                    <TooltipContent side="left">{t("deleteDayShifts")}</TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
            {/* Confirmations */}
            {!isPublished && rota && (
              <div className="px-4 py-3 flex flex-col gap-3">
                {assignments.length > 0 && showDeleteAll && (
                  <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 flex flex-col gap-2">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="size-3.5 text-destructive mt-0.5 shrink-0" />
                      <p className="text-[12px] text-destructive leading-snug">
                        {t("deleteDayConfirm")}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-[12px] border-destructive/30 text-destructive hover:bg-destructive/5"
                        onClick={handleDeleteAll}
                      >
                        {tc("delete")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-3 text-[12px]"
                        onClick={() => setShowDeleteAll(false)}
                      >
                        {tc("cancel")}
                      </Button>
                    </div>
                  </div>
                )}
                {/* Regenerar día confirmation */}
                {showRegenConfirm && (
                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex flex-col gap-2">
                    <p className="text-[12px] text-foreground leading-snug">
                      {t("regenerateDayConfirm")}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 px-3 text-[12px]"
                        disabled={isRegenerating}
                        onClick={() => {
                          startRegen(async () => {
                            const result = await regenerateDay(weekStart, date!)
                            if (result.error) { toast.error(result.error); return }
                            toast.success(t("dayRegenerated", { count: result.count ?? 0 }))
                            setShowRegenConfirm(false)
                            onSaved()
                          })
                        }}
                      >
                        {isRegenerating ? t("regenerating") : t("regenerate")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-3 text-[12px]"
                        onClick={() => setShowRegenConfirm(false)}
                      >
                        {tc("cancel")}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>}
          </div>

          {/* Drag overlay */}
          <DragOverlay dropAnimation={null}>
            {activeAssignment && (
              <div
                className="flex items-center gap-2 py-2 bg-background text-[13px] shadow-lg w-[330px] text-foreground border border-border"
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
                className="flex items-center gap-2 py-1.5 bg-background text-[12px] shadow-md w-[330px] text-muted-foreground border border-border"
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
