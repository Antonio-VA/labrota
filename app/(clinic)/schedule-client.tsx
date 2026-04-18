"use client"

import { useState, useEffect } from "react"
import { CalendarPanel } from "@/components/calendar-panel"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import type { WeekNoteData } from "@/app/(clinic)/notes-actions"

export function ScheduleClient({
  initialData,
  initialStaff,
  hasNotifications = false,
  initialNotes,
}: {
  initialData?: RotaWeekData
  initialStaff?: StaffWithSkills[]
  hasNotifications?: boolean
  initialNotes?: WeekNoteData
} = {}) {
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)

  // Listen for AI agent refresh events (from ProposalCard in layout-level ChatPanel)
  useEffect(() => {
    function onRefresh() {
      setCalendarRefreshKey((k) => k + 1)
    }
    window.addEventListener("labrota:refresh", onRefresh)
    return () => window.removeEventListener("labrota:refresh", onRefresh)
  }, [])

  return (
    <CalendarPanel
      refreshKey={calendarRefreshKey}
      initialData={initialData}
      initialStaff={initialStaff}
      hasNotifications={hasNotifications}
      initialNotes={initialNotes}
    />
  )
}
