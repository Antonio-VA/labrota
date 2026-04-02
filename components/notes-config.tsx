"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Plus, Pencil, Trash2, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { addNoteTemplate, updateNoteTemplate, deleteNoteTemplate } from "@/app/(clinic)/notes-actions"
import { updateLabConfig } from "@/app/(clinic)/lab/actions"

export function NotesConfig({
  initialTemplates,
  initialEnabled,
}: {
  initialTemplates: { id: string; text: string }[]
  initialEnabled: boolean
}) {
  const [enabled, setEnabled] = useState(initialEnabled)
  const [templates, setTemplates] = useState(initialTemplates)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [newText, setNewText] = useState("")
  const [isPending, startTransition] = useTransition()
  const t = useTranslations("notes")
  const tc = useTranslations("common")

  function handleToggle() {
    const next = !enabled
    setEnabled(next)
    startTransition(async () => {
      const result = await updateLabConfig({ enable_notes: next })
      if (result.error) toast.error(result.error)
    })
  }

  function handleAdd() {
    if (!newText.trim()) return
    startTransition(async () => {
      const result = await addNoteTemplate(newText.trim())
      if (result.error) { toast.error(result.error); return }
      setTemplates((prev) => [...prev, { id: result.id!, text: newText.trim() }])
      setNewText("")
    })
  }

  function handleSaveEdit(id: string) {
    if (!editText.trim()) return
    startTransition(async () => {
      const result = await updateNoteTemplate(id, editText.trim())
      if (result.error) { toast.error(result.error); return }
      setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, text: editText.trim() } : t))
      setEditingId(null)
    })
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteNoteTemplate(id)
      if (result.error) { toast.error(result.error); return }
      setTemplates((prev) => prev.filter((t) => t.id !== id))
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">{t("weeklyNotes")}</p>

      {enabled ? (
        <>
          <p className="text-[12px] text-muted-foreground -mt-2">
            {t("defaultNotesDescription")}
          </p>

          {/* Template list */}
          <div className="flex flex-col gap-1.5">
            {templates.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                {editingId === t.id ? (
                  <>
                    <Input
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(t.id); if (e.key === "Escape") setEditingId(null) }}
                      disabled={isPending}
                      className="flex-1 h-7 text-[13px]"
                      autoFocus
                    />
                    <button onClick={() => handleSaveEdit(t.id)} disabled={isPending} className="text-emerald-600 hover:text-emerald-700">
                      <Check className="size-3.5" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="size-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-[13px]">{t.text}</span>
                    <button
                      onClick={() => { setEditingId(t.id); setEditText(t.text) }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={isPending}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new */}
          <div className="flex items-center gap-2">
            <Input
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
              placeholder={t("newNotePlaceholder")}
              disabled={isPending}
              className="flex-1 h-8 text-[13px]"
            />
            <Button size="sm" onClick={handleAdd} disabled={isPending || !newText.trim()}>
              <Plus className="size-3.5" />
              {tc("add")}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          {t("notesDisabled")}
        </p>
      )}
    </div>
  )
}
