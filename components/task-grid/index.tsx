"use client"

import React, { Fragment, useMemo } from "react"
import { cn } from "@/lib/utils"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import { resolveColor, DEFAULT_DEPT_BORDER, EMPTY_STAFF_SET, type Assignment } from "./constants"
import { TaskCell } from "./task-cell"
import { OffCell } from "./off-cell"
import { TaskGridHeader } from "./task-grid-header"
import { useTaskGridState } from "@/hooks/use-task-grid-state"

interface TaskGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  isPublished: boolean
  onRefresh: () => void
  onAfterMutation?: (snapshot: RotaWeekData, inverse: () => Promise<{ error?: string }>, forward: () => Promise<{ error?: string }>) => void
  onCancelUndo?: () => void
  onSaved?: () => void
  taskConflictThreshold: number
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  biopsyConversionRate?: number
  biopsyDay5Pct?: number
  biopsyDay6Pct?: number
  compact?: boolean
  colorBorders?: boolean
  showPuncBiopsy?: boolean
  onDateClick?: (date: string) => void
  onChipClick?: (staffId: string) => void
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}

function TaskGridSkeleton({ compact }: { compact: boolean }) {
  const SKEL_ROWS = 22
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div
        className="overflow-hidden"
        style={{ display: "grid", gridTemplateColumns: `${compact ? "90px" : "120px"} repeat(7, minmax(0, 1fr))` }}
      >
        <div className={cn("border-b border-r border-border bg-muted flex flex-col justify-center", compact ? "px-2 py-1" : "px-3 py-2")}>
          <div className="shimmer-bar h-3 w-12 rounded" />
        </div>
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className={cn("border-b border-r last:border-r-0 border-border flex flex-col items-center justify-center gap-1 bg-muted", compact ? "py-1" : "py-1.5")}>
            <div className="shimmer-bar h-2.5 w-6 rounded" />
            <div className="shimmer-bar w-6 h-6 rounded-full" />
          </div>
        ))}
        {Array.from({ length: SKEL_ROWS }).map((_, row) => (
          <div key={row} className="contents">
            <div className={cn("border-b border-r border-border border-l-[3px] border-l-border/50 flex items-center", compact ? "px-2 py-1" : "px-3 py-2")}>
              <div className="shimmer-bar h-3 w-16 rounded" />
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className={cn("border-b border-r last:border-r-0 border-border p-1 flex items-center gap-0.5", compact ? "min-h-[28px]" : "min-h-[36px]")}>
                <div className="shimmer-bar h-4 flex-1 rounded" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export function TaskGrid(props: TaskGridProps) {
  if (props.loading || !props.data) return <TaskGridSkeleton compact={props.compact ?? false} />
  return <TaskGridInner {...props} data={props.data} />
}

function TaskGridInner({
  data, staffList, locale, isPublished,
  onRefresh, onAfterMutation, onCancelUndo, onSaved,
  taskConflictThreshold,
  punctionsDefault = {}, punctionsOverride = {},
  onPunctionsChange, onBiopsyChange,
  biopsyConversionRate = 0.5, biopsyDay5Pct = 0.5, biopsyDay6Pct = 0.5,
  compact = false, colorBorders = true, showPuncBiopsy = true,
  onDateClick, onChipClick, gridSetDaysRef,
}: TaskGridProps & { data: RotaWeekData }) {
  const {
    localDays, localWholeTeam, defaultShiftCode,
    optimisticAdd, optimisticRemove, assignSilent, removeSilent,
    handleAssign, handleRemove, handleToggleWholeTeam, debouncedRefresh,
  } = useTaskGridState({ data, staffList, gridSetDaysRef, onAfterMutation, onCancelUndo, onSaved, onRefresh })

  const tecnicas = useMemo(
    () => (data.tecnicas ?? []).filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden),
    [data.tecnicas],
  )

  const activeShifts = useMemo(
    () => (data.shiftTypes ?? []).filter((st) => st.active !== false),
    [data.shiftTypes],
  )
  const hasShiftGrouping = activeShifts.length > 0

  type TecnicaGroup = { shiftCode: string; shiftLabel: string; shiftTime: string; tecnicas: typeof tecnicas }
  const tecnicaGroups: TecnicaGroup[] = useMemo(() => {
    if (activeShifts.length === 0) return [{ shiftCode: "", shiftLabel: "", shiftTime: "", tecnicas }]
    const groups: TecnicaGroup[] = []
    for (const st of activeShifts) {
      const groupTecnicas = tecnicas.filter((tc) =>
        !tc.typical_shifts || tc.typical_shifts.length === 0 || tc.typical_shifts.includes(st.code),
      )
      if (groupTecnicas.length > 0) {
        groups.push({
          shiftCode: st.code,
          shiftLabel: st.name_es || st.code,
          shiftTime: `${st.start_time}–${st.end_time}`,
          tecnicas: groupTecnicas,
        })
      }
    }
    return groups
  }, [tecnicas, activeShifts])

  const staffColorMap = useMemo(() => {
    const deptColorMap: Record<string, string> = {}
    for (const dept of (data.departments ?? [])) deptColorMap[dept.code] = dept.colour
    const map: Record<string, string> = {}
    for (const s of staffList) {
      map[s.id] = s.color
        ? resolveColor(s.color)
        : (deptColorMap[s.role] ?? DEFAULT_DEPT_BORDER[s.role] ?? "#94A3B8")
    }
    return map
  }, [staffList, data.departments])

  const leaveByDate = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const [date, ids] of Object.entries(data.onLeaveByDate)) map[date] = new Set(ids)
    return map
  }, [data.onLeaveByDate])

  const staffShiftByDay = useMemo(() => {
    if (!hasShiftGrouping) return {} as Record<string, Map<string, string>>
    const out: Record<string, Map<string, string>> = {}
    for (const day of localDays) {
      const m = new Map<string, string>()
      for (const a of day.assignments) {
        if (a.function_label && a.shift_type && !m.has(a.staff_id)) {
          m.set(a.staff_id, a.shift_type)
        }
      }
      out[day.date] = m
    }
    return out
  }, [localDays, hasShiftGrouping])

  const assignmentsByDateAndCode = useMemo(() => {
    const out: Record<string, Record<string, Assignment[]>> = {}
    for (const day of localDays) {
      const byCode: Record<string, Assignment[]> = {}
      for (const a of day.assignments) {
        if (a.function_label) (byCode[a.function_label] ??= []).push(a as unknown as Assignment)
      }
      out[day.date] = byCode
    }
    return out
  }, [localDays])

  const conflictByDate = useMemo(() => {
    const out: Record<string, Set<string>> = {}
    for (const day of localDays) {
      const countByStaff: Record<string, number> = {}
      for (const a of day.assignments) {
        if (a.function_label) countByStaff[a.staff_id] = (countByStaff[a.staff_id] ?? 0) + 1
      }
      const conflicts = new Set<string>()
      for (const [id, count] of Object.entries(countByStaff)) {
        if (count > taskConflictThreshold) conflicts.add(id)
      }
      out[day.date] = conflicts
    }
    return out
  }, [localDays, taskConflictThreshold])

  if (tecnicas.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-muted-foreground">Sin tareas configuradas</span>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background">
      <div style={{ display: "grid", gridTemplateColumns: `${compact ? "90px" : "120px"} repeat(${localDays.length}, minmax(0, 1fr))` }}>

        <TaskGridHeader
          days={localDays}
          locale={locale}
          publicHolidays={data.publicHolidays ?? {}}
          compact={compact}
          showPuncBiopsy={showPuncBiopsy}
          punctionsDefault={punctionsDefault}
          punctionsOverride={punctionsOverride}
          onPunctionsChange={onPunctionsChange}
          onBiopsyChange={onBiopsyChange}
          biopsyConversionRate={biopsyConversionRate}
          biopsyDay5Pct={biopsyDay5Pct}
          biopsyDay6Pct={biopsyDay6Pct}
          puncDisabled={isPublished || !data.rota}
          onDateClick={onDateClick}
        />

        {tecnicaGroups.map((group) => {
          const groupShift = (hasShiftGrouping && group.shiftCode) ? group.shiftCode : defaultShiftCode
          const shiftStaffList = hasShiftGrouping && group.shiftCode
            ? staffList.filter((s) => !s.preferred_shift || s.preferred_shift === group.shiftCode)
            : staffList

          return (
            <Fragment key={group.shiftCode || "__all__"}>
              {hasShiftGrouping && (
                <div
                  className="px-3 py-1.5 bg-muted border-b border-border flex items-center gap-1.5"
                  style={{ gridColumn: "1 / -1" }}
                >
                  <span className={cn("font-semibold text-muted-foreground uppercase tracking-wide", compact ? "text-[10px]" : "text-[11px]")}>
                    {group.shiftLabel}
                  </span>
                  {group.shiftTime && (
                    <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                      {group.shiftTime}
                    </span>
                  )}
                </div>
              )}

              {group.tecnicas.map((tecnica) => {
                const taskDepts = tecnica.department.split(",").filter(Boolean)
                const taskStaffList = taskDepts.length > 0
                  ? shiftStaffList.filter((s) => taskDepts.includes(s.role))
                  : shiftStaffList

                return (
                  <Fragment key={`${tecnica.id}-${group.shiftCode}`}>
                    <div
                      className={cn("border-b border-r border-border flex items-center gap-1.5", compact ? "px-2 py-1" : "px-3 py-2")}
                      style={{ borderLeft: `3px solid ${resolveColor(tecnica.color)}` }}
                    >
                      <span className={cn("font-medium truncate", compact ? "text-[10px]" : "text-[12px]")}>{tecnica.nombre_es}</span>
                    </div>

                    {localDays.map((day) => {
                      const allDayAssignments = assignmentsByDateAndCode[day.date]?.[tecnica.codigo] ?? []
                      const dayAssignments = hasShiftGrouping && group.shiftCode
                        ? allDayAssignments.filter((a) => a.shift_type === group.shiftCode)
                        : allDayAssignments
                      const shiftMap = staffShiftByDay[day.date]
                      const filteredStaffList = hasShiftGrouping && group.shiftCode && shiftMap
                        ? taskStaffList.filter((s) => {
                            const assignedShift = shiftMap.get(s.id)
                            return !assignedShift || assignedShift === group.shiftCode
                          })
                        : taskStaffList
                      const conflictStaff = conflictByDate[day.date] ?? EMPTY_STAFF_SET
                      const hasEmpty = dayAssignments.length === 0

                      return (
                        <div
                          key={`${tecnica.id}-${group.shiftCode}-${day.date}`}
                          className={cn(
                            "border-b border-r last:border-r-0 border-border min-w-0",
                            hasEmpty && "bg-muted/20",
                            day.isWeekend && "bg-muted/30",
                          )}
                          style={new Date(day.date + "T12:00:00").getDay() === 6 ? { borderLeftWidth: 1, borderLeftStyle: "dashed", borderLeftColor: "var(--border)" } : undefined}
                        >
                          <TaskCell
                            tecnica={tecnica}
                            date={day.date}
                            assignments={dayAssignments}
                            staffList={filteredStaffList}
                            leaveStaffIds={leaveByDate[day.date] ?? EMPTY_STAFF_SET}
                            conflictStaffIds={conflictStaff}
                            isPublished={isPublished}
                            isWholeTeamOverride={localWholeTeam[`${tecnica.codigo}:${day.date}`] ?? undefined}
                            onAssign={(sid, code, d) => handleAssign(sid, code, d, groupShift)}
                            onRemove={handleRemove}
                            onAssignSilent={(sid, code, d) => assignSilent(sid, code, d, groupShift)}
                            onRemoveSilent={removeSilent}
                            onOptimisticAdd={(sid, fl, d) => optimisticAdd(sid, fl, d, groupShift)}
                            onOptimisticRemove={optimisticRemove}
                            onToggleWholeTeam={handleToggleWholeTeam}
                            onRefresh={debouncedRefresh}
                            compact={compact}
                            staffColorMap={staffColorMap}
                            colorBorders={colorBorders}
                            onChipClick={onChipClick}
                          />
                        </div>
                      )
                    })}
                  </Fragment>
                )
              })}
            </Fragment>
          )
        })}

        <div className="border-r border-border px-3 py-2 flex items-center gap-1.5 bg-muted/40">
          <span className="text-[12px] font-medium text-muted-foreground">OFF</span>
        </div>
        {localDays.map((day) => {
          const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
          const leaveIds = leaveByDate[day.date] ?? EMPTY_STAFF_SET
          const unassigned = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id))
          const onLeave = staffList.filter((s) => leaveIds.has(s.id))
          const leaveTypeByStaff = data.onLeaveTypeByDate?.[day.date] ?? {}

          return (
            <OffCell
              key={`off-${day.date}`}
              date={day.date}
              day={day}
              unassigned={unassigned}
              onLeave={onLeave}
              staffList={staffList}
              assignedIds={assignedIds}
              isPublished={isPublished}
              onMakeOff={async (staffId) => {
                const toRemove = day.assignments.filter((a) => a.staff_id === staffId)
                for (const a of toRemove) optimisticRemove(a.id)
                await Promise.all(toRemove.map((a) => removeSilent(a.id)))
                debouncedRefresh()
              }}
              staffColorMap={staffColorMap}
              leaveTypeByStaff={leaveTypeByStaff}
              onChipClick={onChipClick}
            />
          )
        })}
      </div>
    </div>
  )
}
