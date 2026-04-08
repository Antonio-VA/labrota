"use client"

import { useState, useCallback, useEffect, Component, type ReactNode } from "react"
import dynamic from "next/dynamic"
import { useCanEdit } from "@/lib/role-context"

const ChatPanel = dynamic(
  () => import("@/components/chat-panel").then((m) => m.ChatPanel),
  { ssr: false }
)

class ChatErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed bottom-6 right-6 z-30 hidden lg:flex">
          <button
            onClick={() => this.setState({ hasError: false })}
            className="size-14 rounded-full shadow-lg bg-destructive text-destructive-foreground flex items-center justify-center text-[10px] font-medium"
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

export function LayoutChatWrapper({ children }: { children: React.ReactNode }) {
  const canEdit = useCanEdit()
  const [chatOpen, setChatOpen] = useState(false)

  const toggleChat = useCallback(() => {
    setChatOpen((prev) => !prev)
  }, [])

  // Listen for mobile nav AI tab trigger
  useEffect(() => {
    if (!canEdit) return
    function onToggle() { setChatOpen((prev) => !prev) }
    window.addEventListener("labrota:toggle-chat", onToggle)
    return () => window.removeEventListener("labrota:toggle-chat", onToggle)
  }, [canEdit])

  return (
    <>
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {children}
      </div>
      {canEdit && (
        <ChatErrorBoundary>
          <ChatPanel
            open={chatOpen}
            onToggle={toggleChat}
          />
        </ChatErrorBoundary>
      )}
    </>
  )
}
