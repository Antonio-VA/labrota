"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useTranslations } from "next-intl"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SendHorizonal, Bot, CheckCircle2, XCircle } from "lucide-react"
import { useRef, useEffect, useState, useTransition } from "react"
import ReactMarkdown from "react-markdown"
import { generateRota } from "@/app/(clinic)/rota/actions"
import { createLeave } from "@/app/(clinic)/leaves/actions"
import { useRouter } from "next/navigation"

const transport = new DefaultChatTransport({ api: "/api/chat" })

// ── Proposal types ────────────────────────────────────────────────────────────

type GenerateRotaProposal = {
  proposal: true
  action: "generateRota"
  params: { weekStart: string }
  description: string
}

type AddLeaveProposal = {
  proposal: true
  action: "addLeave"
  params: {
    staffId: string | null
    staffName: string
    leaveType: "annual" | "sick" | "personal" | "other"
    startDate: string
    endDate: string
    notes: string | null
  }
  description: string
}

type Proposal = GenerateRotaProposal | AddLeaveProposal

// ── Proposal card ─────────────────────────────────────────────────────────────

function ProposalCard({ proposal, messageId }: { proposal: Proposal; messageId: string }) {
  const t      = useTranslations("agent")
  const tc     = useTranslations("common")
  const router = useRouter()

  const [status, setStatus] = useState<"pending" | "applying" | "done" | "discarded">("pending")
  const [error, setError]   = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleApply() {
    startTransition(async () => {
      setStatus("applying")
      setError(null)

      if (proposal.action === "generateRota") {
        const result = await generateRota(proposal.params.weekStart, false)
        if (result.error) { setError(result.error); setStatus("pending") }
        else { setStatus("done"); router.refresh() }
      } else if (proposal.action === "addLeave") {
        const { params } = proposal
        if (!params.staffId) {
          setError("Staff member not found. Please add leave manually.")
          setStatus("pending")
          return
        }
        const formData = new FormData()
        formData.set("staff_id", params.staffId)
        formData.set("type", params.leaveType)
        formData.set("start_date", params.startDate)
        formData.set("end_date", params.endDate)
        if (params.notes) formData.set("notes", params.notes)
        const result = await createLeave(null, formData)
        if ((result as { error?: string })?.error) {
          setError((result as { error: string }).error)
          setStatus("pending")
        } else {
          setStatus("done")
          router.refresh()
        }
      }
    })
  }

  return (
    <div className={`rounded-lg border p-3 text-[13px] flex flex-col gap-2 ${
      status === "done"      ? "border-emerald-200 bg-emerald-50" :
      status === "discarded" ? "border-border bg-muted/30 opacity-60" :
                               "border-primary/20 bg-primary/5"
    }`}>
      <p className="font-medium text-[13px]">{t("confirmDraft")}</p>
      <p className="text-muted-foreground">{proposal.description}</p>

      {error && <p className="text-destructive text-[12px]">{error}</p>}

      {status === "done" && (
        <div className="flex items-center gap-1.5 text-emerald-600">
          <CheckCircle2 className="size-3.5" />
          <span>{tc("success")}</span>
        </div>
      )}
      {status === "discarded" && (
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <XCircle className="size-3.5" />
          <span>{t("discard")}</span>
        </div>
      )}

      {status === "pending" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={handleApply} disabled={isPending}>
            {isPending ? tc("saving") : t("apply")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStatus("discarded")}>
            {t("discard")}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Example prompts ───────────────────────────────────────────────────────────

const EXAMPLE_KEYS = ["generate", "coverage", "shifts"] as const

function ExamplePrompts({ onSelect }: { onSelect: (text: string) => void }) {
  const t      = useTranslations("agent")
  const today  = new Date()
  const monday = new Date(today)
  const diff   = today.getDay() === 0 ? -6 : 1 - today.getDay()
  monday.setDate(today.getDate() + diff + 7)
  const nextMonday = monday.toISOString().split("T")[0]

  const examples = [
    t("examples.generate"),
    t("examples.coverage"),
    t("examples.icsi"),
  ]

  return (
    <div className="flex flex-col gap-2 px-4 py-6">
      <p className="text-center text-[12px] text-muted-foreground mb-2">
        {t("placeholder").split("(")[0].trim()}
      </p>
      {examples.map((ex) => (
        <button
          key={ex}
          onClick={() => onSelect(ex)}
          className="text-left text-[12px] px-3 py-2 rounded-lg border border-border bg-muted/30 hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
        >
          {ex}
        </button>
      ))}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ChatPanel() {
  const t = useTranslations("agent")
  const { messages, sendMessage, status } = useChat({ transport })
  const [input, setInput] = useState("")
  const bottomRef         = useRef<HTMLDivElement>(null)
  const isLoading         = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput("")
  }

  function handleSelectExample(text: string) {
    setInput(text)
  }

  return (
    <aside className="flex w-full md:w-80 md:shrink-0 flex-col border-l">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Bot className="size-4 text-primary" />
        <span className="text-[14px] font-medium">{t("title")}</span>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4">
        <div className="flex flex-col gap-3 py-4">
          {messages.length === 0 && (
            <ExamplePrompts onSelect={handleSelectExample} />
          )}

          {messages.map((m) => {
            const textParts = m.parts.filter((p) => p.type === "text")
            const toolParts = m.parts.filter((p) => p.type === "tool-invocation")

            return (
              <div
                key={m.id}
                className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
                {/* Text content */}
                {textParts.map((p, i) => {
                  const text = (p as { type: "text"; text: string }).text
                  if (!text.trim()) return null
                  return (
                    <div
                      key={i}
                      className={`rounded-lg px-3 py-2 text-[13px] max-w-[90%] ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground whitespace-pre-wrap"
                          : "bg-muted text-foreground prose prose-sm prose-neutral max-w-none"
                      }`}
                    >
                      {m.role === "user" ? text : (
                        <ReactMarkdown
                          components={{
                            p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                            ul:     ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                            ol:     ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                            li:     ({ children }) => <li>{children}</li>,
                            code:   ({ children }) => <code className="bg-background/60 rounded px-1 text-[12px] font-mono">{children}</code>,
                          }}
                        >
                          {text}
                        </ReactMarkdown>
                      )}
                    </div>
                  )
                })}

                {/* Tool invocations */}
                {toolParts.map((p, i) => {
                  const tp = p as unknown as {
                    type: "tool-invocation"
                    toolName: string
                    state: string
                    result?: Proposal
                  }
                  if (tp.state !== "result" || !tp.result?.proposal) return null
                  return (
                    <div key={i} className="w-full max-w-[95%]">
                      <ProposalCard proposal={tp.result} messageId={`${m.id}-${i}`} />
                    </div>
                  )
                })}
              </div>
            )
          })}

          {isLoading && (
            <div className="flex items-start">
              <div className="rounded-lg bg-muted px-3 py-2 text-[13px] text-muted-foreground">
                {t("thinking")}
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
          placeholder={t("placeholder")}
          className="flex-1 text-[13px]"
          disabled={isLoading}
        />
        <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
          <SendHorizonal className="size-4" />
        </Button>
      </form>
    </aside>
  )
}
