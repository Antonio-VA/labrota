"use client"

import { Fragment } from "react"
import { useTranslations } from "next-intl"
import { useLocale } from "next-intl"
import { X, AlertTriangle, Plane, Cross, User, GraduationCap, Baby, CalendarX } from "lucide-react"
import { cn } from "@/lib/utils"
import { TapPopover } from "@/components/tap-popover"
import { useStaffHover } from "@/components/staff-hover-context"
import { Skeleton } from "@/components/ui/skeleton"
import { EmptyState } from "@/components/ui/empty-state"
import { CalendarDays } from "lucide-react"
import type { Tecnica, StaffWithSkills, Department } from "@/lib/types/database"
import type { RotaDay, RotaWeekData } from "@/app/(clinic)/rota/actions"

const TECNICA_DOT: Record<string, string> = {
  amber: "#F59E0B", blue: "#3B82F6", green: "#10B981",
  purple: "#8B5CF6", coral: "#EF4444", teal: "#14B8A6",
  slate: "#64748B", red: "#EF4444",
}

const ROLE_COLOR: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }
const LEAVE_ICON: Record<string, typeof Plane> = { annual: Plane, sick: Cross, personal: User, training: GraduationCap, maternity: Baby, other: CalendarX }

interface MobileTaskDayViewProps {
  day: RotaDay | null
  tecnicas: Tecnica[]
  departments: Department[]
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  isEditMode?: boolean
  onRemoveAssignment?: (id: string) => void
  onAddToTask?: (tecnicaCode: string) => void
  loading: boolean
  locale: string
}

