"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { formatTime } from "@/lib/format-time"
import { TapPopover } from "@/components/tap-popover"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftTypeDefinition } from "@/lib/types/database"
import { ROLE_ORDER } from "@/components/assignment-sheet/constants"
import { ROLE_COLOR, ROLE_LABEL } from "./constants"

export function PersonView({
  staffList, days, shiftTypeMap, shiftTypes, gridHdrW,
  highlightEnabled, highlightedStaff, onToggleHighlight,
  mobileDeptColor, deptColorMap, staffColorLookup,
  locale, timeFormat,
}: {
  staffList: StaffWithSkills[]
  days: RotaWeekData["days"]
  shiftTypeMap: Record<string, ShiftTypeDefinition>
  shiftTypes: ShiftTypeDefinition[]
  gridHdrW: string
  highlightEnabled: boolean
  highlightedStaff: string | null
  onToggleHighlight: (id: string) => void
  mobileDeptColor: boolean
  deptColorMap: Record<string, string>
  staffColorLookup: Record<string, string>
  locale: "es" | "en"
  timeFormat: string
}) {
  const t = useTranslations("schedule")

  const visibleStaff = staffList
    .filter((s) => days.some((d) => d.assignments.some((a) => a.staff_id === s.id)))
    .sort((a, b) => {
      const ro = (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9)
      if (ro !== 0) return ro
      return a.first_name.localeCompare(b.first_name)
    })

  return (
    <>
      {visibleStaff.map((s) => {
        const isHL = highlightEnabled && highlightedStaff === s.id
        const roleColor = deptColorMap[s.role] ?? ROLE_COLOR[s.role] ?? "#94A3B8"
        const hlColor = staffColorLookup[s.id] ?? roleColor
        return (
          <div key={s.id} className="grid border-b border-border" style={{ gridTemplateColumns: `${gridHdrW} repeat(${days.length}, 1fr)` }}>
            <div
              className="border-r border-border bg-muted sticky left-0 z-[5] flex items-center pl-1.5 pr-1 py-1.5 gap-1 cursor-pointer min-w-0"
              style={mobileDeptColor ? { borderLeft: `3px solid ${roleColor}` } : undefined}
              onClick={() => highlightEnabled && onToggleHighlight(s.id)}
            >
              <p className="text-[10px] font-semibold text-foreground truncate leading-tight min-w-0">{s.first_name} {s.last_name[0]}.</p>
            </div>
            {days.map((day) => {
              const a = day.assignments.find((x) => x.staff_id === s.id)
              const st = a ? shiftTypeMap[a.shift_type] : null
              return (
                <div key={day.date} className="px-0.5 py-1 border-r border-border last:border-r-0 flex flex-col items-center justify-center min-w-0">
                  {a && st ? (
                    <TapPopover trigger={
                      <div
                        className="w-full text-center cursor-pointer active:opacity-70"
                        style={isHL ? { color: hlColor, fontWeight: 700 } : undefined}
                      >
                        <span className="text-[11px] font-semibold leading-tight">{a.shift_type}</span>
                      </div>
                    }>
                      <p className="font-medium">{s.first_name} {s.last_name}</p>
                      <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[s.role] ?? s.role}</p>
                      <p className="text-[11px] opacity-70">{a.shift_type} · {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}</p>
                    </TapPopover>
                  ) : (
                    <span className="text-[10px] font-medium text-muted-foreground/40">{t("offShort")}</span>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}
      {shiftTypes.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-3 py-2.5 border-b border-border bg-muted/30">
          {shiftTypes.map((st) => (
            <span key={st.code} className="text-[11px] text-muted-foreground">
              <span className="font-medium text-foreground">{st.code}</span> {formatTime(st.start_time, timeFormat)}–{formatTime(st.end_time, timeFormat)}
            </span>
          ))}
        </div>
      )}
    </>
  )
}
