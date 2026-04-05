"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useTranslations } from "next-intl"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { SendHorizonal, Bot, CheckCircle2, XCircle, ChevronRight, ChevronLeft } from "lucide-react"
import { useRef, useEffect, useState, useTransition } from "react"
import ReactMarkdown from "react-markdown"
import { generateRota, upsertAssignment, regenerateDay, publishRota, unlockRota, copyPreviousWeek } from "@/app/(clinic)/rota/actions"
import { createLeave, approveLeave, rejectLeave, cancelLeave } from "@/app/(clinic)/leaves/actions"
import { addWeekNote } from "@/app/(clinic)/notes-actions"
import { bulkAddSkill, bulkRemoveSkill, bulkSoftDeleteStaff, bulkUpdateStaffField } from "@/app/(clinic)/staff/actions"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import { createRule, toggleRule, deleteRule } from "@/app/(clinic)/lab/rules-actions"
import { useRouter } from "next/navigation"

const transport = new DefaultChatTransport({ api: "/api/chat" })

// ── Proposal types ────────────────────────────────────────────────────────────

type Proposal = {
  proposal: true
  action: string
  params: Record<string, unknown>
  description: string
}

// ── Proposal card ─────────────────────────────────────────────────────────────

function ProposalCard({ proposal, onRefresh }: { proposal: Proposal; onRefresh?: () => void }) {
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

      try {
        const p = proposal.params
        let ok = false

        switch (proposal.action) {
          case "generateRota": {
            const result = await generateRota(p.weekStart as string, false)
            if (result.error) { setError(result.error); break }
            if ((result.assignmentCount ?? 0) === 0) { setError("No assignments created. Check staff and lab config."); break }
            ok = true; onRefresh?.()
            break
          }
          case "addLeave": {
            if (!p.staffId) { setError("Staff member not found."); break }
            const formData = new FormData()
            formData.set("staff_id", p.staffId as string)
            formData.set("type", p.leaveType as string)
            formData.set("start_date", p.startDate as string)
            formData.set("end_date", p.endDate as string)
            if (p.notes) formData.set("notes", p.notes as string)
            const result = await createLeave(null, formData)
            if ((result as { error?: string })?.error) { setError((result as { error: string }).error); break }
            ok = true
            break
          }
          case "addNote": {
            const result = await addWeekNote(p.weekStart as string, p.text as string)
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "assignStaff": {
            if (!p.staffId) { setError("Staff member not found."); break }
            const result = await upsertAssignment({
              weekStart: p.weekStart as string,
              staffId: p.staffId as string,
              date: p.date as string,
              shiftType: p.shiftType as string,
              functionLabel: (p.functionLabel as string) ?? undefined,
            })
            if (result.error) { setError(result.error); break }
            ok = true; onRefresh?.()
            break
          }
          case "regenerateDay": {
            const result = await regenerateDay(p.weekStart as string, p.date as string)
            if (result.error) { setError(result.error); break }
            ok = true; onRefresh?.()
            break
          }
          case "publishRota": {
            const result = await publishRota(p.rotaId as string)
            if (result.error) { setError(result.error); break }
            ok = true; onRefresh?.()
            break
          }
          case "unlockRota": {
            const result = await unlockRota(p.rotaId as string)
            if (result.error) { setError(result.error); break }
            ok = true; onRefresh?.()
            break
          }
          case "copyPreviousWeek": {
            const result = await copyPreviousWeek(p.weekStart as string)
            if (result.error) { setError(result.error); break }
            ok = true; onRefresh?.()
            break
          }
          case "updateStaff": {
            const changes = p.changes as Record<string, unknown>
            const updates = Object.entries(changes).map(([field, value]) => ({
              id: p.staffId as string,
              field,
              value: value as string | number | string[],
            }))
            const result = await bulkUpdateStaffField(updates)
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "addSkill": {
            const result = await bulkAddSkill(
              [p.staffId as string],
              p.skill as Parameters<typeof bulkAddSkill>[1],
              p.level as Parameters<typeof bulkAddSkill>[2],
            )
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "removeSkill": {
            const result = await bulkRemoveSkill(
              [p.staffId as string],
              p.skill as Parameters<typeof bulkRemoveSkill>[1],
            )
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "deactivateStaff": {
            const result = await bulkSoftDeleteStaff([p.staffId as string])
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "updateCoverage": {
            const result = await updateLabConfig(p.changes as Parameters<typeof updateLabConfig>[0])
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "createRule": {
            const result = await createRule({
              type: p.type as string,
              is_hard: p.is_hard as boolean,
              enabled: p.enabled as boolean,
              staff_ids: p.staff_ids as string[],
              params: p.params as Record<string, unknown>,
              notes: p.notes as string | null,
              expires_at: p.expires_at as string | null,
            } as Parameters<typeof createRule>[0])
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "toggleRule": {
            const result = await toggleRule(p.ruleId as string, p.enabled as boolean)
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "deleteRule": {
            const result = await deleteRule(p.ruleId as string)
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "approveLeave": {
            const result = await approveLeave(p.leaveId as string)
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "rejectLeave": {
            const result = await rejectLeave(p.leaveId as string)
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          case "cancelLeave": {
            const result = await cancelLeave(p.leaveId as string)
            if (result.error) { setError(result.error); break }
            ok = true
            break
          }
          default:
            setError(`Unknown action: ${proposal.action}`)
        }

        if (ok) {
          setStatus("done")
          router.refresh()
        } else if (!error) {
          setStatus("pending")
        } else {
          setStatus("pending")
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unexpected error")
        setStatus("pending")
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

function ExamplePrompts({ onSelect }: { onSelect: (text: string) => void }) {
  const t = useTranslations("agent")

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

export function ChatPanel({
  onRefresh,
  collapsed: controlledCollapsed,
  onToggleCollapsed,
  mobile = false,
}: {
  onRefresh?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  mobile?: boolean
}) {
  const t = useTranslations("agent")
  const { messages, sendMessage, status } = useChat({ transport })
  const [input, setInput]       = useState("")
  const [mounted, setMounted] = useState(false)
  const [internalCollapsed, setInternalCollapsed] = useState(true) // default collapsed to avoid flash
  const collapsed = controlledCollapsed ?? internalCollapsed
  useEffect(() => {
    if (controlledCollapsed === undefined) {
      setInternalCollapsed(localStorage.getItem("agentPanelCollapsed") === "true")
    }
    setMounted(true)
  }, [controlledCollapsed])
  const bottomRef               = useRef<HTMLDivElement>(null)
  const inputRef                = useRef<HTMLInputElement>(null)
  const isLoading               = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  function toggleCollapse() {
    if (onToggleCollapsed) {
      onToggleCollapsed()
    } else {
      const next = !internalCollapsed
      setInternalCollapsed(next)
      localStorage.setItem("agentPanelCollapsed", String(next))
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput("")
  }

  // Shared message + input content
  const chatContent = (
    <>
      {/* Messages — scrollable */}
      <ScrollArea className="flex-1 px-4">
        <div className="flex flex-col gap-3 py-4">
          {messages.length === 0 && (
            <ExamplePrompts onSelect={(text) => setInput(text)} />
          )}

          {messages.map((m) => {
            const textParts = m.parts.filter((p) => p.type === "text")
            const toolParts = m.parts.filter((p) => p.type === "tool-invocation")

            return (
              <div
                key={m.id}
                className={`flex flex-col gap-2 ${m.role === "user" ? "items-end" : "items-start"}`}
              >
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
                      <ProposalCard proposal={tp.result} onRefresh={onRefresh} />
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

      {/* Input — pinned to bottom */}
      <div className="shrink-0 border-t bg-background px-3 py-2">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("placeholder")}
            disabled={isLoading}
            className="
              flex-1 h-9 px-3 rounded-md border border-input bg-background
              text-[13px] text-foreground placeholder:text-muted-foreground/50
              outline-none transition-colors
              focus:border-primary focus:ring-2 focus:ring-primary/20
              disabled:opacity-50 disabled:cursor-not-allowed
            "
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !input.trim()}
            className="size-9 shrink-0 rounded-md"
          >
            <SendHorizonal className="size-4" />
          </Button>
        </form>
      </div>
    </>
  )

  if (mobile) {
    return (
      <aside className="flex flex-col border-t bg-background flex-1 overflow-hidden min-h-0">
        <div className="flex items-center gap-2 border-b px-3 h-10 shrink-0">
          <Bot className="size-4 text-primary shrink-0" />
          <span className="text-[13px] font-medium">{t("title")}</span>
        </div>
        {chatContent}
      </aside>
    )
  }

  return (
    <aside
      className={`
        hidden lg:flex flex-col border-l bg-background shrink-0
        overflow-hidden h-full
        ${!mounted ? "w-10" : `transition-[width] duration-300 ease-in-out ${collapsed ? "w-10" : "w-80"}`}
      `}
    >
      {/* ── Collapsed tab ── */}
      {collapsed && (
        <button
          onClick={toggleCollapse}
          className="flex flex-col items-center gap-3 py-4 w-full h-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          title={t("title")}
        >
          <ChevronLeft className="size-4" />
          <Bot className="size-4 text-primary" />
        </button>
      )}

      {/* ── Expanded panel ── */}
      {!collapsed && (
        <>
          <div className="flex items-center gap-2 border-b px-3 h-12 shrink-0">
            <button
              onClick={toggleCollapse}
              className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="Ocultar panel"
            >
              <ChevronRight className="size-4" />
            </button>
            <Bot className="size-4 text-primary shrink-0" />
            <span className="text-[14px] font-medium">{t("title")}</span>
          </div>
          {chatContent}
        </>
      )}
    </aside>
  )
}
