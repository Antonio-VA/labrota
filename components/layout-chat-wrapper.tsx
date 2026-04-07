"use client"

import { useState, useCallback, useEffect, Component, type ReactNode } from "react"
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

class ChatErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <aside className="hidden lg:flex flex-col border-l bg-background shrink-0 overflow-hidden h-full w-80 items-center justify-center p-4">
          <p className="text-[14px] text-muted-foreground text-center">AI chat encountered an error.</p>
          <button onClick={() => this.setState({ hasError: false })} className="text-[13px] text-primary mt-2 hover:underline">Retry</button>
        </aside>
      )
    }
    return this.props.children
  }
}

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
      <ChatErrorBoundary>
        <ChatPanel
          collapsed={chatCollapsed}
          onToggleCollapsed={toggleChat}
        />
      </ChatErrorBoundary>
    </div>
  )
}
