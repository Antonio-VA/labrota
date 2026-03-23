"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { CalendarPanel } from "@/components/calendar-panel"
import { ChatPanel } from "@/components/chat-panel"
import { MobileBottomNav, type MobileTab } from "@/components/mobile-bottom-nav"

export default function SchedulePage() {
  const [mobileTab, setMobileTab]           = useState<MobileTab>("schedule")
  const [calendarRefreshKey, setCalendarRefreshKey] = useState(0)
  const [chatCollapsed, setChatCollapsed]   = useState(true)
  const tnav   = useTranslations("nav")
  const tagent = useTranslations("agent")

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
      {/* Mobile header — desktop top bar handles this on md+ */}
      <header className="flex md:hidden h-12 shrink-0 items-center justify-center border-b px-4">
        <span className="text-[14px] font-medium">
          {mobileTab === "chat" ? tagent("title") : tnav("schedule")}
        </span>
      </header>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        <div className={`flex flex-1 overflow-hidden ${mobileTab === "chat" ? "hidden md:flex" : "flex"}`}>
          <CalendarPanel refreshKey={calendarRefreshKey} chatOpen={!chatCollapsed} />
        </div>
        <div className={`${mobileTab === "chat" ? "flex flex-1" : "hidden"} md:flex`}>
          <ChatPanel
            onRefresh={() => setCalendarRefreshKey((k) => k + 1)}
            collapsed={chatCollapsed}
            onToggleCollapsed={toggleChat}
          />
        </div>
      </div>

      <MobileBottomNav activeTab={mobileTab} onTabChange={setMobileTab} />
    </>
  )
}
