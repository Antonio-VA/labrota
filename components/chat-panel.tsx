"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SendHorizonal, Bot } from "lucide-react";
import { useRef, useEffect, useState } from "react";

const transport = new DefaultChatTransport({ api: "/api/chat" });

export function ChatPanel() {
  const { messages, sendMessage, status } = useChat({ transport });
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  }

  return (
    <aside className="flex w-full md:w-80 md:shrink-0 flex-col border-l">
      {/* Chat header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Bot className="size-4 text-primary" />
        <span className="text-sm font-medium">AI Assistant</span>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="flex flex-col gap-3 py-4">
          {messages.length === 0 && (
            <p className="text-center text-xs text-muted-foreground pt-8">
              Ask about schedules, staff availability, or lab assignments.
            </p>
          )}
          {messages.map((m) => {
            const text = m.parts
              .filter((p) => p.type === "text")
              .map((p) => (p as { type: "text"; text: string }).text)
              .join("");
            return (
              <div
                key={m.id}
                className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`rounded-lg px-3 py-2 text-sm max-w-[90%] ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {text}
                </div>
              </div>
            );
          })}
          {isLoading && (
            <div className="flex items-start">
              <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                Thinking…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <Separator />

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 p-3">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about the rota…"
          className="flex-1 text-sm"
          disabled={isLoading}
        />
        <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
          <SendHorizonal className="size-4" />
        </Button>
      </form>
    </aside>
  );
}
