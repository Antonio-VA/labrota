"use client"

import { useState, useCallback, useEffect } from "react"
import dynamic from "next/dynamic"

const ChatPanel = dynamic(
  () => import("@/components/chat-panel").then((m) => m.ChatPanel),
  {
    ssr: false,
    loading: () => (
      <aside className="hidden lg:flex flex-col border-l bg-background shrink-0 overflow-hidden h-full w-10" />
    ),
  }
)

export function LayoutChatWrapper({ children }: { children: React.ReactNode }) {
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
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {children}
      </div>
      <ChatPanel
        collapsed={chatCollapsed}
        onToggleCollapsed={toggleChat}
      />
    </div>
  )
}
