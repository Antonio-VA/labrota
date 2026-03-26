"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { AlertTriangle, Briefcase } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"
import type { RotaWeekData, RotaDay, ShiftTimes } from "@/app/(clinic)/rota/actions"

const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
const ROLE_BORDER: Record<string, string> = { lab: "#3B82F6", andrology: "#10B981", admin: "#64748B" }

interface TransposedShiftGridProps {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  locale: string
  isPublished: boolean
  shiftTimes: ShiftTimes | null
  publicHolidays: Record<string, string>
  onLeaveByDate: Record<string, string[]>
  compact?: boolean
  colorChips?: boolean
  timeFormat?: string
  onCellClick?: (date: string, shiftType: ShiftType) => void
}

export function TransposedShiftGrid({
  data, staffList, locale, isPublished, shiftTimes, publicHolidays, onLeaveByDate,
  compact, colorChips = true, timeFormat = "24h", onCellClick,
}: TransposedShiftGridProps) {
  const t = useTranslations("schedule")
  const tc = useTranslations("common")

  const localDays = data?.days ?? []
  const shiftTypes = data?.shiftTypes ?? []
  const shiftCodes = shiftTypes.filter((s) => s.active !== false).map((s) => s.code)
  const shiftTypeMap = Object.fromEntries(shiftTypes.map((s) => [s.code, s]))

  // Visible staff IDs
  const visibleStaffIds = useMemo(() => new Set(staffList.map((s) => s.id)), [staffList])

  const today = new Date().toISOString().split("T")[0]

  if (!data || localDays.length === 0) return null

  const colCount = shiftCodes.length + 1 // shifts + OFF column
  const gridCols = `100px repeat(${shiftCodes.length}, 1fr) minmax(80px, 1fr)`

  return (
    <div className="overflow-auto flex-1">
      <div className="min-w-[600px]" style={{ display: "grid", gridTemplateColumns: gridCols }}>
        {/* Header row: corner + shift columns + OFF */}
        <div className="sticky top-0 z-10 border-b border-r border-border bg-muted px-2 py-2" />
        {shiftCodes.map((code) => {
          const st = shiftTypeMap[code]
          return (
            <div key={code} className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-center">
              <p className="text-[11px] font-semibold text-foreground">{code}</p>
              {st && (
                <p className="text-[10px] text-muted-foreground tabular-nums">
                  {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}
                </p>
              )}
            </div>
          )
        })}
        <div className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-center">
          <p className="text-[11px] font-semibold text-muted-foreground">OFF</p>
        </div>

        {/* Day rows */}
        {localDays.map((day) => {
          const dow = new Date(day.date + "T12:00:00").getDay()
          const dayKey = DOW_KEYS[dow]
          const dayNum = new Date(day.date + "T12:00:00").getDate()
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(day.date + "T12:00:00"))
          const isToday = day.date === today
          const isSat = dow === 6
          const holiday = publicHolidays[day.date]
          const leaveIds = new Set(onLeaveByDate[day.date] ?? [])
          const offStaff = staffList.filter((s) => !day.assignments.some((a) => a.staff_id === s.id) && !leaveIds.has(s.id) && visibleStaffIds.has(s.id))

          return (
            <>
              {/* Row header: day name + date */}
              <div
                key={`header-${day.date}`}
                className={cn(
                  "border-b border-r border-border px-2 py-2 flex flex-col justify-center bg-muted/50",
                  isSat && "border-t border-dashed",
                  isToday && "bg-primary/5"
                )}
              >
                <div className="flex items-center gap-1">
                  <span className={cn(
                    "text-[10px] uppercase tracking-wider text-muted-foreground",
                    isToday && "text-primary font-semibold"
                  )}>
                    {wday}
                  </span>
                  <span className={cn(
                    "text-[15px] font-semibold",
                    isToday ? "text-primary" : "text-foreground"
                  )}>
                    {dayNum}
                  </span>
                  {day.warnings.length > 0 && (
                    <AlertTriangle className="size-3 text-amber-500 shrink-0" />
                  )}
                </div>
                {holiday && (
                  <span className="text-[9px] text-amber-600 truncate leading-tight">{holiday}</span>
                )}
              </div>

              {/* Shift cells */}
              {shiftCodes.map((code) => {
                const st = shiftTypeMap[code]
                const activeDays = st?.active_days ?? [...DOW_KEYS]
                const isActive = activeDays.includes(dayKey)
                const dayShifts = day.assignments
                  .filter((a) => a.shift_type === code && visibleStaffIds.has(a.staff_id))
                  .sort((a, b) => a.staff.first_name.localeCompare(b.staff.first_name))

                return (
                  <div
                    key={`${day.date}-${code}`}
                    className={cn(
                      "border-b border-border p-1 flex flex-col gap-0.5",
                      isSat && "border-t border-dashed",
                      !isActive && "bg-muted/30",
                      isActive && !isPublished && "cursor-pointer hover:bg-accent/10"
                    )}
                    onClick={() => isActive && !isPublished && onCellClick?.(day.date, code)}
                  >
                    {!isActive ? (
                      <span className="text-[9px] text-muted-foreground/40 italic self-center mt-auto mb-auto">{t("noService")}</span>
                    ) : dayShifts.length > 0 ? (
                      dayShifts.map((a) => (
                        <div
                          key={a.id}
                          className={cn(
                            "flex items-center gap-1 rounded border border-border px-1.5 bg-background text-foreground",
                            compact ? "py-0 text-[10px] min-h-[20px]" : "py-0.5 text-[11px] min-h-[24px]"
                          )}
                          style={{ borderLeft: `3px solid ${ROLE_BORDER[a.staff.role] ?? "#94A3B8"}`, borderRadius: 4 }}
                        >
                          <span className="truncate">{a.staff.first_name} {a.staff.last_name[0]}.</span>
                          {a.function_label && (
                            <span className="text-[8px] font-semibold px-0.5 rounded border border-primary/20 text-primary ml-auto shrink-0">
                              {a.function_label}
                            </span>
                          )}
                        </div>
                      ))
                    ) : null}
                  </div>
                )
              })}

              {/* OFF column */}
              <div
                key={`${day.date}-off`}
                className={cn(
                  "border-b border-border p-1 flex flex-col gap-0.5 bg-muted/20",
                  isSat && "border-t border-dashed"
                )}
              >
                {/* On leave */}
                {[...leaveIds].map((sid) => {
                  const s = staffList.find((st) => st.id === sid)
                  if (!s) return null
                  return (
                    <div
                      key={sid}
                      className={cn(
                        "flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-1.5",
                        compact ? "py-0 text-[10px]" : "py-0.5 text-[11px]"
                      )}
                    >
                      <Briefcase className="size-2.5 text-amber-500 shrink-0" />
                      <span className="truncate text-amber-700">{s.first_name} {s.last_name[0]}.</span>
                    </div>
                  )
                })}
                {/* Off duty */}
                {offStaff.slice(0, compact ? 3 : 5).map((s) => (
                  <div
                    key={s.id}
                    className={cn(
                      "flex items-center gap-1 rounded border border-border/50 px-1.5 text-muted-foreground",
                      compact ? "py-0 text-[10px]" : "py-0.5 text-[11px]"
                    )}
                  >
                    <span className="truncate">{s.first_name} {s.last_name[0]}.</span>
                  </div>
                ))}
                {offStaff.length > (compact ? 3 : 5) && (
                  <span className="text-[9px] text-muted-foreground/50 self-center">+{offStaff.length - (compact ? 3 : 5)}</span>
                )}
              </div>
            </>
          )
        })}
      </div>
    </div>
  )
}
