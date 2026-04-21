"use client"

import { useState, useEffect, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Plus, Lock, X } from "lucide-react"
import { toast } from "sonner"
import {
  getWeekNotes,
  addWeekNote,
  deleteWeekNote,
  dismissTemplateNote,
  type WeekNoteData,
} from "@/app/(clinic)/notes-actions"
import { createWindowCache } from "@/lib/window-cache"

// Per-week cache pinned to window so revisits of a previously loaded week
// skip the server round-trip.
type _NotesCache = { weeks: Map<string, WeekNoteData> }
const _notesCache = createWindowCache<_NotesCache>("__lrNotesCache", () => ({ weeks: new Map() }))

export function WeekNotes({ weekStart, initialData: initialDataProp }: { weekStart: string; initialData?: WeekNoteData }) {
  const t = useTranslations("notes")
  if (initialDataProp) _notesCache.weeks.set(weekStart, initialDataProp)
  const cached = _notesCache.weeks.get(weekStart) ?? null
  const [data, setData] = useState<WeekNoteData | null>(cached)
  const [loadedWeek, setLoadedWeek] = useState(cached ? weekStart : "")
  const [adding, setAdding] = useState(false)
  const [newText, setNewText] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    if (weekStart === loadedWeek) return // already have data for this week
    const c = _notesCache.weeks.get(weekStart)
    if (c) {
       
      setData(c)
      setLoadedWeek(weekStart)
      return
    }
    setData(null)
    getWeekNotes(weekStart).then((d) => {
      _notesCache.weeks.set(weekStart, d)
      setData(d)
      setLoadedWeek(weekStart)
    })
  }, [weekStart, loadedWeek])

  // Always render the container to prevent layout shift — show nothing inside until data loads
  if (!data) return <div className="border-t border-border px-4 py-2 shrink-0 min-h-[36px]" />
  if (!data.enableNotes) return null

  function handleAdd() {
    if (!newText.trim()) { setAdding(false); return }
    startTransition(async () => {
      const result = await addWeekNote(weekStart, newText.trim())
      if (result.error) { toast.error(result.error); return }
      setData((prev) => {
        if (!prev) return prev
        const next = { ...prev, adHocNotes: [...prev.adHocNotes, { id: result.id!, text: newText.trim() }] }
        _notesCache.weeks.set(weekStart, next)
        return next
      })
      setNewText("")
      setAdding(false)
    })
  }

  function handleDeleteAdHoc(id: string) {
    startTransition(async () => {
      const result = await deleteWeekNote(id)
      if (result.error) { toast.error(result.error); return }
      setData((prev) => {
        if (!prev) return prev
        const next = { ...prev, adHocNotes: prev.adHocNotes.filter((n) => n.id !== id) }
        _notesCache.weeks.set(weekStart, next)
        return next
      })
    })
  }

  function handleDismissTemplate(templateId: string) {
    if (!confirm(t("confirmDismiss"))) return
    startTransition(async () => {
      const result = await dismissTemplateNote(templateId, weekStart)
      if (result.error) { toast.error(result.error); return }
      setData((prev) => {
        if (!prev) return prev
        const next = { ...prev, templates: prev.templates.filter((t) => t.id !== templateId) }
        _notesCache.weeks.set(weekStart, next)
        return next
      })
    })
  }

  return (
    <div className="border-t border-border px-4 py-2 shrink-0 flex items-center gap-2 flex-wrap">
      <span className="text-[11px] text-muted-foreground/60 font-medium shrink-0">{t("label")}</span>

      {/* Template chips */}
      {data.templates.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1 rounded-md bg-muted/50 border border-border/50 px-2 py-0.5 text-[11px] text-muted-foreground group">
          <Lock className="size-2.5 shrink-0 opacity-50" />
          <span data-note-text>{t.text}</span>
          <button
            onClick={() => handleDismissTemplate(t.id)}
            disabled={isPending}
            className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-all shrink-0 -mr-0.5"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {/* Ad-hoc chips */}
      {data.adHocNotes.map((n) => (
        <span key={n.id} className="inline-flex items-center gap-1 rounded-md bg-background border border-border px-2 py-0.5 text-[11px] text-foreground group">
          <span className="text-muted-foreground/40 shrink-0">•</span>
          <span data-note-text>{n.text}</span>
          <button
            onClick={() => handleDeleteAdHoc(n.id)}
            disabled={isPending}
            className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-all shrink-0 -mr-0.5"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}

      {/* Add inline */}
      {adding ? (
        <input
          autoFocus
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") { setAdding(false); setNewText("") } }}
          onBlur={handleAdd}
          disabled={isPending}
          placeholder={t("inputPlaceholder")}
          className="text-[11px] bg-transparent border-b border-border outline-none px-1 py-0.5 w-40 text-foreground placeholder:text-muted-foreground/40"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          <Plus className="size-3" />
          {t("addNote")}
        </button>
      )}
    </div>
  )
}
