"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Plane, Cross, User, GraduationCap, Baby, CalendarX } from "lucide-react"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import type { StaffWithSkills } from "@/lib/types/database"
import type { RotaWeekData, RotaDay, RotaMonthSummary } from "@/app/(clinic)/rota/actions"
import { useStaffHover } from "@/components/staff-hover-context"
import { DEFAULT_DEPT_MAPS, ROLE_LABEL } from "./constants"
import { buildDeptMaps } from "./utils"

// Leave type → icon map (used in ShiftBudgetBar and PersonGrid)
export const LEAVE_ICON_MAP: Record<string, typeof Plane> = { annual: Plane, sick: Cross, personal: User, training: GraduationCap, maternity: Baby, other: CalendarX }

// ── Shift budget bar ───────────────────────────────────────────────────────────

export function ShiftBudgetBar({ data, staffList, weekLabel, onPillClick, liveDays, deptFilter, colorChips = true }: {
  data: RotaWeekData; staffList: StaffWithSkills[]; weekLabel: string; onPillClick?: (staffId: string) => void
  liveDays?: RotaDay[] | null; deptFilter?: Set<string>; colorChips?: boolean
}) {
  const t = useTranslations("schedule")
  const ROLE_LABEL_LOCAL = buildDeptMaps(data.departments ?? []).label
  const containerRef = useRef<HTMLDivElement>(null)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  const [overflowOpen, setOverflowOpen] = useState(false)
  const overflowRef = useRef<HTMLDivElement>(null)

  const days = liveDays ?? data.days
  const isByTask = data.rotaDisplayMode === "by_task"
  const isGuardiaMode = data.daysOffPreference === "guardia"
  const staffMap: Record<string, { first: string; last: string; role: string; count: number; guardiaCount: number; daysPerWeek: number; leaveDays: number; leaveType: string | null }> = {}
  const staffDaySeen: Record<string, Set<string>> = {} // staff_id → set of dates (for by_task dedup)

  // Count leave days per staff — only within the current view's dates to avoid over-counting
  // long leaves that extend beyond this week
  const weekDateSet = new Set(days.map((d) => d.date))
  const leaveDaysPerStaff: Record<string, number> = {}
  const leaveTypePerStaff: Record<string, string> = {}
  if (data.onLeaveByDate) {
    for (const date in data.onLeaveByDate) {
      if (!weekDateSet.has(date)) continue // only count days actually in this view
      for (const staffId of data.onLeaveByDate[date]) {
        leaveDaysPerStaff[staffId] = (leaveDaysPerStaff[staffId] ?? 0) + 1
        // Capture first leave type seen for this staff member
        if (!leaveTypePerStaff[staffId] && data.onLeaveTypeByDate?.[date]?.[staffId]) {
          leaveTypePerStaff[staffId] = data.onLeaveTypeByDate[date][staffId]
        }
      }
    }
  }

  // Seed all active staff so 0-assignment members appear too
  for (const s of staffList) {
    if (deptFilter && !deptFilter.has(s.role)) continue
    const leaveDays = leaveDaysPerStaff[s.id] ?? 0
    staffMap[s.id] = {
      first: s.first_name, last: s.last_name, role: s.role,
      count: 0, guardiaCount: 0, daysPerWeek: Math.min(Math.max(0, days.length - leaveDays), s.days_per_week ?? 5),
      leaveDays, leaveType: leaveTypePerStaff[s.id] ?? null,
    }
    staffDaySeen[s.id] = new Set()
  }

  for (const day of days) {
    const dow = new Date(day.date + "T12:00:00").getDay()
    const isWeekend = dow === 0 || dow === 6
    for (const a of day.assignments) {
      if (deptFilter && !deptFilter.has(a.staff.role)) continue
      // In by_task mode, only count assignments that have a function_label (task assignments)
      if (isByTask && !a.function_label) continue
      // Skip assignments from inactive/deactivated staff not in active list
      if (!staffMap[a.staff_id]) continue
      if (isByTask) {
        // Count unique days, not individual task assignments
        if (!staffDaySeen[a.staff_id].has(day.date)) {
          staffDaySeen[a.staff_id].add(day.date)
          if (isGuardiaMode && isWeekend) staffMap[a.staff_id].guardiaCount++
          else staffMap[a.staff_id].count++
        }
      } else {
        if (isGuardiaMode && isWeekend) staffMap[a.staff_id].guardiaCount++
        else staffMap[a.staff_id].count++
      }
    }
  }

  const entries = Object.entries(staffMap).sort((a, b) =>
    a[1].first.localeCompare(b[1].first) || a[1].last.localeCompare(b[1].last)
  )

  // Measure overflow after render
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const items = el.querySelectorAll<HTMLElement>("[data-pill]")
    if (items.length === 0) { setVisibleCount(null); return }
    const containerRight = el.getBoundingClientRect().right
    let count = 0
    for (const item of items) {
      if (item.getBoundingClientRect().right <= containerRight - 80) count++
      else break
    }
    setVisibleCount(count < items.length ? count : null)
  }, [entries.length])

  // Close overflow on outside click
  useEffect(() => {
    if (!overflowOpen) return
    function handler(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) setOverflowOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [overflowOpen])

  const { hoveredStaffId, setHovered } = useStaffHover()
  // Staff → department colour for pills
  const staffColorLookup = useMemo(() => {
    const deptColors: Record<string, string> = {}
    for (const dept of (data.departments ?? [])) deptColors[dept.code] = dept.colour
    return Object.fromEntries(staffList.map((s) => [s.id, s.color || deptColors[s.role] || DEFAULT_DEPT_MAPS.border[s.role] || "#94A3B8"]))
  }, [data.departments, staffList])

  if (entries.length === 0) return null

  const shown    = visibleCount !== null ? entries.slice(0, visibleCount) : entries
  const overflow = visibleCount !== null ? entries.slice(visibleCount) : []

  function renderPill(id: string, s: { first: string; last: string; role: string; count: number; guardiaCount: number; daysPerWeek: number; leaveDays: number; leaveType: string | null }) {
    const hasLeave = s.leaveDays > 0
    const over  = s.count > s.daysPerWeek
    const under = s.count < s.daysPerWeek
    const color = s.count === 0 && s.guardiaCount === 0 ? "text-muted-foreground" : over ? "text-red-600" : under ? "text-amber-600" : "text-muted-foreground"
    const isHov = hoveredStaffId === id
    const staffColor = staffColorLookup[id]
    const LeaveIcon = hasLeave ? (LEAVE_ICON_MAP[s.leaveType ?? "other"] ?? LEAVE_ICON_MAP.other) : null
    return (
      <Tooltip key={id}>
        <TooltipTrigger render={
          <button
            data-pill
            onClick={() => onPillClick?.(id)}
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            className={cn("px-1.5 py-0.5 rounded text-[12px] transition-colors duration-150 cursor-pointer hover:bg-accent flex items-center gap-1", color)}
            style={isHov && staffColor ? { backgroundColor: staffColor, color: "#1e293b" } : undefined}
          >
            {colorChips && staffColor && <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: isHov ? "#1e293b" : staffColor }} />}
            <span className="font-medium">{s.first[0]}{s.last[0]}</span>
            {" "}<span className="font-normal tabular-nums">{s.count}/{s.daysPerWeek}</span>
            {s.guardiaCount > 0 && (
              <span className="font-normal tabular-nums text-violet-600">+{s.guardiaCount}G</span>
            )}
            {LeaveIcon && <LeaveIcon className="size-2.5 shrink-0 text-amber-500" />}
          </button>
        } />
        <TooltipContent side="top">
          {s.first} {s.last} · {ROLE_LABEL_LOCAL[s.role] ?? s.role} · {s.count}/{s.daysPerWeek} {t("shifts")}{s.guardiaCount > 0 ? ` +${s.guardiaCount} guardia` : ""}{hasLeave ? ` · ${s.leaveDays}d baja` : ""}
        </TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div
      className="shrink-0 h-12 bg-background border-t border-border flex items-center px-4 gap-1"
    >
      {/* Left: label + pills */}
      <span className="text-[12px] text-muted-foreground font-medium shrink-0 mr-1">{t("shiftBudget")}:</span>
      <div ref={containerRef} className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
        {shown.map(([id, s], i) => (
          <Fragment key={id}>
            {i > 0 && <span className="text-muted-foreground/40 text-[10px] select-none">·</span>}
            {renderPill(id, s)}
          </Fragment>
        ))}
      </div>
      {overflow.length > 0 && (
        <div ref={overflowRef} className="relative shrink-0">
          <button
            onClick={() => setOverflowOpen((o) => !o)}
            className="text-[11px] text-blue-600 font-medium hover:underline cursor-pointer ml-1"
          >
            {t("moreStaff", { count: overflow.length })}
          </button>
          {overflowOpen && (
            <div className="absolute bottom-full right-0 mb-2 z-50 w-60 rounded-lg border border-border bg-background shadow-lg py-2 px-1">
              <div className="flex flex-wrap gap-0.5">
                {overflow.map(([id, s]) => renderPill(id, s))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function MonthBudgetBar({ summary, monthLabel, onPillClick }: {
  summary: RotaMonthSummary; monthLabel: string; onPillClick?: (staffId: string) => void
}) {
  const t = useTranslations("schedule")
  const entries = Object.entries(summary.staffTotals).sort((a, b) => {
    return a[1].first.localeCompare(b[1].first) || a[1].last.localeCompare(b[1].last)
  })

  if (entries.length === 0) return null

  // Monthly expected: days_per_week × actual weeks in grid
  const weeksInMonth = summary.days.length / 7

  return (
    <div
      className="shrink-0 h-12 bg-background border-t border-border flex items-center px-4 gap-1"
    >
      <span className="text-[12px] text-muted-foreground font-medium shrink-0 mr-1">{t("shiftBudget")}:</span>
      <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
        {entries.map(([id, s], i) => {
          const expected = Math.round(s.daysPerWeek * weeksInMonth)
          const over = s.count > expected
          const color = s.count === 0 ? "text-muted-foreground" : over ? "text-amber-600" : "text-muted-foreground"
          return (
            <Fragment key={id}>
              {i > 0 && <span className="text-muted-foreground/40 text-[10px] select-none">·</span>}
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => onPillClick?.(id)}
                    className={cn("px-1.5 py-0.5 rounded text-[12px] transition-colors cursor-pointer hover:bg-accent", color)}
                  >
                    <span className="font-medium">{s.first[0]}{s.last[0]}</span>{" "}
                    <span className="font-normal tabular-nums">{s.count}/{expected}</span>
                  </button>
                } />
                <TooltipContent side="top">
                  {s.first} {s.last} · {ROLE_LABEL[s.role] ?? s.role} · {s.count}/{expected} {t("shiftsPerMonth")}
                </TooltipContent>
              </Tooltip>
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
