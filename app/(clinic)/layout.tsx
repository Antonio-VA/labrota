"use client"

import { AppSidebar } from "@/components/app-sidebar"
import { ClinicTopBar } from "@/components/clinic-top-bar"

export default function ClinicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-muted">
      <ClinicTopBar />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
