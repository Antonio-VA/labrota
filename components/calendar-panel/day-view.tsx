"use client"

import { useMemo, Fragment } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, CalendarDays, CalendarX, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { useStaffHover } from "@/components/staff-hover-context"
import { TapPopover } from "@/components/tap-popover"
import { LEAVE_ICON_MAP } from "./budget-bars"
import type { Assignment } from "./types"
import { ROLE_ORDER, DEFAULT_DEPT_MAPS } from "./constants"
import type { RotaWeekData, RotaDay } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"

export function DayView({ day, loading, locale, departments = [], punctions, biopsyForecast, isEditMode, onRemoveAssignment, onAddStaff, data, staffList, mobileCompact, mobileDeptColor = true, ratioOptimal, ratioMinimum }: {
  day: RotaDay | null
  loading: boolean
  locale: string
  departments?: import("@/lib/types/database").Department[]
  punctions?: number
  biopsyForecast?: number
  isEditMode?: boolean
  onRemoveAssignment?: (id: string) => void
  onAddStaff?: (role: string) => void
  data?: RotaWeekData | null
  staffList?: StaffWithSkills[]
  mobileCompact?: boolean
  mobileDeptColor?: boolean
  ratioOptimal?: number
  ratioMinimum?: number
}) {
  const t  = useTranslations("schedule")
  const tc = useTranslations("common")
  const ts = useTranslations("skills")

  // Build dept color map: role code → colour
  const { hoveredStaffId, setHovered } = useStaffHover()
  const { deptColorMap, deptLabelMap } = useMemo(() => {
    const colors: Record<string, string> = {}
    const labels: Record<string, string> = {}
    for (const d of departments) {
      if (!d.parent_id) { colors[d.code] = d.colour; labels[d.code] = d.name }
    }
    return { deptColorMap: colors, deptLabelMap: labels }
  }, [departments])
  // Staff → department colour map
  const staffColorMap = useMemo(() => {
    const m: Record<string, string> = {}
    ;(staffList ?? []).forEach((s) => { m[s.id] = deptColorMap[s.role] ?? DEFAULT_DEPT_MAPS.border[s.role] ?? "#94A3B8" })
    return m
  }, [staffList, deptColorMap])
  const deptByCode = useMemo(() => Object.fromEntries((departments ?? []).map((d) => [d.code, d])), [departments])
  const tecByCode = useMemo(() => Object.fromEntries((data?.tecnicas ?? []).map((t) => [t.codigo, t])), [data?.tecnicas])

  if (loading) {
    return (
      <div className="flex flex-col gap-4 w-full animate-pulse">
        <Skeleton className="h-5 w-40 rounded-md" />
        {[4, 5, 3, 4].map((count, g) => (
          <div key={g} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-28 rounded" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: count }).map((_, i) => (
                <Skeleton key={i} className="h-8 rounded-md" style={{ width: [72, 85, 68, 90, 76][i % 5] }} />
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!day || day.assignments.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title={t("noRota")}
        description={t("noRotaDescription")}
      />
    )
  }

  const byRole: Record<string, typeof day.assignments> = { lab: [], andrology: [], admin: [] }
  for (const a of day.assignments) {
    byRole[a.staff.role]?.push(a)
  }

  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">

      {(day.skillGaps.length > 0) && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">{t("insufficientCoverage")}</p>
            <div className="flex flex-wrap gap-1 mt-1">
              {day.skillGaps.map((sk) => (
                <Badge key={sk} variant="skill-gap">
                  {sk}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      )}

      {(() => {
        // Group by shift type instead of department
        const shiftTypes = data?.shiftTypes ?? []
        const byShift: Record<string, typeof day.assignments> = {}
        for (const a of day.assignments) {
          if (!byShift[a.shift_type]) byShift[a.shift_type] = []
          byShift[a.shift_type].push(a)
        }
        const shiftOrder = shiftTypes.filter((s) => s.active !== false).map((s) => s.code)
        const allShifts = [...new Set([...shiftOrder, ...Object.keys(byShift)])]

        function resolveFunctionLabel(label: string): string {
          const dept = deptByCode[label]
          if (dept) return dept.abbreviation || dept.name
          const tec = tecByCode[label]
          if (tec) return tec.nombre_es
          return label
        }

        return allShifts.map((shiftCode, shiftIdx) => {
          const assignments = byShift[shiftCode] ?? []
          const st = shiftTypes.find((s) => s.code === shiftCode)
          const timeLabel = st ? `${st.start_time}–${st.end_time}` : ""
          return (
            <Fragment key={shiftCode}>
            {shiftIdx > 0 && <div className="h-px bg-border/50 my-1" />}
            <div key={shiftCode} className="flex flex-col gap-1.5">
              {/* Shift header */}
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold">{shiftCode}</span>
                {timeLabel && <span className="text-[12px] text-muted-foreground">{timeLabel}</span>}
                <span className="text-[11px] text-muted-foreground ml-auto">{assignments.length}</span>
              </div>
              <div className="flex flex-col gap-1">
                {assignments.length === 0 && !isEditMode && (
                  <div className="h-6 rounded bg-muted/40" />
                )}
                {mobileCompact ? (
                  /* Compact: inline badges with left border, sorted by dept then name */
                  <div className="flex flex-wrap gap-1">
                    {[...assignments].sort((a, b) => {
                      const ro: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
                      const rd = (ro[a.staff.role] ?? 9) - (ro[b.staff.role] ?? 9)
                      return rd !== 0 ? rd : a.staff.first_name.localeCompare(b.staff.first_name)
                    }).map((a) => {
                      const roleColor = deptColorMap[a.staff.role] ?? (a.staff.role === "lab" ? "#3B82F6" : a.staff.role === "andrology" ? "#10B981" : "#64748B")
                      const fnLabel = a.function_label ? resolveFunctionLabel(a.function_label) : null
                      const staffMember = staffList?.find((s) => s.id === a.staff_id)
                      const deptName = deptLabelMap[a.staff.role] ?? a.staff.role
                      const workDays = staffMember?.working_pattern ?? []
                      const dayLabels = { mon: "L", tue: "M", wed: "X", thu: "J", fri: "V", sat: "S", sun: "D" } as Record<string, string>
                      const pillContent = (
                        <span
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border bg-background text-[13px] font-medium cursor-pointer transition-colors active:scale-95"
                          style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 6 }}
                        >
                          {a.staff.first_name} {a.staff.last_name[0]}.
                          {fnLabel && <span className="text-[9px] text-muted-foreground">{fnLabel}</span>}
                          {isEditMode && onRemoveAssignment && (
                            <button onClick={(e) => { e.stopPropagation(); onRemoveAssignment(a.id) }} className="text-muted-foreground hover:text-destructive ml-0.5"><X className="size-3" /></button>
                          )}
                        </span>
                      )
                      return isEditMode ? (
                        <Fragment key={a.id}>{pillContent}</Fragment>
                      ) : (
                        <TapPopover key={a.id} trigger={pillContent}>
                          <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                          {(() => {
                            const weekDays = data?.days ?? []
                            const workedDays = weekDays.filter((d) => d.assignments.some((as) => as.staff_id === a.staff_id))
                            const offDays = weekDays.filter((d) => !d.assignments.some((as) => as.staff_id === a.staff_id))
                            const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                            const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                            return <p className="text-[11px] opacity-70">{deptName} · {workedDays.length}/{staffMember?.days_per_week ?? "?"}d{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                          })()}
                        </TapPopover>
                      )
                    })}
                  </div>
                ) : [...assignments].sort((a, b) => {
                  const ro: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
                  const rd = (ro[a.staff.role] ?? 9) - (ro[b.staff.role] ?? 9)
                  return rd !== 0 ? rd : a.staff.first_name.localeCompare(b.staff.first_name)
                }).map((a) => {
                  const roleColor = deptColorMap[a.staff.role] ?? (a.staff.role === "lab" ? "#3B82F6" : a.staff.role === "andrology" ? "#10B981" : "#64748B")
                  const fnLabel = a.function_label ? resolveFunctionLabel(a.function_label) : null
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border border-border bg-background"
                      style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 8 }}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-1.5">
                        <span className="text-[15px] font-medium truncate">{a.staff.first_name} {a.staff.last_name}</span>
                        {fnLabel && (
                          <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded shrink-0">{fnLabel}</span>
                        )}
                      </div>
                      {isEditMode && onRemoveAssignment && (
                        <button
                          onClick={() => onRemoveAssignment(a.id)}
                          className="size-6 flex items-center justify-center rounded-full text-muted-foreground hover:text-destructive active:bg-destructive/10 shrink-0"
                        >
                          <X className="size-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
                {isEditMode && onAddStaff && (
                  <button
                    onClick={() => onAddStaff(assignments[0]?.staff.role ?? "lab")}
                    className="flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-primary/30 text-[12px] text-primary font-medium active:bg-primary/5"
                  >
                    + {tc("add")}
                  </button>
                )}
              </div>
            </div>
          </Fragment>
          )
        })
      })()}

      {/* OFF section — staff not assigned today */}
      {day && staffList && staffList.length > 0 && (() => {
        const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
        const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
        const leaveIds = new Set(data?.onLeaveByDate?.[day.date] ?? [])
        const onLeave = staffList.filter((s) => leaveIds.has(s.id))
          .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.first_name.localeCompare(b.first_name))
        const offDuty = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id))
          .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9) || a.first_name.localeCompare(b.first_name))
        if (onLeave.length === 0 && offDuty.length === 0) return null
        return (
          <div className="flex flex-col gap-1.5 mt-2 pt-3 pb-2 px-2 -mx-2 border-t border-dashed border-border bg-muted/30 rounded-lg">
            <div className="flex items-center gap-2 pl-2">
              <span className="text-[13px] font-medium text-muted-foreground">{t("offSection")}</span>
              <span className="text-[12px] text-muted-foreground/60">{onLeave.length + offDuty.length}</span>
            </div>
            {mobileCompact ? (
              <div className="flex flex-wrap gap-1">
                {onLeave.map((s) => {
                  const isHov = hoveredStaffId === s.id
                  const sColor = staffColorMap[s.id] ?? "#BFDBFE"
                  const leaveType = day ? (data?.onLeaveTypeByDate?.[day.date]?.[s.id] ?? "other") : "other"
                  const LeaveIcon = LEAVE_ICON_MAP[leaveType] ?? CalendarX
                  return (
                    <TapPopover key={s.id} trigger={
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-[12px] italic cursor-pointer active:scale-95">
                        <LeaveIcon className="size-2.5 shrink-0" />
                        {s.first_name} {s.last_name[0]}.
                      </span>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d</p>
                    </TapPopover>
                  )
                })}
                {offDuty.map((s) => {
                  const roleColor = deptColorMap[s.role] ?? "#64748B"
                  const isHov = hoveredStaffId === s.id
                  const sColor = staffColorMap[s.id] ?? "#BFDBFE"
                  return (
                    <TapPopover key={s.id} trigger={
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-background text-muted-foreground text-[12px] cursor-pointer active:scale-95"
                        style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 6 }}>
                        {s.first_name} {s.last_name[0]}.
                      </span>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      {(() => {
                        const weekDays = data?.days ?? []
                        const offDays = weekDays.filter((d) => !d.assignments.some((a) => a.staff_id === s.id))
                        const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                        const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                        return <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                      })()}
                    </TapPopover>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                {onLeave.map((s) => {
                  const leaveType = day ? (data?.onLeaveTypeByDate?.[day.date]?.[s.id] ?? "other") : "other"
                  const LeaveIcon = LEAVE_ICON_MAP[leaveType] ?? CalendarX
                  return (
                    <TapPopover key={s.id} trigger={
                      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 cursor-pointer">
                        <LeaveIcon className="size-3 text-amber-500 shrink-0" />
                        <span className="text-[13px] text-amber-700 italic">{s.first_name} {s.last_name}</span>
                      </div>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d</p>
                    </TapPopover>
                  )
                })}
                {offDuty.map((s) => {
                  const roleColor = deptColorMap[s.role] ?? "#64748B"
                  return (
                    <TapPopover key={s.id} trigger={
                      <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border/50 bg-background text-muted-foreground cursor-pointer" style={{ ...(mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : {}), borderRadius: 8 }}>
                        <span className="text-[13px]">{s.first_name} {s.last_name}</span>
                      </div>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      {(() => {
                        const weekDays = data?.days ?? []
                        const offDays = weekDays.filter((d) => !d.assignments.some((a) => a.staff_id === s.id))
                        const DAY_ABBR = locale === "en" ? ["Su","Mo","Tu","We","Th","Fr","Sa"] : ["Do","Lu","Ma","Mi","Ju","Vi","Sa"]
                        const offAbbrs = offDays.map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
                        return <p className="text-[11px] opacity-70">{deptLabelMap[s.role] ?? s.role} · {s.days_per_week}d{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
                      })()}
                    </TapPopover>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
}
