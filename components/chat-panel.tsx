"use client"

import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { useTranslations } from "next-intl"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { SendHorizonal, CheckCircle2, XCircle, X, ChevronLeft, Sparkles } from "lucide-react"
import { useRef, useEffect, useState, useTransition } from "react"
import ReactMarkdown from "react-markdown"
import { generateRota, upsertAssignment, regenerateDay, publishRota, unlockRota, copyPreviousWeek } from "@/app/(clinic)/rota/actions"
import { createLeave, approveLeave, rejectLeave, cancelLeave } from "@/app/(clinic)/leaves/actions"
import { addWeekNote } from "@/app/(clinic)/notes-actions"
import { bulkAddSkill, bulkRemoveSkill, bulkSoftDeleteStaff, bulkUpdateStaffField } from "@/app/(clinic)/staff/actions"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"
import { createRule, toggleRule, deleteRule } from "@/app/(clinic)/lab/rules-actions"
import { useRouter } from "next/navigation"

const transport = new DefaultChatTransport({
  api: "/api/chat",
  body: () => ({
    viewingWeekStart: typeof window !== "undefined"
      ? sessionStorage.getItem("labrota_current_date") ?? undefined
      : undefined,
    currentPage: typeof window !== "undefined"
      ? window.location.pathname
      : undefined,
  }),
})

// ── Proposal types ────────────────────────────────────────────────────────────

type Proposal = {
  proposal: true
  action: string
  params: Record<string, unknown>
  description: string
}

// ── Proposal card ─────────────────────────────────────────────────────────────

function ProposalCard({ proposal }: { proposal: Proposal }) {
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
            ok = true;             break
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
            ok = true;             break
          }
          case "regenerateDay": {
            const result = await regenerateDay(p.weekStart as string, p.date as string)
            if (result.error) { setError(result.error); break }
            ok = true;             break
          }
          case "publishRota": {
            const result = await publishRota(p.rotaId as string)
            if (result.error) { setError(result.error); break }
            ok = true;             break
          }
          case "unlockRota": {
            const result = await unlockRota(p.rotaId as string)
            if (result.error) { setError(result.error); break }
            ok = true;             break
          }
          case "copyPreviousWeek": {
            const result = await copyPreviousWeek(p.weekStart as string)
            if (result.error) { setError(result.error); break }
            ok = true;             break
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
          window.dispatchEvent(new CustomEvent("labrota:refresh"))
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
      status === "done"      ? "border-emerald-500/30 bg-emerald-500/10" :
      status === "discarded" ? "border-border bg-muted/30 opacity-60" :
                               "border-primary/30 bg-primary/10"
    }`}>
      <p className="font-medium text-[13px]">{t("confirmDraft")}</p>
      <p className="text-muted-foreground">{proposal.description}</p>

      {error && <p className="text-destructive text-[12px]">{error}</p>}

      {status === "done" && (
        <div className="flex items-center gap-1.5 text-emerald-500">
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

function ExamplePrompts({ onSend }: { onSend: (text: string) => void }) {
  const t = useTranslations("agent")

  const examples = [
    t("examples.generate"),
    t("examples.whoIsOff"),
    t("examples.coverage"),
    t("examples.copyWeek"),
    t("examples.publish"),
  ]

  return (
    <div className="flex flex-col items-center gap-4 px-4 py-8">
      <div className="flex items-center justify-center size-10 rounded-full bg-primary/10">
        <Sparkles className="size-5 text-primary" />
      </div>
      <p className="text-center text-[12px] text-muted-foreground">
        {t("promptHint")}
      </p>
      <div className="flex flex-wrap gap-1.5 justify-center">
        {examples.map((ex) => (
          <button
            key={ex}
            onClick={() => onSend(ex)}
            className="text-[11px] px-2.5 py-1.5 rounded-full border border-border bg-background hover:bg-muted hover:border-primary/30 transition-colors text-muted-foreground hover:text-foreground"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ChatPanel({
  collapsed: controlledCollapsed,
  onToggleCollapsed,
  mobile = false,
}: {
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
  const inputRef                = useRef<HTMLTextAreaElement>(null)
  const isLoading               = status === "submitted" || status === "streaming"

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, status])

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
            <ExamplePrompts onSend={(text) => sendMessage({ text })} />
          )}

          {messages.map((m) => {
            const textParts = m.parts.filter((p) => p.type === "text")
            const toolParts = m.parts.filter((p) => (p as { state?: unknown }).state !== undefined && p.type !== "text")

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
                    type: string
                    state: string
                    output?: Proposal | { error: string }
                    errorText?: string
                  }
                  // Show loading indicator while tool is executing
                  if (tp.state === "input-streaming" || tp.state === "input-available") {
                    return (
                      <div key={i} className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-[12px] text-muted-foreground animate-pulse">
                        {t("thinking")}
                      </div>
                    )
                  }
                  // Show error from tool
                  if (tp.state === "output-error") {
                    return (
                      <div key={i} className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive max-w-[95%]">
                        {tp.errorText ?? "Tool error"}
                      </div>
                    )
                  }
                  if (tp.state !== "output-available") return null
                  // Show error from tool result
                  if (tp.output && "error" in tp.output && !("proposal" in tp.output)) {
                    return (
                      <div key={i} className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[13px] text-destructive max-w-[95%]">
                        {(tp.output as { error: string }).error}
                      </div>
                    )
                  }
                  if (!tp.output || !(tp.output as Proposal).proposal) return null
                  return (
                    <div key={i} className="w-full max-w-[95%]">
                      <ProposalCard proposal={tp.output as Proposal} />
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

      {/* Input — Atlassian-inspired */}
      <div className="shrink-0 border-t bg-background px-3 py-2.5">
        <form onSubmit={handleSubmit}>
          <div className="rounded-lg border border-input bg-muted/20 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 focus-within:bg-background transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  handleSubmit(e)
                }
              }}
              placeholder={t("placeholder")}
              disabled={isLoading}
              rows={2}
              className="
                w-full resize-none bg-transparent px-3 pt-2.5 pb-1
                text-[13px] text-foreground placeholder:text-muted-foreground/50
                outline-none leading-relaxed
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            />
            <div className="flex items-center justify-end px-2 pb-1.5">
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="flex items-center justify-center size-7 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <SendHorizonal className="size-3.5" />
              </button>
            </div>
          </div>
        </form>
      </div>
    </>
  )

  if (mobile) {
    return (
      <aside className="flex flex-col border-t bg-background flex-1 overflow-hidden min-h-0">
        <div className="flex items-center gap-2 border-b px-3 h-10 shrink-0">
          <Sparkles className="size-4 text-primary shrink-0" />
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
          <Sparkles className="size-4 text-primary" />
        </button>
      )}

      {/* ── Expanded panel ── */}
      {!collapsed && (
        <>
          <div className="flex items-center gap-2 border-b px-3 h-12 shrink-0">
            <Sparkles className="size-4 text-primary shrink-0" />
            <span className="text-[14px] font-medium flex-1">{t("title")}</span>
            <button
              onClick={toggleCollapse}
              className="flex items-center justify-center size-6 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title={t("collapse")}
            >
              <X className="size-4" />
            </button>
          </div>
          {chatContent}
        </>
      )}
    </aside>
  )
}