export function MobileTaskDayView({
  day, tecnicas, departments, data, staffList, isEditMode, onRemoveAssignment, onAddToTask, loading, locale,
}: MobileTaskDayViewProps) {
  const t = useTranslations("schedule")
  const { hoveredStaffId, setHovered } = useStaffHover()

  // Build staff color map (individual staff colors with fallbacks)
  const FALLBACK_COLORS = [
    "#BFDBFE", "#BBF7D0", "#FECACA", "#FDE68A", "#DDD6FE", "#FBCFE8",
    "#A7F3D0", "#FED7AA", "#C7D2FE", "#FECDD3", "#BAE6FD", "#D9F99D",
  ]
  const staffColorMap: Record<string, string> = {}
  staffList.forEach((s, i) => { staffColorMap[s.id] = s.color || FALLBACK_COLORS[i % FALLBACK_COLORS.length] })

  if (loading) {
    return (
      <div className="flex flex-col gap-4 max-w-lg mx-auto w-full animate-pulse">
        <Skeleton className="h-5 w-40 rounded-md" />
        {Array.from({ length: 5 }).map((_, g) => (
          <div key={g} className="flex flex-col gap-2">
            <Skeleton className="h-5 w-28 rounded" />
            <div className="flex flex-wrap gap-1.5">
              {Array.from({ length: 3 + g % 2 }).map((_, i) => (
                <Skeleton key={i} className="h-8 rounded-md" style={{ width: [65, 78, 60, 82][i % 4] }} />
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

  const activeTecnicas = tecnicas.filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)

  // Group assignments by técnica
  const byTecnica: Record<string, typeof day.assignments> = {}
  const unassigned: typeof day.assignments = []
  for (const a of day.assignments) {
    const code = a.function_label
    if (code) {
      if (!byTecnica[code]) byTecnica[code] = []
      byTecnica[code].push(a)
    } else {
      unassigned.push(a)
    }
  }

  // Skill gaps
  const skillGaps = day.skillGaps ?? []

  // OFF section
  const assignedIds = new Set(day.assignments.map((a) => a.staff_id))
  const leaveIds = new Set(data?.onLeaveByDate?.[day.date] ?? [])
  const onLeave = staffList.filter((s) => leaveIds.has(s.id))
  const offDuty = staffList.filter((s) => !assignedIds.has(s.id) && !leaveIds.has(s.id))

  return (
    <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">
      {/* Warnings */}
      {skillGaps.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-[12px] font-medium text-amber-600">{t("insufficientCoverage")}</p>
            <p className="text-[11px] text-amber-600/70 mt-0.5">{skillGaps.join(", ")}</p>
          </div>
        </div>
      )}

      {/* Task rows with separators */}
      {activeTecnicas.map((tec, tecIdx) => {
        const assignments = byTecnica[tec.codigo] ?? []
        const dotColor = tec.color?.startsWith("#") ? tec.color : (TECNICA_DOT[tec.color] ?? "#3B82F6")

        return (
          <Fragment key={tec.id}>
            {tecIdx > 0 && <div className="h-px bg-border/50" />}
            <div className="py-1.5">
              {/* Task code + staff badges all on one line */}
              <div className="flex items-center gap-1.5 flex-wrap pl-2.5" style={{ borderLeft: `3px solid ${dotColor}` }}>
                <TapPopover trigger={<span className="text-[13px] font-semibold shrink-0 cursor-pointer active:opacity-70">{tec.codigo}</span>}>
                  {tec.nombre_es}
                </TapPopover>
                {[...assignments].sort((a, b) => {
                  const ro: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
                  const rd = (ro[a.staff.role] ?? 9) - (ro[b.staff.role] ?? 9)
                  return rd !== 0 ? rd : a.staff.first_name.localeCompare(b.staff.first_name)
                }).map((a) => {
                  const roleColor = ROLE_COLOR[a.staff.role] ?? "#64748B"
                  const deptName = a.staff.role === "lab" ? "Embryology" : a.staff.role === "andrology" ? "Andrology" : "Admin"
                  const isHov = hoveredStaffId === a.staff_id
                  const staffMember = staffList.find((s) => s.id === a.staff_id)
                  const sColor = staffColorMap[a.staff_id] ?? "#BFDBFE"
                  const pillContent = (
                    <span
                      className={cn("inline-flex items-center gap-1 px-2 py-1 rounded border text-[12px] font-medium cursor-pointer active:scale-95 transition-colors", isHov ? "" : "border-border bg-background")}
                      style={isHov ? { backgroundColor: sColor, borderColor: sColor, color: "#1e293b" } : undefined}
                      onClick={(e) => { e.stopPropagation(); setHovered(hoveredStaffId === a.staff_id ? null : a.staff_id) }}
                    >
                      {a.staff.first_name} {a.staff.last_name[0]}.
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
                        const dayAbbrs = workedDays.map((d) => {
                          const dow = new Date(d.date + "T12:00:00").getDay()
                          return (["D", "L", "M", "X", "J", "V", "S"])[dow]
                        })
                        return <p className="text-[11px] opacity-70">{deptName} · {workedDays.length}/{staffMember?.days_per_week ?? "?"}d · {dayAbbrs.join(" ")}</p>
                      })()}
                    </TapPopover>
                  )
                })}
                {assignments.length === 0 && !isEditMode && (
                  <span className="text-[12px] text-muted-foreground/40 italic">—</span>
                )}
                {isEditMode && onAddToTask && (
                  <button
                    onClick={() => onAddToTask(tec.codigo)}
                    className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-md border border-dashed border-primary/30 text-primary text-[12px] font-medium active:bg-primary/10"
                  >+ {locale === "es" ? "Añadir" : "Add"}</button>
                )}
              </div>
            </div>
          </Fragment>
        )
      })}

      {/* Unassigned to any task */}
      {unassigned.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 pl-2 border-l-[3px] border-muted-foreground/30">
            <span className="text-[13px] font-medium text-muted-foreground">{t("noTaskAssigned")}</span>
            <span className="text-[11px] text-muted-foreground/60 ml-auto">{unassigned.length}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {[...unassigned].sort((a, b) => {
              const ro: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
              const rd = (ro[a.staff.role] ?? 9) - (ro[b.staff.role] ?? 9)
              return rd !== 0 ? rd : a.staff.first_name.localeCompare(b.staff.first_name)
            }).map((a) => {
              const roleColor = ROLE_COLOR[a.staff.role] ?? "#64748B"
              const isHov = hoveredStaffId === a.staff_id
              const sColor = staffColorMap[a.staff_id] ?? "#BFDBFE"
              return (
                <span
                  key={a.id}
                  className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] cursor-pointer active:scale-95 transition-colors", isHov ? "" : "border-border bg-background text-muted-foreground")}
                  style={{ ...(isHov ? { backgroundColor: sColor, borderColor: sColor, color: "#1e293b" } : { borderLeft: `3px solid ${roleColor}` }), borderRadius: 6 }}
                  onClick={() => setHovered(hoveredStaffId === a.staff_id ? null : a.staff_id)}
                >
                  {a.staff.first_name} {a.staff.last_name[0]}.
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* OFF section */}
      {(onLeave.length > 0 || offDuty.length > 0) && (
        <div className="flex flex-col gap-1.5 mt-2 pt-3 pb-2 px-2 -mx-2 border-t border-dashed border-border bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2 pl-2">
            <span className="text-[13px] font-medium text-muted-foreground">{t("offSection")}</span>
            <span className="text-[12px] text-muted-foreground/60">{onLeave.length + offDuty.length}</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {onLeave.map((s) => {
              const isHov = hoveredStaffId === s.id
              const sColor = staffColorMap[s.id] ?? "#BFDBFE"
              const leaveType = day ? (data?.onLeaveTypeByDate?.[day.date]?.[s.id] ?? "other") : "other"
              const LeaveIcon = LEAVE_ICON[leaveType] ?? CalendarX
              return (
                <span
                  key={s.id}
                  className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] italic cursor-pointer active:scale-95 transition-colors", isHov ? "" : "border-amber-200 bg-amber-50 text-amber-700")}
                  style={isHov ? { backgroundColor: sColor, borderColor: sColor, color: "#1e293b" } : undefined}
                  onClick={() => setHovered(hoveredStaffId === s.id ? null : s.id)}
                >
                  <LeaveIcon className="size-2.5 shrink-0" />
                  {s.first_name} {s.last_name[0]}.
                </span>
              )
            })}
            {offDuty.sort((a, b) => {
              const ro: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
              return (ro[a.role] ?? 9) - (ro[b.role] ?? 9) || a.first_name.localeCompare(b.first_name)
            }).map((s) => {
              const roleColor = ROLE_COLOR[s.role] ?? "#64748B"
              const isHov = hoveredStaffId === s.id
              const sColor = staffColorMap[s.id] ?? "#BFDBFE"
              return (
                <span
                  key={s.id}
                  className={cn("inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] cursor-pointer active:scale-95 transition-colors", isHov ? "" : "border-border bg-background text-muted-foreground")}
                  style={{ ...(isHov ? { backgroundColor: sColor, borderColor: sColor, color: "#1e293b" } : { borderLeft: `3px solid ${roleColor}` }), borderRadius: 6 }}
                  onClick={() => setHovered(hoveredStaffId === s.id ? null : s.id)}
                >
                  {s.first_name} {s.last_name[0]}.
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
