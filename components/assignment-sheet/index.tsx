"use client"

import { useState, useEffect } from "react"
import { useTranslations, useLocale } from "next-intl"
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"
import { formatTime } from "@/lib/format-time"
import {
  DndContext, DragOverlay,
  useSensor, useSensors, PointerSensor,
} from "@dnd-kit/core"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { useAssignmentActions } from "@/hooks/use-assignment-actions"
import type {
  StaffWithSkills, ShiftType, ShiftTypeDefinition, Tecnica,
} from "@/lib/types/database"
import type { RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"
import { ROLE_BORDER, ROLE_ORDER, TECNICA_PILL } from "./constants"
import { DraggableCard, DraggableOffChip } from "./draggable-cards"
import { DroppableShiftRow, DroppableOffSection, AddPersonButton } from "./droppable-sections"
import { ProceduresSection } from "./procedures-section"
import { SheetFooter } from "./sheet-footer"

type Assignment = RotaDay["assignments"][0]

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
  const ts = useTranslations("schedule")
  const locale = useLocale()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Merge department colours into the module-level ROLE_BORDER for sub-components
  useEffect(() => {
    for (const d of deptsProp ?? []) ROLE_BORDER[d.code] = d.colour
  }, [deptsProp])

  const {
    assignments,
    handleAdd, handleRemove,
    handleFunctionSave, handleTecnicaSave,
    handleDeleteAll, handleDragEnd,
  } = useAssignmentActions({ weekStart, date, day, rota, staffList, onSaved })

  const [warningsExpanded, setWarningsExpanded] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

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

  const activeAssignment = activeId ? assignments.find((a) => a.id === activeId) : null
  const activeOffStaff   = activeId?.startsWith("off-")
    ? staffList.find((s) => s.id === activeId.slice(4))
    : null

  const allWarnings = [
    ...skillGaps.map((sk) => ({ type: "gap" as const, text: sk })),
    ...warnings.map((w) => ({ type: "warn" as const, text: w.message })),
  ]
  const WARNINGS_VISIBLE = 2
  const warningsHasMore = allWarnings.length > WARNINGS_VISIBLE
  const warningsVisible = warningsExpanded ? allWarnings : allWarnings.slice(0, WARNINGS_VISIBLE)

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

          {assignments.length > 0 && !allCovered && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/20 px-3 py-2">
              <div className="flex flex-col gap-0.5">
                {warningsVisible.map((w, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <AlertTriangle className="size-3 text-amber-500 mt-0.5 shrink-0" />
                    <span className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">{w.text}</span>
                  </div>
                ))}
              </div>
              {warningsHasMore && (
                <button
                  onClick={() => setWarningsExpanded((v) => !v)}
                  className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-1 hover:underline"
                >
                  {warningsExpanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                  {warningsExpanded ? t("showLess") : `+${allWarnings.length - WARNINGS_VISIBLE} more`}
                </button>
              )}
            </div>
          )}

          <ProceduresSection
            open={open}
            date={date}
            effectiveP={effectiveP}
            hasOverride={hasOverride}
            biopsyForecast={biopsyForecast}
            assignments={assignments}
            isPublished={isPublished}
            rota={rota}
            onPunctionsChange={onPunctionsChange}
          />
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <DndContext
          id="assignment-sheet-dnd"
          sensors={sensors}
          onDragStart={(e) => setActiveId(String(e.active.id))}
          onDragEnd={(e) => { setActiveId(null); handleDragEnd(e) }}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="flex-1 overflow-y-auto">
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
              <div className="px-4 pt-2.5 pb-1.5 border-t border-border">
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
          </div>

          {!isPublished && rota && (
            <SheetFooter
              open={open}
              date={date}
              weekStart={weekStart}
              hasAssignments={assignments.length > 0}
              onSaved={onSaved}
              onDeleteAll={handleDeleteAll}
            />
          )}

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
