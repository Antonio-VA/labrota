"use client"

import { useMemo, useState, Fragment } from "react"
import { useTranslations } from "next-intl"
import { ArrowRightLeft, Plus } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { RotaWeekData, RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { PersonShiftSelector } from "./person-shift-selector"
import { PersonShiftPill } from "./person-shift-pill"
import { AssignmentPopover } from "./assignment-popover"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "./types"
import { ROLE_ORDER, ROLE_DOT, DEFAULT_DEPT_MAPS } from "./constants"
import { buildDeptMaps } from "./utils"
import { resolveColor } from "@/components/task-grid/constants"
import { TaskPickerInline as TaskPicker } from "./task-picker"
import { usePersonGridState } from "@/hooks/use-person-grid-state"
import { PersonGridHeader } from "./person-grid-header"

/** Pill showing a task code — no background by default, hover reveals task color */
function TaskChip({ label, color, onRemove }: { label: string; color: string; onRemove?: () => void }) {
  const [hov, setHov] = useState(false)
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold border transition-all duration-100 cursor-default leading-none"
      style={{
        borderColor: hov ? color + "60" : "transparent",
        background: hov ? color + "18" : "transparent",
        color: hov ? color : "inherit",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {label}
      {onRemove && hov && (
        <button
          className="ml-0.5 leading-none opacity-70 hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onRemove() }}
        >×</button>
      )}
    </span>
  )
}

interface PersonGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  loading: boolean
  locale: string
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  onChipClick: (assignment: Assignment, date: string) => void
  colorChips?: boolean
  compact?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  simplified?: boolean
  onDateClick?: (date: string) => void
  isGenerating?: boolean
  swapStaffId?: string | null
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}

function PersonGridSkeleton() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <div style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)" }}>
        <div className="h-[72px] border-b border-r border-border" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center py-2 border-b border-r last:border-r-0 border-border gap-1">
            <div className="shimmer-bar h-2.5 w-6" />
            <div className="shimmer-bar w-8 h-8 rounded-full" />
            <div className="shimmer-bar h-2.5 w-12 rounded" />
          </div>
        ))}
        {Array.from({ length: 8 }).map((_, i) => (
          <Fragment key={i}>
            <div className="px-3 py-2.5 border-b border-r border-border flex items-center">
              <div className="shimmer-bar h-3 w-28" />
            </div>
            {Array.from({ length: 7 }).map((_, j) => (
              <div key={j} className="p-1.5 border-b border-r last:border-r-0 border-border min-h-[48px] flex items-center">
                <div className="shimmer-bar h-9 w-full rounded" />
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  )
}

// Thin wrapper keeps hooks unconditional by gating the early-return paths
// (loading skeleton and null data) before entering the hook-rich inner component.
export function PersonGrid(props: PersonGridProps) {
  if (props.loading) return <PersonGridSkeleton />
  if (!props.data) return null
  return <PersonGridInner {...props} data={props.data} />
}

function PersonGridInner({
  data, staffList, locale,
  isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick, colorChips, compact, punctionsDefault, punctionsOverride, onPunctionsChange, simplified,
  swapStaffId, gridSetDaysRef,
}: PersonGridProps & { data: RotaWeekData }) {
  const t = useTranslations("schedule")

  const {
    localDays, assignMap, tecnicaByCode, tecnicaById, taskAssignMap, wholeTeamByDate,
    handleFunctionLabelSave, handleTaskRemove, handleTaskAdd,
    handleExistingShiftChange, handleOffSlotAssign,
  } = usePersonGridState({ data, staffList, gridSetDaysRef })

  const isTaskMode = data.rotaDisplayMode === "by_task"

  const { label: ROLE_LABEL_MAP } = useMemo(
    () => buildDeptMaps(data.departments ?? [], locale),
    [data.departments, locale],
  )

  const [pickerState, setPickerState] = useState<{ staffId: string | null; date: string } | null>(null)
  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredShift, setHoveredShift] = useState<string | null>(null)

  const roleGroups = useMemo(() => {
    const active = staffList
      .filter((s) => s.onboarding_status !== "inactive")
      .sort((a, b) => {
        const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
      })
    const groups: { role: string; members: StaffWithSkills[] }[] = []
    for (const s of active) {
      const last = groups[groups.length - 1]
      if (last && last.role === s.role) last.members.push(s)
      else groups.push({ role: s.role, members: [s] })
    }
    return groups
  }, [staffList])

  const days = localDays

  const renderTaskCell = (staffId: string | null, date: string, assigns: Assignment[], extra?: { onLeave?: boolean }) => {
    const onLeave = !!extra?.onLeave
    const assignedCodes = new Set(assigns.map((a) => a.function_label!).filter(Boolean))
    const isOpen = pickerState?.staffId === staffId && pickerState?.date === date
    const clickable = !isPublished && !onLeave
    return (
      <div
        className={cn(
          "border-b border-r last:border-r-0 border-border relative flex flex-wrap gap-0.5 items-center bg-background transition-colors",
          compact ? "px-0.5 py-0 min-h-[24px]" : "px-1 py-0.5 min-h-[36px]",
          onLeave && "bg-muted/20",
          clickable && "cursor-pointer hover:bg-muted/30",
        )}
        onClick={clickable ? () => setPickerState(isOpen ? null : { staffId, date }) : undefined}
      >
        {onLeave ? (
          <span className="text-[10px] text-muted-foreground italic w-full text-center">{t("leaveShort")}</span>
        ) : (
          <>
            {assigns.map((a) => {
              const tec = tecnicaByCode[a.function_label!]
              return (
                <TaskChip
                  key={a.id}
                  label={a.function_label!}
                  color={tec ? resolveColor(tec.color) : "#94A3B8"}
                  onRemove={!isPublished ? () => handleTaskRemove(a.id) : undefined}
                />
              )
            })}
            {!isPublished && !isOpen && (
              <span className="inline-flex items-center justify-center size-4 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors">
                <Plus className="size-3" />
              </span>
            )}
            {isOpen && (
              <TaskPicker
                tecnicas={data.tecnicas ?? []}
                assigned={assignedCodes}
                onSelect={(codigo) => handleTaskAdd(staffId, date, codigo)}
                onClose={() => setPickerState(null)}
              />
            )}
          </>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden w-full">
      <div style={{ display: "grid", gridTemplateColumns: "160px repeat(7, 1fr)" }}>

        <PersonGridHeader
          days={days}
          locale={locale}
          publicHolidays={publicHolidays}
          simplified={simplified}
          punctionsDefault={punctionsDefault}
          punctionsOverride={punctionsOverride}
          onPunctionsChange={onPunctionsChange}
          biopsyConversionRate={data.biopsyConversionRate ?? 0.5}
          biopsyDay5Pct={data.biopsyDay5Pct ?? 0.5}
          biopsyDay6Pct={data.biopsyDay6Pct ?? 0.5}
          onDateClick={onDateClick}
        />

        {/* ALL row — whole-team task assignments (task mode only) */}
        {isTaskMode && (
          <Fragment key="__all__">
            <div
              className="px-3 py-1.5 bg-muted border-b border-border flex items-center gap-1.5"
              style={{ gridColumn: "1 / -1" }}
            >
              <span className="size-1.5 rounded-full bg-slate-400 shrink-0" />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {t("wholeTeam")}
              </span>
            </div>
            <div className={cn("border-b border-r border-border bg-background sticky left-0 z-10 flex items-center", compact ? "px-1.5 min-h-[28px]" : "px-2 min-h-[36px]")}>
              <span className="text-[12px] font-semibold text-muted-foreground">ALL</span>
            </div>
            {days.map((day) => (
              <Fragment key={day.date}>
                {renderTaskCell(null, day.date, wholeTeamByDate[day.date] ?? [])}
              </Fragment>
            ))}
          </Fragment>
        )}

        {/* Staff groups */}
        {roleGroups.map((group) => (
          <Fragment key={group.role}>
            <div
              className="px-3 py-1.5 bg-muted border-b border-border flex items-center gap-1.5"
              style={{ gridColumn: "1 / -1" }}
            >
              <span className={cn("size-1.5 rounded-full shrink-0", ROLE_DOT[group.role] ?? "bg-slate-400")} />
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                {ROLE_LABEL_MAP[group.role] ?? group.role}
              </span>
            </div>

            {group.members.map((s) => {
              const staffAssigns = assignMap[s.id] ?? {}
              return (
                <Fragment key={s.id}>
                  <div
                    className={cn("border-b border-r border-border bg-background sticky left-0 z-10 flex items-center min-w-0 cursor-pointer hover:bg-muted/50", compact ? "px-1.5 py-0.5 min-h-[28px]" : "px-2 py-1 min-h-[36px]")}
                    style={colorChips ? { borderLeft: `3px solid ${DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8"}` } : undefined}
                    onClick={() => onChipClick({ staff_id: s.id } as Assignment, "")}
                  >
                    <span className="text-[13px] font-medium truncate leading-tight">
                      {s.first_name} {s.last_name}
                    </span>
                  </div>

                  {days.map((day) => {
                    const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)

                    if (isTaskMode) {
                      const taskAssigns = (taskAssignMap[s.id]?.[day.date] ?? []).filter((a) => a.function_label && !a.function_label.startsWith("dept_") && !a.whole_team)
                      return (
                        <Fragment key={day.date}>
                          {renderTaskCell(s.id, day.date, taskAssigns, { onLeave })}
                        </Fragment>
                      )
                    }

                    const assignment = staffAssigns[day.date]
                    const taskOff = !data.enableTaskInShift
                    const cleanFnLabel = assignment?.function_label?.startsWith("dept_") ? null : assignment?.function_label
                    const tecnica = (taskOff || !assignment) ? null
                      : cleanFnLabel
                        ? tecnicaByCode[cleanFnLabel] ?? null
                        : assignment.tecnica_id ? tecnicaById[assignment.tecnica_id] ?? null : null
                    const cellShift = assignment ? assignment.shift_type : (onLeave ? "__leave__" : "__off__")
                    const isShiftHovered = highlightEnabled && hoveredShift && cellShift === hoveredShift
                    const isOffCell = !assignment && !onLeave && isPublished
                    return (
                      <div
                        key={day.date}
                        className={cn("border-b border-r last:border-r-0 border-border flex items-center transition-colors duration-100", compact ? "px-0.5 py-0 min-h-[24px]" : "px-0.5 py-0.5 min-h-[36px]", isShiftHovered ? "bg-primary/10" : "bg-background")}
                        style={isOffCell ? { backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" } : undefined}
                        onMouseEnter={() => setHoveredShift(cellShift)}
                        onMouseLeave={() => setHoveredShift(null)}
                      >
                        {assignment ? (
                          swapStaffId && s.id === swapStaffId && isPublished ? (
                            <Tooltip>
                              <TooltipTrigger render={
                                <div
                                  className="w-full relative group/swap cursor-pointer"
                                  onClick={(e) => { e.stopPropagation(); onChipClick(assignment, day.date) }}
                                >
                                  <PersonShiftPill
                                    assignment={assignment}
                                    shiftTimes={shiftTimes}
                                    tecnica={tecnica}
                                    simplified={simplified}
                                  />
                                  <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                                    <ArrowRightLeft className="size-2.5" />
                                  </span>
                                </div>
                              } />
                              <TooltipContent side="right">
                                {t("requestShiftSwap")}
                              </TooltipContent>
                            </Tooltip>
                          ) : taskOff ? (
                            <PersonShiftSelector
                              assignment={assignment}
                              shiftTimes={shiftTimes}
                              shiftTypes={data.shiftTypes ?? []}
                              isPublished={isPublished}
                              simplified={simplified}
                              onShiftChange={(newShift) => handleExistingShiftChange(assignment, newShift, day.date)}
                            />
                          ) : (
                            <AssignmentPopover
                              assignment={assignment}
                              staffSkills={s.staff_skills ?? []}
                              tecnicas={data.tecnicas ?? []}
                              departments={data.departments ?? []}
                              onFunctionSave={handleFunctionLabelSave}
                              isPublished={isPublished}
                            >
                              <div className="w-full">
                                <PersonShiftPill
                                  assignment={assignment}
                                  shiftTimes={shiftTimes}
                                  tecnica={tecnica}
                                  simplified={simplified}
                                />
                              </div>
                            </AssignmentPopover>
                          )
                        ) : onLeave ? (
                          <span className="text-[12px] text-muted-foreground italic w-full text-center">{t("leaveShort")}</span>
                        ) : !isPublished ? (
                          <PersonShiftSelector
                            assignment={{ id: "", shift_type: "", staff_id: s.id, staff: s as never, is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false } as Assignment}
                            shiftTimes={shiftTimes}
                            shiftTypes={data.shiftTypes ?? []}
                            isPublished={false}
                            simplified={simplified}
                            isOff
                            onShiftChange={(newShift) => handleOffSlotAssign(s, day.date, newShift)}
                          />
                        ) : (
                          <span className="text-[12px] text-muted-foreground font-semibold select-none w-full text-center">OFF</span>
                        )}
                      </div>
                    )
                  })}
                </Fragment>
              )
            })}
          </Fragment>
        ))}
      </div>
      {/* Shift legend — shown in simplified mode */}
      {simplified && shiftTimes && Object.keys(shiftTimes).length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 border-t border-border bg-muted/50">
          {Object.entries(shiftTimes).map(([code, time]) => (
            <span key={code} className="text-[11px] text-muted-foreground">
              <span className="font-semibold" style={{ color: "var(--pref-bg)" }}>{code}</span>
              {" "}{time.start}–{time.end}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
