"use client"

import { useState, useRef, useEffect } from "react"
import { toast } from "sonner"
import { Trash2, Pencil, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { BookmarkPlus } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDateWithYear } from "@/lib/format-date"
import { useLocale, useTranslations } from "next-intl"
import {
  renameTemplate,
  deleteTemplate,
  getTemplates,
} from "@/app/(clinic)/rota/actions"
import type { RotaTemplate } from "@/lib/types/database"

export function PlantillasTab({ initialTemplates }: { initialTemplates: RotaTemplate[] }) {
  const locale = useLocale() as "es" | "en"
  const t = useTranslations("plantillas")
  const tc = useTranslations("common")
  const [templates, setTemplates] = useState(initialTemplates)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.focus()
  }, [editingId])

  async function handleRename(id: string) {
    if (!editName.trim()) return
    const result = await renameTemplate(id, editName.trim())
    if (result.error) { toast.error(result.error); return }
    setTemplates((prev) => prev.map((t) => t.id === id ? { ...t, name: editName.trim() } : t))
    setEditingId(null)
    toast.success(t("renamed"))
  }

  async function handleDelete(id: string) {
    const result = await deleteTemplate(id)
    if (result.error) { toast.error(result.error); return }
    setTemplates((prev) => prev.filter((t) => t.id !== id))
    setDeletingId(null)
    toast.success(t("deleted"))
  }

  async function refresh() {
    const data = await getTemplates()
    setTemplates(data)
  }

  // Compute shift breakdown for a template
  function shiftSummary(tpl: RotaTemplate): string {
    const counts: Record<string, number> = {}
    for (const a of tpl.assignments) {
      counts[a.shift_type] = (counts[a.shift_type] ?? 0) + 1
    }
    return Object.entries(counts).map(([k, v]) => `${k}: ${v}`).join(" · ")
  }

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={BookmarkPlus}
        title={t("noTemplates")}
        description={t("noTemplatesDescription")}
      />
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {templates.map((tpl) => (
        <div
          key={tpl.id}
          className="rounded-lg border border-border bg-background px-4 py-3 flex items-start justify-between gap-3"
        >
          <div className="flex-1 min-w-0">
            {editingId === tpl.id ? (
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRename(tpl.id); if (e.key === "Escape") setEditingId(null) }}
                  className="flex-1 rounded border border-border bg-background px-2 py-1 text-[13px] outline-none focus:ring-2 focus:ring-primary/20"
                />
                <button onClick={() => handleRename(tpl.id)} className="size-6 flex items-center justify-center rounded hover:bg-muted">
                  <Check className="size-3.5 text-emerald-600" />
                </button>
                <button onClick={() => setEditingId(null)} className="size-6 flex items-center justify-center rounded hover:bg-muted">
                  <X className="size-3.5 text-muted-foreground" />
                </button>
              </div>
            ) : (
              <p className="text-[14px] font-medium truncate">{tpl.name}</p>
            )}
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {tpl.assignments.length} {t("assignments")} · {shiftSummary(tpl)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {t("created")} {formatDateWithYear(tpl.created_at, locale)}
            </p>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {deletingId === tpl.id ? (
              <>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(tpl.id)}>{tc("delete")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setDeletingId(null)}>{tc("no")}</Button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setEditingId(tpl.id); setEditName(tpl.name) }}
                  className={cn("size-7 flex items-center justify-center rounded hover:bg-muted", editingId === tpl.id && "hidden")}
                  title={t("rename")}
                >
                  <Pencil className="size-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={() => setDeletingId(tpl.id)}
                  className="size-7 flex items-center justify-center rounded hover:bg-destructive/10"
                  title={tc("delete")}
                >
                  <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
