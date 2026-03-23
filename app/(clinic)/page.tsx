"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { CalendarPanel } from "@/components/calendar-panel"
import { ChatPanel } from "@/components/chat-panel"

export default function SchedulePage() {
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  const [chatCollapsed, setChatCollapsed]   = useState(true)
  const tnav   = useTranslations("nav")

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
        <CalendarPanel refreshKey={calendarRefreshKey} chatOpen={!chatCollapsed} />
        <ChatPanel
          onRefresh={() => setCalendarRefreshKey((k) => k + 1)}
          collapsed={chatCollapsed}
          onToggleCollapsed={toggleChat}
        />
      </div>

      {/* Mobile: day view stacked above AI chat */}
      <div className="flex md:hidden flex-col flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <CalendarPanel refreshKey={calendarRefreshKey} chatOpen={false} />
        </div>
        <ChatPanel
          onRefresh={() => setCalendarRefreshKey((k) => k + 1)}
        />
      </div>
    </>
  )
}
