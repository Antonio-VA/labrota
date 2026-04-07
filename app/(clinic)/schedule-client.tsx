"use client"

import { useState, useCallback, useEffect } from "react"
import { useRouter } from "next/navigation"
import { CalendarPanel } from "@/components/calendar-panel"
import { useCanEdit, useViewerStaffId } from "@/lib/role-context"
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
  const canEdit = useCanEdit()
  const viewerStaffId = useViewerStaffId()
  const router = useRouter()

  // Non-editor mobile users → redirect to My Rota as their default view
  useEffect(() => {
    if (!canEdit && viewerStaffId && window.innerWidth < 768) {
      router.replace("/my-rota")
    }
  }, [canEdit, viewerStaffId, router])

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
