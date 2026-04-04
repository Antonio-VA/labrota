"use client"

import { useMemo, useState, Fragment } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useStaffHover } from "@/components/staff-hover-context"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"

const ROLE_ORDER: Record<string, number> = { lab: 0, andrology: 1, admin: 2 }
const ROLE_BORDER: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }
const COLOR_HEX: Record<string, string> = {
  blue: "#60A5FA", green: "#34D399", amber: "#FBBF24", purple: "#A78BFA",
  coral: "#F87171", teal: "#2DD4BF", slate: "#94A3B8", red: "#EF4444",
}
const TECNICA_PILL: Record<string, string> = {
  amber: "bg-amber-500/10 border-amber-500/30 text-amber-700",
  blue: "bg-blue-500/10 border-blue-500/30 text-blue-700",
  green: "bg-green-500/10 border-green-500/30 text-green-700",
  purple: "bg-purple-500/10 border-purple-500/30 text-purple-700",
  coral: "bg-red-500/10 border-red-500/30 text-red-700",
  teal: "bg-teal-500/10 border-teal-500/30 text-teal-700",
  slate: "bg-muted border-border text-muted-foreground",
  red: "bg-red-500/10 border-red-500/30 text-red-700",
}

function resolveColor(c: string): string {
  if (c.startsWith("#")) return c
  return COLOR_HEX[c] ?? "#94A3B8"
}

interface TaskPersonGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  publicHolidays: Record<string, string>
  onLeaveByDate: Record<string, string[]>
  compact?: boolean
  colorChips?: boolean
  loading?: boolean
  onChipClick?: (staff_id: string) => void
  onDateClick?: (date: string) => void
}

