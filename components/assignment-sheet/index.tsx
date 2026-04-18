"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations, useLocale } from "next-intl"
import { Trash2, Pencil, AlertTriangle, CheckCircle2, Copy, Sparkles, Info, ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"
import { formatTime } from "@/lib/format-time"
import {
  DndContext, DragOverlay,
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
  setFunctionLabel,
  setTecnica,
  copyDayFromLastWeek,
  regenerateDay,
} from "@/app/(clinic)/rota/actions"
import type {
  StaffWithSkills, ShiftType, ShiftTypeDefinition, Tecnica,
} from "@/lib/types/database"
import type { RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"
import { ROLE_BORDER, ROLE_ORDER, TECNICA_PILL } from "./constants"
import { DraggableCard, DraggableOffChip } from "./draggable-cards"
import { DroppableShiftRow, DroppableOffSection, AddPersonButton } from "./droppable-sections"

type Assignment = RotaDay["assignments"][0]

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
  enableTaskInShift?: boolean
}

export function AssignmentSheet({
  open, onOpenChange, date, weekStart, day, staffList, onLeaveStaffIds,
  shiftTimes, shiftTypes, tecnicas, departments: deptsProp,
  punctionsDefault, punctionsOverride, rota, isPublished, onSaved, onPunctionsChange,
  timeFormat = "24h", biopsyForecast, rotaDisplayMode = "by_shift", taskConflictThreshold: _taskConflictThreshold = 3, enableTaskInShift = true,
}: Props) {
  const t = useTranslations("assignmentSheet")
  const tc = useTranslations("common")
  const ts = useTranslations("schedule")
  const locale = useLocale()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Merge department colours into the module-level ROLE_BORDER for sub-components
  useEffect(() => {
    for (const d of deptsProp ?? []) ROLE_BORDER[d.code] = d.colour
  }, [deptsProp])

  const sortAssignments = (items: Assignment[]) =>
    [...items].sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
  const [assignments, setAssignments] = useState<Assignment[]>(() => sortAssignments(day?.assignments ?? []))
  const [, startSave] = useTransition()

  const [editingP, setEditingP]       = useState(false)
  const [pDraft, setPDraft]           = useState("")
  const [showDeleteAll, setShowDeleteAll] = useState(false)
  const [showRegenConfirm, setShowRegenConfirm] = useState(false)
  const [isRegenerating, startRegen] = useTransition()
  const [warningsExpanded, setWarningsExpanded] = useState(false)

  // Sync from day prop — set-during-render beats effect + extra render pass
  const [prevDay, setPrevDay] = useState(day)
  if (day !== prevDay) {
    setPrevDay(day)
    setAssignments(sortAssignments(day?.assignments ?? []))
  }
  // Reset transient UI on close
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) { setShowDeleteAll(false); setEditingP(false) }
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const assignedIds  = new Set(assignments.map((a) => a.staff_id))
  const leaveIds     = new Set(onLeaveStaffIds)
  const unassigned   = staffList
    .filter((s) => !assignedIds.has(s.id))
    .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.first_name.localeCompare(b.first_name))
  const offStaff     = unassigned.filter((s) => !leaveIds.has(s.id))
  const onLeaveStaff = unassigned.filter((s) => leaveIds.has(s.id))

  const effectiveP   = date ? (punctionsOverride[date] ?? punctionsDefault) : 0
  const hasOverride  = date ? date in punctionsOverride : false

  const skillGaps = day?.skillGaps ?? []
  const warnings = day?.warnings ?? []
  const allCovered = skillGaps.length === 0 && warnings.length === 0

  const dateLabel = date
    ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
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

    let tempId = ""
    setAssignments((prev) => {
      tempId = `temp-${Date.now()}`
      const optimistic: Assignment = {
        id: tempId, staff_id: staffId, shift_type: shift,
        is_manual_override: true,
        trainee_staff_id: null, notes: null, function_label: null, tecnica_id: null, whole_team: false,
        staff: { id: staffId, first_name: staff.first_name, last_name: staff.last_name, role: staff.role },
      }
      return [...prev, optimistic].sort(
        (a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
      )
    })

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
            {assignments.length > 0 && allCovered && (
              <CheckCircle2 className="size-3.5 text-emerald-500 shrink-0" />
            )}
          </div>

          {/* Inline warnings */}
          {assignments.length > 0 && !allCovered && (() => {
            const allWarnings = [
              ...skillGaps.map((sk) => ({ type: "gap" as const, text: sk })),
              ...warnings.map((w) => ({ type: "warn" as const, text: w.message })),
            ]
            const VISIBLE_COUNT = 2
            const hasMore = allWarnings.length > VISIBLE_COUNT
            const visible = warningsExpanded ? allWarnings : allWarnings.slice(0, VISIBLE_COUNT)
            return (
              <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/20 px-3 py-2">
                <div className="flex flex-col gap-0.5">
                  {visible.map((w, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <AlertTriangle className="size-3 text-amber-500 mt-0.5 shrink-0" />
                      <span className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">{w.text}</span>
                    </div>
                  ))}
                </div>
                {hasMore && (
                  <button
                    onClick={() => setWarningsExpanded((v) => !v)}
                    className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-1 hover:underline"
                  >
                    {warningsExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                    {warningsExpanded ? t("showLess") : `+${allWarnings.length - VISIBLE_COUNT} more`}
                  </button>
                )}
              </div>
            )
          })()}

          {/* P+B section — procedures, ratio, staff count */}
          {(() => {
            const p = effectiveP
            const b = biopsyForecast ?? 0
            const totalProc = p + b
            const embCount = assignments.filter((a) => a.staff.role === "lab").length
            const androCount = assignments.filter((a) => a.staff.role === "andrology").length
            const qualifiedCount = embCount + androCount
            const pbIndex = totalProc > 0 ? (qualifiedCount / totalProc) : 0
            const pbIndexStr = pbIndex.toFixed(1)
            const opt = 1.0
            const min = 0.75
            const indexColor = totalProc > 0
              ? pbIndex >= opt ? "text-emerald-600" : pbIndex >= min ? "text-amber-600" : "text-destructive"
              : "text-muted-foreground"

            return (
              <div className="flex flex-col gap-1.5">
                {/* Procedures row — clickable to edit */}
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
                    {!isPublished && rota && <Pencil className="size-3 text-muted-foreground ml-1" />}
                  </button>
                )}

                {/* P+B ratio + staff breakdown — only when procedures exist */}
                {totalProc > 0 && (
                  <div className="flex items-center gap-2 px-3 pb-1 text-[11px]">
                    <span className={cn("font-bold tabular-nums text-[13px]", indexColor)}>
                      P+B: {pbIndexStr}
                    </span>
                    <Tooltip>
                      <TooltipTrigger render={
                        <Info className="size-3 text-muted-foreground/50 cursor-help" />
                      } />
                      <TooltipContent side="bottom" className="whitespace-pre-line text-[11px] max-w-[280px]">
                        {t("pbTooltip", {
                          staff: qualifiedCount,
                          emb: embCount,
                          andro: androCount,
                          total: totalProc,
                          pickups: p,
                          biopsies: b,
                        })}
                      </TooltipContent>
                    </Tooltip>
                    <span className="text-muted-foreground">
                      {qualifiedCount} {t("qualifiedStaff")} ({embCount} emb + {androCount} andro) ÷ {totalProc}
                    </span>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <DndContext
          sensors={sensors}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={(e) => { setActiveId(null); handleDragEnd(e) }}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex-1 overflow-y-auto">

            {/* Shift sections (all modes; by_task = read-only, technique shown as badge) */}
            <>
            {shiftTypes.map((shiftDef) => {
              const shift = shiftDef.code
              const shiftAssignments = assignments
                .filter((a) => a.shift_type === shift)
                .sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))
              // In by_task mode skip empty shift sections (all assignments share one dummy shift)
              if (rotaDisplayMode === "by_task" && shiftAssignments.length === 0) return null
              const available = offStaff.filter((s) => !assignedIds.has(s.id))
              const isTaskMode = rotaDisplayMode === "by_task"

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
                      {isTaskMode ? ts("assigned") : shift.toUpperCase()}{!isTaskMode && timeLabel}
                      {shiftAssignments.length > 0 && (
                        <span className="font-normal normal-case tracking-normal ml-1.5 text-slate-400">
                          · {shiftAssignments.length} {shiftAssignments.length === 1 ? ts("persona") : ts("personas")}
                        </span>
                      )}
                    </span>
                    {!isTaskMode && (
                      <AddPersonButton
                        shift={shift}
                        available={available}
                        onAdd={(sid) => handleAdd(sid, shift)}
                        disabled={isPublished || !rota}
                      />
                    )}
                  </div>

                  {/* Staff cards */}
                  <div className="px-3 flex flex-col gap-1.5 pb-3 min-h-[40px]">
                    {isTaskMode ? (() => {
                      // Group by staff_id so each person appears once with all their techniques
                      const byStaff: Record<string, { assignment: Assignment; tecnicaLabels: string[] }> = {}
                      for (const a of shiftAssignments) {
                        if (!byStaff[a.staff_id]) byStaff[a.staff_id] = { assignment: a, tecnicaLabels: [] }
                        if (a.function_label) byStaff[a.staff_id].tecnicaLabels.push(a.function_label)
                      }
                      return Object.values(byStaff).map(({ assignment: a, tecnicaLabels }) => (
                        <div
                          key={a.staff_id}
                          className="flex items-center gap-2 pl-3 pr-2 py-1.5 min-h-[34px] text-[13px] bg-background border border-border"
                          style={{ borderLeft: `3px solid ${ROLE_BORDER[a.staff.role] ?? "#94A3B8"}`, borderRadius: 4 }}
                        >
                          <span className="font-medium truncate flex-1 text-foreground/80">{a.staff.first_name} {a.staff.last_name}</span>
                          <div className="flex flex-wrap gap-1">
                            {tecnicaLabels.map((code) => {
                              const tec = tecnicas.find((t) => t.codigo === code)
                              const color = tec ? (TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue) : "bg-blue-50 border-blue-200 text-blue-700"
                              return (
                                <span key={code} className={cn("text-[9px] font-semibold px-1 py-0.5 rounded border shrink-0 leading-tight", color)}>
                                  {code}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      ))
                    })() : shiftAssignments.map((a) => {
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
                          enableTaskInShift={enableTaskInShift}
                          onFunctionSave={handleFunctionSave}
                          onTecnicaSave={handleTecnicaSave}
                        />
                      )
                    })}
                    {shiftAssignments.length === 0 && !isTaskMode && (
                      <div className="rounded-lg border border-dashed border-border py-3 flex items-center justify-center text-[11px] text-slate-300 select-none">
                        {t("dragHint")}
                      </div>
                    )}
                  </div>
                </DroppableShiftRow>
              )
            })}

            {/* Off section */}
            <DroppableOffSection className="transition-colors">
              <div
                className="px-4 pt-2.5 pb-1.5 border-t border-border"
              >
                <span className="text-[12px] font-medium text-muted-foreground">{t("libres")}</span>
              </div>
              <div
                className="px-3 flex flex-col gap-1 pb-3 min-h-[40px]"
                style={{
                  backgroundColor: "#ffffff",
                  backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)",
                  backgroundSize: "10px 10px",
                }}
              >
                {offStaff.map((s) => (
                  <DraggableOffChip
                    key={s.id}
                    staff={s}
                    shiftTypes={shiftTypes}
                    onAddToShift={handleAdd}
                    disabled={isPublished || !rota || rotaDisplayMode === "by_task"}
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

            </>
          </div>

          {/* Sticky footer — regenerate / copy / delete */}
          {!isPublished && rota && (
            <div className="px-3 py-4 border-t border-border flex flex-col gap-2 shrink-0 bg-background">
              {showRegenConfirm ? (
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
              ) : showDeleteAll ? (
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
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="gap-1.5 text-[14px] h-9"
                    onClick={() => setShowRegenConfirm(true)}
                    disabled={assignments.length === 0}
                  >
                    <Sparkles className="size-4" />
                    {t("regenerateDay")}
                  </Button>
                  {assignments.length === 0 && date && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[12px] gap-1.5"
                      onClick={() => {
                        startSave(async () => {
                          const r = await copyDayFromLastWeek(weekStart, date)
                          if (r.error) toast.error(r.error)
                          else { toast.success(ts("copyAssignments", { count: r.count ?? 0 })); onSaved() }
                        })
                      }}
                    >
                      <Copy className="size-3.5" />
                      {t("copyPrevWeek")}
                    </Button>
                  )}
                  <div className="flex-1" />
                  {assignments.length > 0 && (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground/50 hover:text-destructive"
                      onClick={() => setShowDeleteAll(true)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}

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
