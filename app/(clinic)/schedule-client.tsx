"use client"

import { useState, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"
import { CalendarPanel } from "@/components/calendar-panel"

// Defer AI SDK + chat UI to a separate JS chunk — CalendarPanel hydrates first
const ChatPanel = dynamic(
  () => import("@/components/chat-panel").then((m) => m.ChatPanel),
  {
    ssr: false,
    loading: () => (
      <aside className="hidden lg:flex flex-col border-l bg-background shrink-0 overflow-hidden h-full w-10" />
    ),
  }
)
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
}) {
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  const [chatCollapsed, setChatCollapsed] = useState(true)

  useEffect(() => {
    setChatCollapsed(localStorage.getItem("agentPanelCollapsed") === "true")
  }, [])

  const toggleChat = useCallback(() => {
    setChatCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("agentPanelCollapsed", String(next))
      return next
    })
  }, [])

  return (
    <>
      {/* Desktop: calendar + collapsible AI chat side-by-side */}
      <div className="hidden md:flex flex-1 overflow-hidden">
        <CalendarPanel
          refreshKey={calendarRefreshKey}
          chatOpen={!chatCollapsed}
          initialData={initialData}
          initialStaff={initialStaff}
          hasNotifications={hasNotifications}
          initialNotes={initialNotes}
        />
        <ChatPanel
          onRefresh={() => setCalendarRefreshKey((k) => k + 1)}
          collapsed={chatCollapsed}
          onToggleCollapsed={toggleChat}
        />
      </div>

      {/* Mobile: day view stacked above AI chat */}
      <div className="flex md:hidden flex-col flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <CalendarPanel
            refreshKey={calendarRefreshKey}
            chatOpen={false}
            initialData={initialData}
            initialStaff={initialStaff}
            initialNotes={initialNotes}
          />
        </div>
        <ChatPanel
          onRefresh={() => setCalendarRefreshKey((k) => k + 1)}
        />
      </div>
    </>
  )
}