export function TaskPersonGrid({
  data, staffList, locale, isPublished, publicHolidays, onLeaveByDate,
  compact, colorChips = true, loading, onChipClick, onDateClick,
}: TaskPersonGridProps) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")

  // Loading skeleton — staff as rows, days as columns
  if (loading) {
    const skelStaff = 8
    const skelGridCols = `80px repeat(${skelStaff}, minmax(${compact ? "48px" : "60px"}, 1fr))`
    return (
      <div className="flex flex-col flex-1 min-h-0 gap-3">
        <div className="rounded-lg border border-border overflow-auto w-full">
          <div style={{ display: "grid", gridTemplateColumns: skelGridCols, minWidth: skelStaff * (compact ? 53 : 65) + 80 }}>
            {/* Header: corner + staff name shimmers */}
            <div className="border-b border-r border-border bg-muted" style={{ minHeight: 48 }} />
            {Array.from({ length: skelStaff }).map((_, i) => (
              <div key={i} className="border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1 gap-1">
                <div className="shimmer-bar h-2.5 w-10" />
                <div className="shimmer-bar h-2 w-4" />
              </div>
            ))}

            {/* Day rows */}
            {Array.from({ length: 7 }).map((_, row) => (
              <Fragment key={row}>
                <div className="border-b border-r border-border bg-muted sticky left-0 z-10 flex items-center justify-end gap-1.5 px-2">
                  <div className="shimmer-bar h-2.5 w-5" />
                  <div className="shimmer-bar w-5 h-5 rounded-full" />
                </div>
                {Array.from({ length: skelStaff }).map((_, col) => (
                  <div key={col} className={`border-b border-r last:border-r-0 border-border flex items-center justify-center ${compact ? "min-h-[28px] px-0.5 py-0.5" : "min-h-[36px] px-1 py-1"} ${row >= 5 ? "opacity-50" : ""}`}>
                    <div className="shimmer-bar h-4 w-full rounded" />
                  </div>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center py-1">
          <span className="generating-label text-[13px] text-muted-foreground">
            {tc("loading")}
          </span>
        </div>
      </div>
    )
  }
  const { hoveredStaffId, setHovered } = useStaffHover()
  const [hoveredTecnica, setHoveredTecnica] = useState<string | null>(null)

  const localDays = data?.days ?? []
  const tecnicas = useMemo(() => (data?.tecnicas ?? []).filter((t) => t.activa).sort((a, b) => a.orden - b.orden), [data?.tecnicas])
  const tecByCode = useMemo(() => Object.fromEntries(tecnicas.map((t) => [t.codigo, t])), [tecnicas])
  const today = new Date().toISOString().split("T")[0]

  // Sort staff by role then name
  const activeStaff = useMemo(() =>
    staffList
      .filter((s) => s.onboarding_status !== "inactive")
      .sort((a, b) => {
        const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
        return ro !== 0 ? ro : a.first_name.localeCompare(b.first_name) || a.last_name.localeCompare(b.last_name)
      })
  , [staffList])

  // Build assignment map: staffId → date → function_label[]
  const assignMap = useMemo(() => {
    const m: Record<string, Record<string, string[]>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!m[a.staff_id]) m[a.staff_id] = {}
        if (!m[a.staff_id][day.date]) m[a.staff_id][day.date] = []
        if (a.function_label) m[a.staff_id][day.date].push(a.function_label)
      }
    }
    return m
  }, [localDays])

  // Also build a shift map: staffId → date → shift_type
  const shiftMap = useMemo(() => {
    const m: Record<string, Record<string, string>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!m[a.staff_id]) m[a.staff_id] = {}
        if (!m[a.staff_id][day.date]) m[a.staff_id][day.date] = a.shift_type
      }
    }
    return m
  }, [localDays])

  // Staff color map
  const staffColorMap = useMemo(() =>
    Object.fromEntries(activeStaff.map((s) => [s.id, s.color ? resolveColor(s.color) : (ROLE_BORDER[s.role] ?? "#94A3B8")]))
  , [activeStaff])

  // Department label map
  const deptLabels = useMemo(() => {
    const m: Record<string, string> = {}
    for (const d of (data?.departments ?? [])) { if (!d.parent_id) m[d.code] = d.name }
    return m
  }, [data?.departments])

  // Group staff by role
  const roleGroups = useMemo(() => {
    const groups: { role: string; members: StaffWithSkills[] }[] = []
    for (const s of activeStaff) {
      const last = groups[groups.length - 1]
      if (last && last.role === s.role) last.members.push(s)
      else groups.push({ role: s.role, members: [s] })
    }
    return groups
  }, [activeStaff])

  if (!data || localDays.length === 0) return null

  const gridCols = `80px repeat(${activeStaff.length}, minmax(${compact ? "48px" : "60px"}, 1fr))`

  return (
    <div className="rounded-lg border border-border overflow-auto w-full">
      <div style={{ display: "grid", gridTemplateColumns: gridCols, minWidth: activeStaff.length * (compact ? 53 : 65) + 80 }}>

        {/* Header: corner + staff names */}
        <div className="border-b border-r border-border bg-muted sticky left-0 z-20" style={{ minHeight: 48 }} />
        {activeStaff.map((s) => {
          const sColor = staffColorMap[s.id]
          const isHov = hoveredStaffId === s.id
          return (
            <div
              key={s.id}
              className={cn(
                "border-b border-r last:border-r-0 border-border bg-muted flex flex-col items-center justify-center py-1.5 px-1 transition-colors duration-100",
                isHov && "bg-blue-50"
              )}
              style={colorChips ? { borderTop: `3px solid ${sColor}` } : { borderTop: "none" }}
              onMouseEnter={() => setHovered(s.id)}
              onMouseLeave={() => setHovered(null)}
            >
              <button
                onClick={() => onChipClick?.(s.id)}
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
        {localDays.map((day) => {
          const d = new Date(day.date + "T12:00:00")
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d).slice(0, 2).toUpperCase()
          const dayN = String(d.getDate())
          const isToday = day.date === today
          const holiday = publicHolidays[day.date]
          const isSat = d.getDay() === 6
          const leaveIds = new Set(onLeaveByDate[day.date] ?? [])

          return (
            <Fragment key={day.date}>
              {/* Day label */}
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
                    isToday ? "size-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-[11px]" : "text-[14px] text-primary"
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

              {/* Staff cells */}
              {activeStaff.map((s) => {
                const tasks = assignMap[s.id]?.[day.date] ?? []
                const shift = shiftMap[s.id]?.[day.date]
                const onLeave = leaveIds.has(s.id)
                const isHov = hoveredStaffId === s.id
                const sColor = staffColorMap[s.id]

                return (
                  <div
                    key={s.id}
                    className={cn(
                      "border-b border-r last:border-r-0 border-border flex flex-col items-center justify-center gap-0.5 transition-colors duration-100",
                      compact ? "min-h-[28px] px-0.5 py-0.5" : "min-h-[36px] px-1 py-1",
                      isHov ? "bg-blue-50" : "bg-background",
                      isSat && "border-t border-dashed"
                    )}
                    onMouseEnter={() => setHovered(s.id)}
                    onMouseLeave={() => setHovered(null)}
                  >
                    {onLeave ? (
                      <div className={cn("flex items-center gap-0.5", compact ? "text-[8px]" : "text-[9px]")}>
                        <Briefcase className="size-2.5 text-amber-500 shrink-0" />
                        <span className="text-amber-600 italic">{t("leaveShort")}</span>
                      </div>
                    ) : tasks.length > 0 ? (
                      <>
                        {shift && (
                          <span className={cn("text-muted-foreground font-medium tabular-nums", compact ? "text-[8px]" : "text-[9px]")}>
                            {shift}
                          </span>
                        )}
                        <div className="flex flex-wrap justify-center gap-0.5">
                          {tasks.map((code) => {
                            const tec = tecByCode[code]
                            const pillClass = tec ? TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue : "bg-muted border-border text-muted-foreground"
                            const isHighlighted = hoveredTecnica === code
                            return (
                              <span
                                key={code}
                                className={cn(
                                  "font-semibold rounded border shrink-0",
                                  compact ? "text-[7px] px-0.5 py-0" : "text-[8px] px-1 py-0",
                                  pillClass,
                                  isHighlighted && "ring-1 ring-primary/40"
                                )}
                                onMouseEnter={() => setHoveredTecnica(code)}
                                onMouseLeave={() => setHoveredTecnica(null)}
                              >
                                {code}
                              </span>
                            )
                          })}
                        </div>
                      </>
                    ) : shift ? (
                      <span className={cn("text-muted-foreground font-medium tabular-nums", compact ? "text-[9px]" : "text-[11px]")}>
                        {shift}
                      </span>
                    ) : (
                      <span className={cn("text-muted-foreground/40 font-semibold", compact ? "text-[8px]" : "text-[10px]")}>—</span>
                    )}
                  </div>
                )
              })}
            </Fragment>
          )
        })}
      </div>

      {/* Técnica legend */}
      {tecnicas.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 border-t border-border bg-muted/50">
          {tecnicas.map((tec) => {
            const pillClass = TECNICA_PILL[tec.color] ?? TECNICA_PILL.blue
            return (
              <span
                key={tec.id}
                className={cn("inline-flex items-center gap-1 text-[11px]", hoveredTecnica === tec.codigo && "opacity-100 font-semibold")}
                onMouseEnter={() => setHoveredTecnica(tec.codigo)}
                onMouseLeave={() => setHoveredTecnica(null)}
              >
                <span className={cn("font-bold px-1 rounded border text-[9px]", pillClass)}>{tec.codigo}</span>
                <span className="text-muted-foreground">{tec.nombre_es}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
