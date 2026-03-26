"use client"

import { useTranslations } from "next-intl"
import { X, AlertTriangle, Plane } from "lucide-react"
import { cn } from "@/lib/utils"
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

interface MobileTaskDayViewProps {
  day: RotaDay | null
  tecnicas: Tecnica[]
  departments: Department[]
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  isEditMode?: boolean
  onRemoveAssignment?: (id: string) => void
  loading: boolean
  locale: string
}

export function MobileTaskDayView({
  day, tecnicas, departments, data, staffList, isEditMode, onRemoveAssignment, loading, locale,
}: MobileTaskDayViewProps) {
  const t = useTranslations("schedule")

  if (loading) {
    return (
      <div className="flex flex-col gap-4 max-w-lg mx-auto w-full">
        <Skeleton className="h-5 w-48" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
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

      {/* Task rows */}
      {activeTecnicas.map((tec) => {
        const assignments = byTecnica[tec.codigo] ?? []
        const dotColor = TECNICA_DOT[tec.color] ?? TECNICA_DOT.blue

        return (
          <div key={tec.id} className="flex flex-col gap-1.5">
            {/* Task header */}
            <div className="flex items-center gap-2 pl-2" style={{ borderLeft: `3px solid ${dotColor}` }}>
              <span className="text-[13px] font-semibold" style={{ color: dotColor }}>{tec.codigo}</span>
              <span className="text-[13px] text-muted-foreground">{tec.nombre_es}</span>
              <span className="text-[11px] text-muted-foreground ml-auto">{assignments.length}</span>
            </div>

            {/* Assigned staff */}
            {assignments.length > 0 ? (
              <div className="flex flex-col gap-1">
                {assignments.map((a) => {
                  const roleColor = ROLE_COLOR[a.staff.role] ?? "#64748B"
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border bg-background"
                    >
                      {isEditMode && onRemoveAssignment && (
                        <button
                          onClick={() => onRemoveAssignment(a.id)}
                          className="size-5 flex items-center justify-center rounded-full bg-destructive/10 text-destructive shrink-0 active:bg-destructive/20"
                        >
                          <span className="text-[12px] font-bold leading-none">−</span>
                        </button>
                      )}
                      <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium">{a.staff.first_name} {a.staff.last_name}</p>
                      </div>
                      <span className="text-[11px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                        {a.shift_type}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-[12px] text-muted-foreground/50 italic pl-4">{t("noService")}</p>
            )}
          </div>
        )
      })}

      {/* Unassigned to any task */}
      {unassigned.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 pl-2 border-l-[3px] border-muted-foreground/30">
            <span className="text-[13px] font-medium text-muted-foreground">{t("noTaskAssigned")}</span>
            <span className="text-[11px] text-muted-foreground/60 ml-auto">{unassigned.length}</span>
          </div>
          <div className="flex flex-col gap-1">
            {unassigned.map((a) => {
              const roleColor = ROLE_COLOR[a.staff.role] ?? "#64748B"
              return (
                <div key={a.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border/50 bg-muted/20">
                  <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: roleColor }} />
                  <p className="text-[14px] text-muted-foreground">{a.staff.first_name} {a.staff.last_name}</p>
                  <span className="text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0 ml-auto">
                    {a.shift_type}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* OFF section */}
      {(onLeave.length > 0 || offDuty.length > 0) && (
        <div className="flex flex-col gap-1.5 mt-2 pt-3 border-t border-dashed border-border">
          <div className="flex items-center gap-2 pl-2">
            <span className="text-[13px] font-medium text-muted-foreground">{t("offSection")}</span>
            <span className="text-[12px] text-muted-foreground/60">{onLeave.length + offDuty.length}</span>
          </div>
          <div className="flex flex-col gap-1">
            {onLeave.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50">
                <Plane className="size-3 text-amber-500 shrink-0" />
                <span className="text-[13px] text-amber-700 italic">{s.first_name} {s.last_name}</span>
              </div>
            ))}
            {offDuty.map((s) => (
              <div key={s.id} className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground">
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: ROLE_COLOR[s.role] ?? "#64748B" }} />
                <span className="text-[13px]">{s.first_name} {s.last_name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
