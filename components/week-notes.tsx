"use client"

import { useState, useEffect, useTransition } from "react"
import { Plus, Trash2, FileText } from "lucide-react"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  getWeekNotes,
  addWeekNote,
  updateWeekNote,
  deleteWeekNote,
  dismissTemplateNote,
  type WeekNoteData,
} from "@/app/(clinic)/notes-actions"

export function WeekNotes({ weekStart }: { weekStart: string }) {
  const [data, setData] = useState<WeekNoteData | null>(null)
  const [newText, setNewText] = useState("")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getWeekNotes(weekStart).then(setData)
  }, [weekStart])

  if (!data || !data.enableNotes) return null

  function handleAddNote() {
    if (!newText.trim()) return
    startTransition(async () => {
      const result = await addWeekNote(weekStart, newText.trim())
      if (result.error) { toast.error(result.error); return }
      setData((prev) => prev ? { ...prev, adHocNotes: [...prev.adHocNotes, { id: result.id!, text: newText.trim() }] } : prev)
      setNewText("")
    })
  }

  function handleUpdateNote(id: string) {
    if (!editText.trim()) return
    startTransition(async () => {
      const result = await updateWeekNote(id, editText.trim())
      if (result.error) { toast.error(result.error); return }
      setData((prev) => prev ? { ...prev, adHocNotes: prev.adHocNotes.map((n) => n.id === id ? { ...n, text: editText.trim() } : n) } : prev)
      setEditingId(null)
    })
  }

  function handleDeleteAdHoc(id: string) {
    startTransition(async () => {
      const result = await deleteWeekNote(id)
      if (result.error) { toast.error(result.error); return }
      setData((prev) => prev ? { ...prev, adHocNotes: prev.adHocNotes.filter((n) => n.id !== id) } : prev)
    })
  }

  function handleDismissTemplate(templateId: string) {
    if (!confirm("Esta es una nota predeterminada. Se eliminará solo de esta semana y reaparecerá la semana siguiente. ¿Continuar?")) return
    startTransition(async () => {
      const result = await dismissTemplateNote(templateId, weekStart)
      if (result.error) { toast.error(result.error); return }
      setData((prev) => prev ? { ...prev, templates: prev.templates.filter((t) => t.id !== templateId) } : prev)
    })
  }

  const hasContent = data.templates.length > 0 || data.adHocNotes.length > 0

  return (
    <div className="border-t border-border px-4 py-3 shrink-0">
      <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-2">Notas</p>

      {/* Template notes */}
      {data.templates.map((t) => (
        <div key={t.id} className="flex items-center gap-2 py-1.5 group">
          <span className="text-[13px] text-foreground flex-1">• {t.text}</span>
          <span className="text-[9px] text-muted-foreground/50 font-medium uppercase shrink-0">nota</span>
          <button
            onClick={() => handleDismissTemplate(t.id)}
            disabled={isPending}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}

      {/* Ad-hoc notes */}
      {data.adHocNotes.map((n) => (
        <div key={n.id} className="flex items-center gap-2 py-1.5 group">
          {editingId === n.id ? (
            <Input
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={() => handleUpdateNote(n.id)}
              onKeyDown={(e) => { if (e.key === "Enter") handleUpdateNote(n.id); if (e.key === "Escape") setEditingId(null) }}
              disabled={isPending}
              className="flex-1 h-7 text-[13px]"
              autoFocus
            />
          ) : (
            <span
              className="text-[13px] text-foreground flex-1 cursor-text"
              onClick={() => { setEditingId(n.id); setEditText(n.text) }}
            >
              • {n.text}
            </span>
          )}
          <button
            onClick={() => handleDeleteAdHoc(n.id)}
            disabled={isPending}
            className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all shrink-0"
          >
            <Trash2 className="size-3" />
          </button>
        </div>
      ))}

      {/* Add new */}
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() => document.getElementById("week-note-input")?.focus()}
          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <Plus className="size-3" />
        </button>
        <input
          id="week-note-input"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAddNote() }}
          placeholder="Añadir nota para esta semana..."
          disabled={isPending}
          className="flex-1 text-[12px] text-foreground bg-transparent outline-none placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  )
}
