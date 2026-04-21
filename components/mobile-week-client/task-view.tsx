"use client"

import { useMemo } from "react"
import { cn } from "@/lib/utils"
import { TapPopover } from "@/components/tap-popover"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import { ROLE_COLOR, ROLE_LABEL, TASK_NAMED_COLORS, contrastColor, dayAbbrFor } from "./constants"

type Tecnica = NonNullable<RotaWeekData["tecnicas"]>[number]
type Assignment = RotaWeekData["days"][number]["assignments"][number]

export function TaskView({
  data, days, today, locale, taskDaysAsRows, gridHdrW,
  highlightEnabled, highlightedStaff, onToggleHighlight,
  mobileDeptColor, deptColorMap, staffColorLookup,
}: {
  data: RotaWeekData
  days: RotaWeekData["days"]
  today: string
  locale: "es" | "en"
  taskDaysAsRows: boolean
  gridHdrW: string
  highlightEnabled: boolean
  highlightedStaff: string | null
  onToggleHighlight: (id: string) => void
  mobileDeptColor: boolean
  deptColorMap: Record<string, string>
  staffColorLookup: Record<string, string>
}) {
  // Hooks first — unconditional to satisfy rules-of-hooks.
  const workingDaysByStaff = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const d of days) for (const a of d.assignments) (m[a.staff_id] ??= new Set()).add(d.date)
    return m
  }, [days])

  if (!data.tecnicas) return null
  const activeTecnicas = data.tecnicas.filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
  const DAY_ABBR = dayAbbrFor(locale)

  function renderStaffChip(a: Assignment) {
    const isHL = highlightEnabled && highlightedStaff === a.staff_id
    const roleColor = deptColorMap[a.staff.role] ?? ROLE_COLOR[a.staff.role] ?? "#94A3B8"
    const hlColor = staffColorLookup[a.staff_id] ?? roleColor
    const working = workingDaysByStaff[a.staff_id]
    const offAbbrs = days
      .filter((d) => !working?.has(d.date))
      .map((d) => DAY_ABBR[new Date(d.date + "T12:00:00").getDay()])
    return (
      <TapPopover key={a.id} trigger={
        <span
          className="text-[11px] font-medium rounded px-1.5 py-1 border cursor-pointer active:scale-95 transition-colors"
          style={isHL
            ? { backgroundColor: hlColor, borderColor: hlColor, color: contrastColor(hlColor) }
            : mobileDeptColor
              ? { borderColor: "var(--border)", backgroundColor: "var(--background)", borderLeft: `3px solid ${roleColor}` }
              : { borderColor: "var(--border)", backgroundColor: "var(--background)" }}
          onClick={() => highlightEnabled && onToggleHighlight(a.staff_id)}
        >
          {a.staff.first_name[0]}{a.staff.last_name[0]}
        </span>
      }>
        <p className="font-medium">{a.staff.first_name} {a.staff.last_name}</p>
        <p className="text-[11px] opacity-70">{ROLE_LABEL[locale]?.[a.staff.role] ?? a.staff.role}{offAbbrs.length > 0 ? ` · Off: ${offAbbrs.join(" ")}` : ""}</p>
      </TapPopover>
    )
  }

  if (taskDaysAsRows) {
    const dayColW = "44px"
    const tecColW = `minmax(44px, 1fr)`
    const colTemplate = `${dayColW} repeat(${activeTecnicas.length}, ${tecColW})`
    return (
      <>
        <div className="sticky top-0 z-10 grid border-b border-border bg-muted" style={{ gridTemplateColumns: colTemplate }}>
          <div className="px-2 py-2 border-r border-border bg-muted sticky left-0 z-[6]" />
          {activeTecnicas.map((tec) => {
            const dotColor = tec.color?.startsWith("#") ? tec.color : (TASK_NAMED_COLORS[tec.color] ?? "#3B82F6")
            return (
              <div key={tec.id} className="px-1 py-1.5 text-center border-r border-border last:border-r-0" style={{ borderBottom: `3px solid ${dotColor}` }}>
                <span className="text-[9px] font-semibold text-foreground block leading-tight">{tec.codigo}</span>
              </div>
            )
          })}
        </div>
        {days.map((day) => {
          const date = new Date(day.date + "T12:00:00")
          const dow = date.getDay()
          const wday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date)
          const num = date.getDate()
          const isToday = day.date === today
          const isWknd = dow === 0 || dow === 6
          const isHoliday = !!data.publicHolidays?.[day.date]
          return (
            <div key={day.date} className="grid border-b border-border" style={{ gridTemplateColumns: colTemplate }}>
              <div className="border-r border-border bg-muted sticky left-0 z-[5] px-1 py-1 flex flex-col items-center justify-center" style={isHoliday ? { backgroundColor: "rgb(254 243 199 / 0.8)" } : undefined}>
                <span className={cn("text-[8px] uppercase leading-none", isToday ? "text-primary font-semibold" : isWknd ? "text-muted-foreground/40" : "text-muted-foreground")}>{wday}</span>
                {isToday
                  ? <span className="inline-flex items-center justify-center size-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold mt-0.5">{num}</span>
                  : <span className={cn("text-[13px] font-semibold leading-none mt-0.5", isWknd ? "text-muted-foreground" : "text-primary")}>{num}</span>
                }
              </div>
              {activeTecnicas.map((tec) => {
                const assignments = day.assignments.filter((a) => a.function_label === tec.codigo || a.tecnica_id === tec.id)
                return (
                  <div key={tec.id} className="px-0.5 py-1 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-0.5 content-start">
                    {assignments.map((a) => renderStaffChip(a))}
                  </div>
                )
              })}
            </div>
          )
        })}
      </>
    )
  }

  return (
    <>
      {activeTecnicas.map((tec: Tecnica) => {
        const dotColor = tec.color?.startsWith("#") ? tec.color : (TASK_NAMED_COLORS[tec.color] ?? "#3B82F6")
        const tecLabel = locale === "en" ? tec.nombre_en : tec.nombre_es
        return (
          <div key={tec.id} className="grid border-b border-border" style={{ gridTemplateColumns: `${gridHdrW} repeat(${days.length}, 1fr)` }}>
            <div className="border-r border-border bg-muted sticky left-0 z-[5] flex items-stretch">
              <div className="w-[3px] shrink-0" style={{ backgroundColor: dotColor }} />
              <div className="px-1 py-1.5 flex flex-col justify-center flex-1 min-w-0">
                <span className="text-[11px] font-semibold text-foreground leading-tight">{tec.codigo}</span>
                <span className="text-[9px] text-muted-foreground truncate leading-tight">{tecLabel}</span>
              </div>
            </div>
            {days.map((day) => {
              const assignments = day.assignments.filter((a) => a.function_label === tec.codigo || a.tecnica_id === tec.id)
              return (
                <div key={day.date} className="px-1 py-2 border-r border-border last:border-r-0 min-w-0 overflow-hidden flex flex-wrap gap-1 content-start">
                  {assignments.map((a) => renderStaffChip(a))}
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
}
