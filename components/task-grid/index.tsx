"use client"

import React, { Fragment, useState, useRef } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { computeBiopsyForecast } from "@/lib/biopsy-forecast"
import { toast } from "sonner"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import { upsertAssignment, removeAssignment, setWholeTeam } from "@/app/(clinic)/rota/actions"
import { resolveColor, DEFAULT_DEPT_BORDER, type Assignment } from "./constants"
import { TaskCell } from "./task-cell"
import { OffCell } from "./off-cell"
import { PuncBiopsyEdit } from "./punc-biopsy-edit"

// ── Main grid ─────────────────────────────────────────────────────────────────

export function TaskGrid({
  data,
  staffList,
  loading,
  locale,
  isPublished,
  onRefresh,
  onAfterMutation,
  onCancelUndo,
  onSaved,
  taskConflictThreshold,
  punctionsDefault = {},
  punctionsOverride = {},
  onPunctionsChange,
  onBiopsyChange,
  biopsyConversionRate = 0.5,
  biopsyDay5Pct = 0.5,
  biopsyDay6Pct = 0.5,

  compact = false,
  colorBorders = true,
  showPuncBiopsy = true,
  onDateClick,
  onChipClick,
  gridSetDaysRef,
}: {
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
}) {
  const t = useTranslations("schedule")
  const [localDays, setLocalDays] = useState<RotaDay[]>(data?.days ?? [])
  // Register this grid's day setter for direct undo/redo updates
  if (gridSetDaysRef) gridSetDaysRef.current = setLocalDays
  // Local whole_team state: "tecnicaCode:date" → boolean
  const [localWholeTeam, setLocalWholeTeam] = useState<Record<string, boolean>>({})

  // Sync from server whenever data changes — set-during-render avoids one-frame lag
  const [prevData, setPrevData] = useState(data)
  if (data && data !== prevData) {
    setPrevData(data)
    setLocalDays(data.days)
    // Merge whole_team from server: keys with assignments get server truth,
    // keys without assignments keep local state (optimistic toggle)
    const serverWt: Record<string, boolean> = {}
    const keysWithAssignments = new Set<string>()
    for (const day of data.days) {
      for (const a of day.assignments) {
        if (a.function_label) {
          const key = `${a.function_label}:${day.date}`
          keysWithAssignments.add(key)
          if (a.whole_team) serverWt[key] = true
        }
      }
    }
    setLocalWholeTeam((prev) => {
      const next: Record<string, boolean> = {}
      for (const key of keysWithAssignments) {
        next[key] = serverWt[key] ?? false
      }
      for (const [key, val] of Object.entries(prev)) {
        if (!keysWithAssignments.has(key) && val) {
          next[key] = true
        }
      }
      return next
    })
  }

  if (loading || !data) {
    // Render enough rows to always fill the viewport; overflow-hidden clips the excess.
    const SKEL_ROWS = 22
    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div
          className="overflow-hidden"
          style={{ display: "grid", gridTemplateColumns: `${compact ? "90px" : "120px"} repeat(7, minmax(0, 1fr))` }}
        >
          {/* Header shimmer — matches real header structure */}
          <div className={cn("border-b border-r border-border bg-muted flex flex-col justify-center", compact ? "px-2 py-1" : "px-3 py-2")}>
            <div className="shimmer-bar h-3 w-12 rounded" />
          </div>
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className={cn("border-b border-r last:border-r-0 border-border flex flex-col items-center justify-center gap-1 bg-muted", compact ? "py-1" : "py-1.5")}>
              <div className="shimmer-bar h-2.5 w-6 rounded" />
              <div className="shimmer-bar w-6 h-6 rounded-full" />
            </div>
          ))}
          {/* Technique row shimmers — all rows get shimmer bars */}
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

  const tecnicas = (data.tecnicas ?? []).filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
  const days = localDays

  // Group tecnicas by shift — always show shift subheaders when shifts exist
  const activeShifts = (data.shiftTypes ?? []).filter((st) => st.active !== false)
  const useShiftGrouping = activeShifts.length > 0

  type TecnicaGroup = { shiftCode: string; shiftLabel: string; shiftTime: string; tecnicas: typeof tecnicas }
  const tecnicaGroups: TecnicaGroup[] = (() => {
    if (!useShiftGrouping) return [{ shiftCode: "", shiftLabel: "", shiftTime: "", tecnicas }]
    const groups: TecnicaGroup[] = []

    for (const st of activeShifts) {
      const groupTecnicas = tecnicas.filter((tc) => {
        // Empty typical_shifts = belongs to all shifts
        if (!tc.typical_shifts || tc.typical_shifts.length === 0) return true
        // Task appears in every shift it's flagged for
        return tc.typical_shifts.includes(st.code)
      })
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
  })()

  if (tecnicas.length === 0) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="text-[13px] text-muted-foreground">Sin tareas configuradas</span>
      </div>
    )
  }

  // Build stable color map — auto-assign for staff without a color
  // Map staff to department colours (from DB departments or fallback)
  const deptColorMap: Record<string, string> = {}
  for (const dept of (data?.departments ?? [])) {
    deptColorMap[dept.code] = dept.colour
  }
  const staffColorMap: Record<string, string> = {}
  staffList.forEach((s) => {
    staffColorMap[s.id] = s.color
      ? resolveColor(s.color)
      : (deptColorMap[s.role] ?? DEFAULT_DEPT_BORDER[s.role] ?? "#94A3B8")
  })

  // Build leave map: date → set of staff_ids
  const leaveByDate: Record<string, Set<string>> = {}
  for (const [date, ids] of Object.entries(data.onLeaveByDate)) {
    leaveByDate[date] = new Set(ids)
  }

  // Compute conflict staff per day: staff assigned to > threshold technique rows
  function getConflictStaff(day: RotaDay): Set<string> {
    const countByStaff: Record<string, number> = {}
    for (const a of day.assignments) {
      if (a.function_label) {
        countByStaff[a.staff_id] = (countByStaff[a.staff_id] ?? 0) + 1
      }
    }
    const conflicts = new Set<string>()
    for (const [id, count] of Object.entries(countByStaff)) {
      if (count > taskConflictThreshold) conflicts.add(id)
    }
    return conflicts
  }

  // Handlers
  // Compute weekStart from data
  const weekStart = data.weekStart

  const defaultShiftCode = (data?.shiftTypes?.[0]?.code ?? "T1") as ShiftType
  const staffLookup = Object.fromEntries(staffList.map((s) => [s.id, s]))

  // Optimistic patch helpers
  function optimisticAdd(staffId: string, functionLabel: string, date: string, shiftType?: ShiftType) {
    const s = staffLookup[staffId]
    if (!s) return
    const tempId = `temp-${Date.now()}-${Math.random()}`
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId, shift_type: shiftType ?? defaultShiftCode,
        is_manual_override: true, trainee_staff_id: null, notes: null,
        function_label: functionLabel, tecnica_id: null, whole_team: false,
        staff: { id: s.id, first_name: s.first_name, last_name: s.last_name, role: s.role as never },
      }],
    }))
  }

  function optimisticRemove(assignmentId: string) {
    setLocalDays((prev) => prev.map((d) => ({
      ...d,
      assignments: d.assignments.filter((a) => a.id !== assignmentId),
    })))
  }

  // Debounced refresh — batches rapid selections into one server fetch
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  function debouncedRefresh() {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => { onRefresh(); refreshTimer.current = null }, 800)
  }

  async function assignSilent(staffId: string, tecnicaCodigo: string, date: string, shiftType?: ShiftType) {
    const result = await upsertAssignment({
      weekStart, staffId, date, shiftType: shiftType ?? defaultShiftCode, functionLabel: tecnicaCodigo,
    })
    if (result.error) toast.error(result.error)
    return result
  }

  async function removeSilent(assignmentId: string) {
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
    return result
  }

  async function handleAssign(staffId: string, tecnicaCodigo: string, date: string, shiftType?: ShiftType) {
    const st = shiftType ?? defaultShiftCode
    const snapshot = data
    const idCapture: { value: string | undefined } = { value: undefined }
    optimisticAdd(staffId, tecnicaCodigo, date, st)
    if (snapshot) {
      onAfterMutation?.(
        snapshot,
        () => idCapture.value ? removeAssignment(idCapture.value) : Promise.resolve({ error: "Cannot undo" }),
        () => upsertAssignment({ weekStart, staffId, date, shiftType: st, functionLabel: tecnicaCodigo }),
      )
    }
    const result = await assignSilent(staffId, tecnicaCodigo, date, st)
    if (result.error) { onCancelUndo?.(); return }
    idCapture.value = result.id
    onSaved?.()
    debouncedRefresh()
  }

  async function handleRemove(assignmentId: string) {
    const snapshot = data
    const assignment = localDays.flatMap((d) => d.assignments.map((a) => ({ ...a, date: d.date }))).find((a) => a.id === assignmentId)
    optimisticRemove(assignmentId)
    if (snapshot && assignment) {
      onAfterMutation?.(
        snapshot,
        () => upsertAssignment({ weekStart, staffId: assignment.staff_id, date: assignment.date, shiftType: assignment.shift_type, functionLabel: assignment.function_label ?? undefined }),
        () => removeAssignment(assignmentId),
      )
    }
    const result = await removeSilent(assignmentId)
    if (result.error) { onCancelUndo?.(); return }
    onSaved?.()
    debouncedRefresh()
  }

  async function handleToggleWholeTeam(tecnicaCodigo: string, date: string, current: boolean) {
    const snapshot = data
    const key = `${tecnicaCodigo}:${date}`
    setLocalWholeTeam((prev) => ({ ...prev, [key]: !current }))
    if (snapshot) {
      onAfterMutation?.(
        snapshot,
        () => setWholeTeam(weekStart, tecnicaCodigo, date, current),
        () => setWholeTeam(weekStart, tecnicaCodigo, date, !current),
      )
    }
    const result = await setWholeTeam(weekStart, tecnicaCodigo, date, !current)
    if (result.error) { toast.error(result.error); onCancelUndo?.(); return }
    onSaved?.()
    onRefresh()
  }

  // Pre-compute per-day cross-shift exclusion:
  // For each day, which shift is each staff member working in?
  // staffShiftByDay[date] = Map<staffId, shiftCode>
  const staffShiftByDay: Record<string, Map<string, string>> = {}
  if (useShiftGrouping) {
    for (const day of days) {
      const map = new Map<string, string>()
      for (const a of day.assignments) {
        if (a.function_label && a.shift_type && !map.has(a.staff_id)) {
          map.set(a.staff_id, a.shift_type)
        }
      }
      staffShiftByDay[day.date] = map
    }
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background">
      <div style={{ display: "grid", gridTemplateColumns: `${compact ? "90px" : "120px"} repeat(${days.length}, minmax(0, 1fr))` }}>
        {/* Header row — top-left corner */}
        <div className={cn("border-b border-r border-border bg-muted", compact ? "px-2 py-1" : "px-3 py-2")} />
        {days.map((day) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).toUpperCase()
          const dayNum = d.getDate()
          const isToday = day.date === new Date().toISOString().split("T")[0]
          const holidayName = data.publicHolidays?.[day.date]

          // Punciones + biopsy forecast
          const defaultP = punctionsDefault[day.date] ?? 0
          const effectiveP = punctionsOverride[day.date] ?? defaultP
          const hasOverride = punctionsOverride[day.date] !== undefined

          function getPuncForDate(dateStr: string): number {
            if (punctionsOverride[dateStr] !== undefined) return punctionsOverride[dateStr]
            if (punctionsDefault[dateStr] !== undefined) return punctionsDefault[dateStr]
            const dow = new Date(dateStr + "T12:00:00").getDay()
            const sameDow = Object.entries(punctionsDefault).find(([dd]) => new Date(dd + "T12:00:00").getDay() === dow)
            return sameDow ? sameDow[1] : 0
          }
          const biopsyForecast = computeBiopsyForecast(day.date, getPuncForDate, biopsyConversionRate, biopsyDay5Pct, biopsyDay6Pct)

          return (
            <div
              key={day.date}
              className={cn(
                "border-b border-r last:border-r-0 border-border flex flex-col items-center justify-center gap-[2px] relative",
                compact ? "py-1" : "py-1.5",
                holidayName ? "bg-amber-50/60 dark:bg-amber-950/20" : "bg-muted",
              )}
              style={d.getDay() === 6 ? { borderLeftWidth: 1, borderLeftStyle: "dashed", borderLeftColor: "var(--border)" } : undefined}
            >
              {day.warnings.length > 0 && (
                <span className="absolute top-1 right-1">
                  <AlertTriangle className="size-3 text-amber-500" />
                </span>
              )}
              <button
                onClick={() => onDateClick?.(day.date)}
                className={cn("flex flex-col items-center gap-[2px] cursor-pointer hover:opacity-70 transition-opacity", !onDateClick && "cursor-default")}
              >
                <span className={cn("uppercase tracking-wider text-muted-foreground", compact ? "text-[9px]" : "text-[10px]")}>{wday}</span>
                <span className={cn(
                  "font-semibold leading-none",
                  compact ? "text-[13px]" : "text-[18px]",
                  isToday ? (compact ? "size-5 text-[11px]" : "size-7") + " bg-primary text-primary-foreground rounded-full flex items-center justify-center"
                  : holidayName ? "text-amber-600 dark:text-amber-400" : "text-primary"
                )}>
                  {dayNum}
                </span>
              </button>
              {holidayName && (
                <Tooltip>
                  <TooltipTrigger render={
                    <span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>
                  } />
                  <TooltipContent side="bottom">{holidayName}</TooltipContent>
                </Tooltip>
              )}
              {showPuncBiopsy && (
                <PuncBiopsyEdit
                  date={day.date}
                  value={effectiveP}
                  defaultValue={defaultP}
                  isOverride={hasOverride}
                  biopsyForecast={biopsyForecast}
                  onChange={onPunctionsChange}
                  onBiopsyChange={onBiopsyChange}
                  disabled={isPublished || !data.rota}
                />
              )}
            </div>
          )
        })}

        {/* Technique rows — grouped by shift when shift-department linking active */}
        {tecnicaGroups.map((group) => (
          <Fragment key={group.shiftCode || "__all__"}>
            {/* Shift subheader — only when shift grouping is active */}
            {useShiftGrouping && group.shiftCode !== "__other__" && (
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
            {(() => {
              // Determine shift code for this group's assignments
              const groupShift = (useShiftGrouping && group.shiftCode) ? group.shiftCode as ShiftType : defaultShiftCode

              // Scope staff to this shift via preferred_shift
              const shiftStaffList = useShiftGrouping && group.shiftCode
                ? staffList.filter((s) => !s.preferred_shift || s.preferred_shift === group.shiftCode)
                : staffList

              return group.tecnicas.map((tecnica) => {
              // Filter staff by the task's own departments
              const taskDepts = tecnica.department.split(",").filter(Boolean)
              const taskStaffList = taskDepts.length > 0
                ? shiftStaffList.filter((s) => taskDepts.includes(s.role))
                : shiftStaffList

              return (
              <Fragment key={`${tecnica.id}-${group.shiftCode}`}>
                {/* Technique label */}
                <div
                  className={cn("border-b border-r border-border flex items-center gap-1.5", compact ? "px-2 py-1" : "px-3 py-2")}
                  style={{ borderLeft: `3px solid ${resolveColor(tecnica.color)}` }}
                >
                  <span className={cn("font-medium truncate", compact ? "text-[10px]" : "text-[12px]")}>{tecnica.nombre_es}</span>
                </div>
                {/* Day cells for this technique */}
                {days.map((day) => {
                  // All assignments for this task on this day
                  const allDayAssignments = day.assignments.filter(
                    (a) => a.function_label === tecnica.codigo
                  ) as unknown as Assignment[]

                  // When shift grouping active, partition assignments by shift_type
                  const dayAssignments = useShiftGrouping && group.shiftCode
                    ? allDayAssignments.filter((a) => a.shift_type === group.shiftCode)
                    : allDayAssignments

                  // Day-level cross-shift exclusion: staff assigned to ANY task
                  // in a different shift on this day cannot be selected here
                  const shiftMap = staffShiftByDay[day.date]
                  const filteredStaffList = useShiftGrouping && group.shiftCode && shiftMap
                    ? taskStaffList.filter((s) => {
                        const assignedShift = shiftMap.get(s.id)
                        return !assignedShift || assignedShift === group.shiftCode
                      })
                    : taskStaffList

                  const conflictStaff = getConflictStaff(day)

                  const hasEmpty = dayAssignments.length === 0
                  return (
                    <div
                      key={`${tecnica.id}-${group.shiftCode}-${day.date}`}
                      className={cn(
                        "border-b border-r last:border-r-0 border-border min-w-0",
                        hasEmpty && "bg-muted/20",
                        day.isWeekend && "bg-muted/30"
                      )}
                      style={new Date(day.date + "T12:00:00").getDay() === 6 ? { borderLeftWidth: 1, borderLeftStyle: "dashed", borderLeftColor: "var(--border)" } : undefined}
                    >
                      <TaskCell
                        tecnica={tecnica}
                        date={day.date}
                        assignments={dayAssignments}
                        staffList={filteredStaffList}
                        leaveStaffIds={leaveByDate[day.date] ?? new Set()}
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
            )})
            })()}
          </Fragment>
        ))}

        {/* OFF row — unassigned + on leave */}
        <div className="border-r border-border px-3 py-2 flex items-center gap-1.5 bg-muted/40">
          <span className="text-[12px] font-medium text-muted-foreground">OFF</span>
        </div>
        {days.map((day) => {
          const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
          const leaveIds = leaveByDate[day.date] ?? new Set<string>()
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
                // Remove all assignments for this staff on this day
                const toRemove = day.assignments.filter((a) => a.staff_id === staffId)
                // Optimistic: remove from UI instantly
                for (const a of toRemove) optimisticRemove(a.id)
                // Server sync in parallel
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
