"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { CalendarPanel } from "@/components/calendar-panel"
import { ChatPanel } from "@/components/chat-panel"
import { MobileBottomNav, type MobileTab } from "@/components/mobile-bottom-nav"

export default function SchedulePage() {
  const [mobileTab, setMobileTab] = useState<MobileTab>("schedule")
  const tnav   = useTranslations("nav")
  const tagent = useTranslations("agent")

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
          <CalendarPanel />
        </div>
        <div className={`${mobileTab === "chat" ? "flex flex-1" : "hidden"} md:flex`}>
          <ChatPanel />
        </div>
      </div>

      <MobileBottomNav activeTab={mobileTab} onTabChange={setMobileTab} />
    </>
  )
}
