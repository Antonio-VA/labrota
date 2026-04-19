"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ArrowRightLeft } from "lucide-react"
import { toast } from "sonner"
import { DndContext, DragOverlay } from "@dnd-kit/core"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import {
  setFunctionLabel,
  type RotaWeekData,
  type RotaDay,
  type ShiftTimes,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"
import { useShiftGridDnd } from "@/hooks/use-shift-grid-dnd"
import { DraggableShiftBadge, DroppableCell } from "./dnd-wrappers"
import { AssignmentPopover } from "./assignment-popover"
import { ShiftBadge } from "./shift-badge"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "./types"
import { DEFAULT_DEPT_MAPS } from "./constants"
import { buildDeptMaps } from "./utils"
import { ShiftGridHeader } from "./shift-grid-header"
import { ShiftGridOffRow } from "./shift-grid-off-row"

export function ShiftGrid({
  data, staffList, loading, locale,
  onCellClick, onChipClick,
  isPublished,
  onLeaveByDate, publicHolidays,
  punctionsDefault, punctionsOverride, onPunctionsChange, onBiopsyChange,
  onRefresh, onAfterMutation, onCancelUndo, onSaved, weekStart, compact, colorChips, simplified, onDateClick, onLocalDaysChange,
  timeFormat = "24h",
  biopsyConversionRate = 0.5, biopsyDay5Pct = 0.5, biopsyDay6Pct = 0.5,
  swapStaffId, gridSetDaysRef,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  onCellClick: (date: string, shiftType: ShiftType) => void
  onChipClick: (assignment: Assignment, date: string) => void
  isPublished: boolean
  isGenerating?: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  punctionsDefault: Record<string, number>
  punctionsOverride: Record<string, number>
  onPunctionsChange: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  onRefresh: () => void
  onAfterMutation?: (snapshot: RotaWeekData, inverse: () => Promise<{ error?: string }>, forward: () => Promise<{ error?: string }>) => void
  onCancelUndo?: () => void
  onSaved?: () => void
  weekStart: string
  compact?: boolean
  colorChips?: boolean
  simplified?: boolean
  onDateClick?: (date: string) => void
  onLocalDaysChange?: (days: RotaDay[]) => void
  ratioOptimal?: number
  ratioMinimum?: number
  timeFormat?: string
  biopsyConversionRate?: number
  biopsyDay5Pct?: number
  biopsyDay6Pct?: number
  swapStaffId?: string | null
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}) {
  const t = useTranslations("schedule")

  const staffById = useMemo(() => new Map(staffList.map((s) => [s.id, s])), [staffList])

  const deptColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    for (const dept of (data?.departments ?? [])) m[dept.code] = dept.colour
    return m
  }, [data?.departments])
  const staffColorMap = useMemo(() =>
    Object.fromEntries(staffList.map((s) => [s.id, s.color || deptColorMap[s.role] || DEFAULT_DEPT_MAPS.border[s.role] || "#94A3B8"]))
  , [staffList, deptColorMap])
  const { hoveredStaffId, setHovered } = useStaffHover()

  const headerDates = useMemo(() => {
    const dates: string[] = []
    const base = new Date(weekStart + "T12:00:00")
    for (let i = 0; i < 7; i++) {
      const d = new Date(base)
      d.setDate(base.getDate() + i)
      dates.push(d.toISOString().split("T")[0])
    }
    return dates
  }, [weekStart])

  const tecnicaByCode = useMemo(() =>
    Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.codigo, t]))
  , [data?.tecnicas])
  const tecnicaById = useMemo(() =>
    Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.id, t]))
  , [data?.tecnicas])

  const staffSkillLevelMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {}
    for (const s of staffList) {
      m[s.id] = {}
      for (const sk of s.staff_skills ?? []) m[s.id][sk.skill] = sk.level
    }
    return m
  }, [staffList])

  const deptMapsMemo = useMemo(() => buildDeptMaps(data?.departments ?? [], locale), [data?.departments, locale])

  const [localDays, setLocalDaysRaw] = useState(data?.days ?? [])
  const setLocalDays = useCallback<typeof setLocalDaysRaw>((update) => {
    setLocalDaysRaw((prev) => {
      const next = typeof update === "function" ? update(prev) : update
      onLocalDaysChange?.(next)
      return next
    })
  }, [onLocalDaysChange])

  useEffect(() => {
    if (!gridSetDaysRef) return
    gridSetDaysRef.current = setLocalDaysRaw
    return () => { gridSetDaysRef.current = null }
  }, [gridSetDaysRef])

  // Sync local state whenever server data arrives — set-during-render avoids one-frame lag
  const [prevData, setPrevData] = useState(data)
  if (data && data !== prevData) {
    setPrevData(data)
    setLocalDaysRaw(data.days)
    onLocalDaysChange?.(data.days)
  }

  const patchLocalAssignment = useCallback((assignmentId: string, patch: Record<string, unknown>) => {
    setLocalDays((prev) => prev.map((d) => ({
      ...d,
      assignments: d.assignments.map((a) =>
        a.id === assignmentId ? { ...a, ...patch } : a
      ),
    })))
  }, [setLocalDays])

  const handleFunctionLabelSave = useCallback(async (assignmentId: string, label: string | null) => {
    patchLocalAssignment(assignmentId, { function_label: label })
    const result = await setFunctionLabel(assignmentId, label)
    if (result.error) { toast.error(result.error); onRefresh() }
  }, [patchLocalAssignment, onRefresh])

  const { activeId, overId, sensors, handleDragStart, handleDragOver, handleDragEnd } = useShiftGridDnd({
    localDays, data, weekStart, staffById, setLocalDays,
    onAfterMutation, onCancelUndo, onSaved, onRefresh, t,
  })

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-background overflow-hidden w-full flex flex-col">
        <div className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border" style={{ minHeight: 52 }}>
          <div className="border-r border-border bg-muted" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center justify-center py-1.5 gap-1 border-l border-border bg-muted">
              <div className="shimmer-bar h-2.5 w-6" />
              <div className="shimmer-bar w-8 h-8 rounded-full" />
              <div className="shimmer-bar h-2.5 w-12 rounded" />
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }).map((_, row) => (
          <div key={row} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border">
            <div className="border-r border-border flex items-center justify-end px-2 py-3">
              <div className="shimmer-bar h-3 w-8" />
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="border-l border-border p-2 flex flex-col gap-1.5 justify-center" style={{ minHeight: 80 }}>
                <div className="shimmer-bar h-4 rounded" style={{ width: `${60 + ((row * 7 + i) % 4) * 10}%` }} />
                <div className="shimmer-bar h-4 rounded" style={{ width: `${50 + ((row * 7 + i + 2) % 4) * 10}%` }} />
                <div className="shimmer-bar h-4 rounded" style={{ width: `${55 + ((row * 7 + i + 1) % 3) * 10}%` }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    )
  }

  if (!data) return null

  const SHIFT_ROWS = data.shiftTypes.map((s) => s.code)
  const shiftTypeMap = Object.fromEntries((data.shiftTypes ?? []).map((st) => [st.code, st]))
  const visibleStaffIds = new Set(staffList.map((s) => s.id))

  const ROLE_BORDER = deptMapsMemo.border
  const ROLE_LABEL = deptMapsMemo.label
  const ROLE_ORDER = deptMapsMemo.order

  const sortChips = (a: Assignment, b: Assignment) => {
    const r = (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
    if (r !== 0) return r
    return a.staff.first_name.localeCompare(b.staff.first_name) || a.staff.last_name.localeCompare(b.staff.last_name)
  }

  const activeAssignment = activeId
    ? localDays.flatMap((d) => d.assignments).find((a) => a.id === activeId)
    : null

  const activeOffStaff = activeId?.startsWith("off-")
    ? staffList.find((s) => activeId.startsWith(`off-${s.id}`))
    : null

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="rounded-lg border border-border bg-background overflow-hidden w-full">
        <ShiftGridHeader
          headerDates={headerDates}
          localDays={localDays}
          locale={locale}
          publicHolidays={publicHolidays}
          simplified={simplified}
          hasRota={!!data.rota}
          punctionsDefault={punctionsDefault}
          punctionsOverride={punctionsOverride}
          onPunctionsChange={onPunctionsChange}
          onBiopsyChange={onBiopsyChange}
          biopsyConversionRate={biopsyConversionRate}
          biopsyDay5Pct={biopsyDay5Pct}
          biopsyDay6Pct={biopsyDay6Pct}
          isPublished={isPublished}
          onDateClick={onDateClick}
        />

        {SHIFT_ROWS.map((shiftRow) => (
          <div key={shiftRow} className="grid grid-cols-[80px_repeat(7,1fr)] border-b border-border">
            <div className="flex flex-col items-end justify-center px-2.5 py-2 bg-muted">
              <span className="text-[11px] leading-tight font-semibold text-foreground">{shiftRow}</span>
              <span className="text-[13px] font-medium leading-tight tabular-nums text-primary">
                {shiftTypeMap[shiftRow]?.start_time ? formatTime(shiftTypeMap[shiftRow].start_time, timeFormat) : shiftRow}
              </span>
              {shiftTypeMap[shiftRow]?.end_time && (
                <span className="text-[11px] text-muted-foreground leading-tight tabular-nums">
                  {formatTime(shiftTypeMap[shiftRow].end_time, timeFormat)}
                </span>
              )}
            </div>
            {localDays.map((day) => {
              const dayShifts = day.assignments
                .filter((a) => a.shift_type === shiftRow && visibleStaffIds.has(a.staff_id))
                .sort(sortChips)
              const cellId = `${shiftRow}-${day.date}`
              return (
                <DroppableCell
                  key={day.date}
                  id={cellId}
                  isOver={overId === cellId}
                  isPublished={isPublished}
                  onClick={() => { if (!isPublished) onCellClick(day.date, shiftRow) }}
                  className={cn(
                    "p-1.5 flex flex-col gap-1 border-l border-border bg-background",
                    compact ? "min-h-[32px]" : "min-h-[48px]",
                    !isPublished && "cursor-pointer"
                  )}
                  style={undefined}
                >
                  {dayShifts.map((a) => {
                    const staffMember = staffById.get(a.staff_id)
                    const taskDisabled = data?.rotaDisplayMode === "by_shift" && !data?.enableTaskInShift
                    const cleanFn = a.function_label?.startsWith("dept_") ? null : a.function_label
                    const tecnica = taskDisabled ? null
                      : cleanFn
                      ? tecnicaByCode[cleanFn] ?? null
                      : (a.tecnica_id ? tecnicaById[a.tecnica_id] ?? null : null)
                    const isViewerChip = !!swapStaffId && a.staff_id === swapStaffId
                    return (
                      <AssignmentPopover
                        key={a.id}
                        assignment={a}
                        staffSkills={staffMember?.staff_skills ?? []}
                        tecnicas={data?.tecnicas ?? []}
                        departments={data?.departments ?? []}
                        onFunctionSave={handleFunctionLabelSave}
                        isPublished={isPublished}
                        disabled={taskDisabled || isViewerChip}
                      >
                        <Tooltip>
                          <TooltipTrigger render={
                            <div
                              onClick={(taskDisabled || isViewerChip) ? (e: React.MouseEvent) => { e.stopPropagation(); onChipClick(a, day.date) } : undefined}
                              className={cn((taskDisabled || isViewerChip) ? "cursor-pointer" : undefined, isViewerChip && "relative group/swap")}
                            >
                              <DraggableShiftBadge
                                id={a.id}
                                first={a.staff.first_name}
                                last={a.staff.last_name}
                                role={a.staff.role}
                                isOverride={a.is_manual_override}
                                functionLabel={taskDisabled ? null : cleanFn}
                                tecnica={tecnica}
                                compact={compact}
                                borderColor={ROLE_BORDER[a.staff.role]}
                                isTrainingTecnica={!!(cleanFn && staffSkillLevelMap[a.staff_id]?.[cleanFn] === "training")}
                                colorChips={colorChips}
                                readOnly={isPublished || taskDisabled}
                                staffId={a.staff_id}
                                staffColor={staffColorMap[a.staff_id]}
                                departments={data?.departments ?? []}
                                trainingTecCode={data?.trainingByStaff?.[day.date]?.[a.staff_id] ?? null}
                              />
                              {isViewerChip && (
                                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                                  <ArrowRightLeft className="size-2.5" />
                                </span>
                              )}
                            </div>
                          } />
                          <TooltipContent side="right">
                            {isViewerChip
                              ? t("requestShiftSwap")
                              : `${a.staff.first_name} ${a.staff.last_name} · ${ROLE_LABEL[a.staff.role] ?? a.staff.role}${tecnica ? ` · ${tecnica.nombre_es}` : cleanFn ? ` · ${cleanFn}` : ""}${data?.trainingByStaff?.[day.date]?.[a.staff_id] ? ` · ⏳ ${data.trainingByStaff[day.date][a.staff_id]}` : cleanFn && staffSkillLevelMap[a.staff_id]?.[cleanFn] === "training" ? ` · ${t("inTraining")}` : ""}`}
                          </TooltipContent>
                        </Tooltip>
                      </AssignmentPopover>
                    )
                  })}
                </DroppableCell>
              )
            })}
          </div>
        ))}

        <ShiftGridOffRow
          localDays={localDays}
          staffList={staffList}
          onLeaveByDate={onLeaveByDate}
          overId={overId}
          isPublished={isPublished}
          colorChips={colorChips}
          hoveredStaffId={hoveredStaffId}
          setHovered={setHovered}
          staffColorMap={staffColorMap}
          roleBorder={ROLE_BORDER}
          roleOrder={ROLE_ORDER}
          onChipClick={onChipClick}
        />
      </div>

      <DragOverlay>
        {activeAssignment ? (
          <div className="opacity-90 shadow-lg rounded">
            <ShiftBadge
              first={activeAssignment.staff.first_name}
              last={activeAssignment.staff.last_name}
              role={activeAssignment.staff.role}
              isOverride={activeAssignment.is_manual_override}
              functionLabel={activeAssignment.function_label}
              borderColor={ROLE_BORDER[activeAssignment.staff.role]}
              readOnly
              departments={data?.departments ?? []}
              tecnica={activeAssignment.function_label
                ? tecnicaByCode[activeAssignment.function_label] ?? null
                : (activeAssignment.tecnica_id ? tecnicaById[activeAssignment.tecnica_id] ?? null : null)}
            />
          </div>
        ) : activeOffStaff ? (
          <div className="opacity-90 shadow-lg rounded">
            <ShiftBadge
              first={activeOffStaff.first_name}
              last={activeOffStaff.last_name}
              role={activeOffStaff.role}
              isOverride={false}
              functionLabel={null}
              readOnly
              borderColor={ROLE_BORDER[activeOffStaff.role]}
            />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
