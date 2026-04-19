"use client"

import { ShiftBudgetBar, MonthBudgetBar } from "./budget-bars"
import type { RotaDay, RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import type { ViewMode } from "./types"

type MonthSummary = Parameters<typeof MonthBudgetBar>[0]["summary"]

export function CalendarBottomBar({
  view, canEdit, loadingWeek, loadingMonth,
  weekData, monthSummary, filteredStaffList,
  currentDate, weekStart, locale, formatLabel,
  openProfile, liveDays, deptFilter, colorChips,
}: {
  view: ViewMode
  canEdit: boolean
  loadingWeek: boolean
  loadingMonth: boolean
  weekData: RotaWeekData | null
  monthSummary: MonthSummary | null
  filteredStaffList: StaffWithSkills[]
  currentDate: string
  weekStart: string
  locale: string
  formatLabel: (scope: "week" | "month", current: string, weekStart: string, locale: string) => string
  openProfile: (staffId: string) => void
  liveDays: RotaDay[] | null
  deptFilter: Set<string>
  colorChips: boolean
}) {
  return (
    <div className="hidden md:block shrink-0">
      {canEdit && view === "week" && !weekData && loadingWeek && (
        <div className="shrink-0 h-12 bg-background border-t border-border flex items-center px-4 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={i === 0 ? "h-3 w-20 rounded bg-muted animate-pulse" : "h-5 w-14 rounded bg-muted animate-pulse"} />
          ))}
        </div>
      )}
      {canEdit && view === "week" && weekData && (
        <ShiftBudgetBar
          data={weekData}
          staffList={filteredStaffList}
          weekLabel={formatLabel("week", currentDate, weekStart, locale)}
          onPillClick={openProfile}
          liveDays={weekData.rotaDisplayMode === "by_task" ? null : liveDays}
          deptFilter={deptFilter}
          colorChips={colorChips}
        />
      )}
      {canEdit && view === "month" && monthSummary && !loadingMonth && (
        <MonthBudgetBar
          summary={monthSummary}
          monthLabel={formatLabel("month", currentDate, weekStart, locale)}
          onPillClick={openProfile}
        />
      )}
    </div>
  )
}
