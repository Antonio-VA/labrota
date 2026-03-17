"use client"

import { useState } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { CalendarPanel } from "@/components/calendar-panel"
import { ChatPanel } from "@/components/chat-panel"
import { MobileBottomNav, type MobileTab } from "@/components/mobile-bottom-nav"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"

export default function Home() {
  const [mobileTab, setMobileTab] = useState<MobileTab>("schedule")

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden">

        {/* Desktop header */}
        <header className="hidden md:flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-[14px] font-medium text-muted-foreground">Schedule</span>
        </header>

        {/* Mobile header */}
        <header className="flex md:hidden h-12 shrink-0 items-center justify-center border-b px-4">
          <span className="text-[14px] font-medium">
            {mobileTab === "chat" ? "AI Assistant" : "Schedule"}
          </span>
        </header>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Calendar — visible on desktop always; on mobile only when schedule tab active */}
          <div className={`flex flex-1 overflow-hidden ${mobileTab === "chat" ? "hidden md:flex" : "flex"}`}>
            <CalendarPanel />
          </div>

          {/* Chat — w-80 side panel on desktop; full-screen on mobile when chat tab active */}
          <div className={`${mobileTab === "chat" ? "flex flex-1" : "hidden"} md:flex md:w-80 md:shrink-0 md:flex-none`}>
            <ChatPanel />
          </div>
        </div>

        {/* Mobile bottom nav — hidden on desktop */}
        <MobileBottomNav activeTab={mobileTab} onTabChange={setMobileTab} />
      </SidebarInset>
    </SidebarProvider>
  )
}
