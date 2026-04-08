"use client"

import { useState, Fragment } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Check, ArrowRightLeft } from "lucide-react"
import { toast } from "sonner"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { removeAssignment, upsertAssignment, type RotaWeekData, type ShiftTimes } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { PersonShiftSelector } from "./person-shift-selector"
import { useStaffHover } from "@/components/staff-hover-context"
import type { Assignment } from "./types"
import { ROLE_ORDER, TODAY, DEFAULT_DEPT_MAPS } from "./constants"

export function TransposedPersonGrid({
  data, staffList, locale, isPublished, shiftTimes, onLeaveByDate, publicHolidays,
  onChipClick, onDateClick, colorChips, compact, simplified, punctionsDefault, punctionsOverride, onPunctionsChange,
  swapStaffId,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  onLeaveByDate: Record<string, string[]>
  publicHolidays: Record<string, string>
  onChipClick: (assignment: { staff_id: string }, date: string) => void
  onDateClick?: (date: string) => void
  colorChips?: boolean
  compact?: boolean
  simplified?: boolean
  punctionsDefault?: Record<string, number>
  punctionsOverride?: Record<string, number>
  onPunctionsChange?: (date: string, value: number | null) => void
  swapStaffId?: string | null
}) {
  const t = useTranslations("schedule")
  const { enabled: highlightEnabled } = useStaffHover()
  const [hoveredShift, setHoveredShift] = useState<string | null>(null)

  if (!data) return null

  const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
  const ROLE_LABEL_MAP: Record<string, string> = {}
  for (const d of data.departments ?? []) { if (!d.parent_id) ROLE_LABEL_MAP[d.code] = d.name }

  const activeStaff = staffList
    .filter((s) => s.onboarding_status !== "inactive")
    .sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
    })

  const [localDays, setLocalDays] = useState(data.days)
  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setLocalDays(data.days)
  }

  // Build assignment map: staffId → date → assignment
  const assignMap: Record<string, Record<string, Assignment>> = {}
  for (const day of localDays) {
    for (const a of day.assignments) {
      if (!assignMap[a.staff_id]) assignMap[a.staff_id] = {}
      assignMap[a.staff_id][day.date] = a
    }
  }

  // Group staff by role for sub-headers
  const roleGroups: { role: string; members: StaffWithSkills[] }[] = []
  for (const s of activeStaff) {
    const last = roleGroups[roleGroups.length - 1]
    if (last && last.role === s.role) last.members.push(s)
    else roleGroups.push({ role: s.role, members: [s] })
  }

  const allMembers = roleGroups.flatMap((g) => g.members)
  const days = localDays

  return (
    <div className="rounded-lg border border-border overflow-auto w-full">
      <div style={{ display: "grid", gridTemplateColumns: `80px repeat(${allMembers.length}, minmax(${compact ? "48px" : "60px"}, 1fr))`, minWidth: allMembers.length * (compact ? 53 : 65) + 80 }}>

        {/* Header: empty corner + staff names */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-20" style={{ minHeight: 48 }} />
        {allMembers.map((s, i) => {
          // Check if this is the first in a new role group
          const prevRole = i > 0 ? allMembers[i - 1].role : null
          const isNewGroup = s.role !== prevRole
          return (
            <div
              key={s.id}
              className={cn(
                "border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1",
                              )}
              style={colorChips ? { borderTop: `3px solid ${DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8"}` } : { borderTop: "none" }}
            >
              <button
                onClick={() => onChipClick({ staff_id: s.id }, "")}
                className="flex flex-col items-center cursor-pointer hover:opacity-70 transition-opacity"
              >
                <span className={cn("font-medium text-center leading-tight truncate w-full", compact ? "text-[9px]" : "text-[10px]")}>
                  {s.first_name}
                </span>
                <span className={cn("text-muted-foreground text-center truncate w-full", compact ? "text-[8px]" : "text-[9px]")}>
                  {s.last_name[0]}.
                </span>
              </button>
            </div>
          )
        })}

        {/* Day rows */}
        {days.map((day) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).slice(0, 2).toUpperCase()
          const dayN = String(d.getDate())
          const today = day.date === TODAY
          const holiday = publicHolidays[day.date]
          const isSat = d.getDay() === 6

          return (
            <Fragment key={day.date}>
              {/* Day label cell — click opens day view */}
              <div
                className={cn(
                  "border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center justify-end gap-1.5 px-2 cursor-pointer hover:bg-muted/80",
                  holiday && "bg-amber-50/60"
                )}
                style={isSat ? { borderTop: "1px dashed var(--border)" } : undefined}
                onClick={() => onDateClick?.(day.date)}
              >
                {day.warnings?.length > 0 && <AlertTriangle className="size-3 text-amber-500 shrink-0" />}
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-muted-foreground uppercase">{wday}</span>
                  <span className={cn(
                    "font-semibold leading-none",
                    today ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary"
                  )}>
                    {dayN}
                  </span>
                </div>
                {holiday && (
                  <Tooltip>
                    <TooltipTrigger render={<span className="size-4 flex items-center justify-center text-[10px] cursor-default">🏖️</span>} />
                    <TooltipContent side="right">{holiday}</TooltipContent>
                  </Tooltip>
                )}
              </div>

              {/* Staff cells for this day */}
              {allMembers.map((s, i) => {
                const assignment = assignMap[s.id]?.[day.date]
                const onLeave = (onLeaveByDate[day.date] ?? []).includes(s.id)
                const cellShift = assignment ? assignment.shift_type : (onLeave ? "__leave__" : "__off__")
                const isHovered = highlightEnabled && hoveredShift && cellShift === hoveredShift
                const prevRole = i > 0 ? allMembers[i - 1].role : null
                const isNewGroup = s.role !== prevRole

                const isOffCell = !assignment && !onLeave && isPublished
                const isViewerCell = !!swapStaffId && s.id === swapStaffId && !!assignment && isPublished
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "border-b border-r last:border-r-0 border-border flex items-center justify-center transition-colors duration-100",
                      compact ? "min-h-[22px] px-0.5 py-0" : "min-h-[28px] px-0.5 py-0.5",
                      isHovered ? "bg-primary/10" : "bg-background",
                      isViewerCell && "relative group/swap cursor-pointer",
                    )}
                    style={isOffCell ? { backgroundImage: "radial-gradient(circle, rgba(100,130,170,0.18) 1px, transparent 1px)", backgroundSize: "10px 10px" } : undefined}
                    onMouseEnter={() => setHoveredShift(cellShift)}
                    onMouseLeave={() => setHoveredShift(null)}
                    onClick={isViewerCell ? (e) => { e.stopPropagation(); onChipClick(assignment!, day.date) } : undefined}
                    title={isViewerCell ? (locale === "es" ? "Solicitar cambio de turno" : "Request shift swap") : undefined}
                  >
                    {isViewerCell && (
                      <span className="absolute -top-1 -right-1 size-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center opacity-0 group-hover/swap:opacity-100 transition-opacity pointer-events-none z-10">
                        <ArrowRightLeft className="size-2.5" />
                      </span>
                    )}
                    {assignment ? (
                      !isPublished ? (
                        <PersonShiftSelector
                          assignment={assignment}
                          shiftTimes={shiftTimes}
                          shiftTypes={data?.shiftTypes ?? []}
                          isPublished={false}
                          simplified={simplified !== false}
                          onShiftChange={async (newShift) => {
                            if (!newShift) {
                              setLocalDays((prev) => prev.map((dd) => ({ ...dd, assignments: dd.assignments.filter((a) => a.id !== assignment.id) })))
                              const result = await removeAssignment(assignment.id)
                              if (result.error) toast.error(result.error)
                            } else {
                              setLocalDays((prev) => prev.map((dd) => ({ ...dd, assignments: dd.assignments.map((a) => a.id === assignment.id ? { ...a, shift_type: newShift } : a) })))
                              const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                              if (result.error) toast.error(result.error)
                            }
                          }}
                        />
                      ) : simplified !== false ? (
                        <span className={cn("font-semibold tabular-nums", compact ? "text-[10px]" : "text-[12px]")} style={{ color: "var(--pref-bg)" }}>
                          {assignment.shift_type}
                        </span>
                      ) : (
                        <div className="flex flex-col items-center gap-0">
                          <span className={cn("font-semibold tabular-nums", compact ? "text-[10px]" : "text-[12px]")} style={{ color: "var(--pref-bg)" }}>
                            {assignment.shift_type}
                          </span>
                          {shiftTimes?.[assignment.shift_type] && (
                            <span className={cn("text-muted-foreground", compact ? "text-[8px]" : "text-[9px]")}>
                              {shiftTimes[assignment.shift_type].start}–{shiftTimes[assignment.shift_type].end}
                            </span>
                          )}
                        </div>
                      )
                    ) : onLeave ? (
                      <span className={cn("text-muted-foreground italic", compact ? "text-[9px]" : "text-[11px]")}>{t("leaveShort")}</span>
                    ) : !isPublished ? (
                      <PersonShiftSelector
                        assignment={{ id: "", shift_type: "", staff_id: s.id, staff: s as any, is_manual_override: false, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false } as Assignment}
                        shiftTimes={shiftTimes}
                        shiftTypes={data?.shiftTypes ?? []}
                        isPublished={false}
                        simplified={simplified !== false}
                        isOff
                        onShiftChange={async (newShift) => {
                          if (!newShift) return
                          const result = await upsertAssignment({ weekStart: data?.weekStart ?? "", staffId: s.id, date: day.date, shiftType: newShift })
                          if (result.error) toast.error(result.error)
                          else {
                            setLocalDays((prev) => prev.map((dd) => dd.date !== day.date ? dd : {
                              ...dd,
                              assignments: [...dd.assignments, { id: `temp-${Date.now()}`, staff_id: s.id, staff: s as any, shift_type: newShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false }],
                            }))
                          }
                        }}
                      />
                    ) : (
                      <span className={cn("text-muted-foreground font-semibold", compact ? "text-[9px]" : "text-[11px]")}>OFF</span>
                    )}
                  </div>
                )
              })}
            </Fragment>
          )
        })}
      </div>
      {/* Shift legend — shown in simplified mode */}
      {simplified !== false && shiftTimes && Object.keys(shiftTimes).length > 0 && (
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
