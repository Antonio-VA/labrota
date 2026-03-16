"use client";

import { AppSidebar } from "@/components/app-sidebar";
import { CalendarPanel } from "@/components/calendar-panel";
import { ChatPanel } from "@/components/chat-panel";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export default function Home() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex flex-col h-screen overflow-hidden">
        {/* Header */}
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <span className="text-sm font-medium text-muted-foreground">Schedule</span>
        </header>

        {/* Main content: calendar + chat */}
        <div className="flex flex-1 overflow-hidden">
          <CalendarPanel />
          <ChatPanel />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
