"use client"

import type { RotaWeekData, RotaMonthSummary, RotaDay } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { ShiftBudgetBar, MonthBudgetBar } from "./budget-bars"
import { formatToolbarLabel } from "./utils"

export function BottomTaskbar({
  view, canEdit, weekData, monthSummary, loadingWeek, loadingMonth,
  filteredStaffList, currentDate, weekStart, locale,
  liveDays, deptFilter, colorChips, onPillClick,
}: {
  view: "week" | "month"
  canEdit: boolean
  weekData: RotaWeekData | null
  monthSummary: RotaMonthSummary | null
  loadingWeek: boolean
  loadingMonth: boolean
  filteredStaffList: StaffWithSkills[]
  currentDate: string
  weekStart: string
  locale: string
  liveDays: RotaDay[] | null
  deptFilter: Set<string>
  colorChips: boolean
  onPillClick: (staffId: string) => void
}) {
  if (!canEdit) return null

  return (
    <div className="hidden md:block shrink-0">
      {view === "week" && !weekData && loadingWeek && (
        <div className="shrink-0 h-12 bg-background border-t border-border flex items-center px-4 gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={i === 0 ? "h-3 w-20 rounded bg-muted animate-pulse" : "h-5 w-14 rounded bg-muted animate-pulse"} />
          ))}
        </div>
      )}
      {view === "week" && weekData && (
        <ShiftBudgetBar
          data={weekData}
          staffList={filteredStaffList}
          weekLabel={formatToolbarLabel("week", currentDate, weekStart, locale)}
          onPillClick={onPillClick}
          liveDays={weekData.rotaDisplayMode === "by_task" ? null : liveDays}
          deptFilter={deptFilter}
          colorChips={colorChips}
        />
      )}
      {view === "month" && monthSummary && !loadingMonth && (
        <MonthBudgetBar
          summary={monthSummary}
          monthLabel={formatToolbarLabel("month", currentDate, weekStart, locale)}
          onPillClick={onPillClick}
        />
      )}
    </div>
  )
}
