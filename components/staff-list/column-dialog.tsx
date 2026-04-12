"use client"

import { useRef } from "react"
import { GripVertical, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ColKey } from "./types"

export function ColumnDialog({
  open,
  onClose,
  onSave,
  draftOrder,
  setDraftOrder,
  draftVisible,
  setDraftVisible,
  allColumns,
  saveLabel,
  cancelLabel,
  title,
  subtitle,
}: {
  open: boolean
  onClose: () => void
  onSave: () => void
  draftOrder: ColKey[]
  setDraftOrder: (order: ColKey[]) => void
  draftVisible: Set<ColKey>
  setDraftVisible: (vis: Set<ColKey>) => void
  allColumns: { key: ColKey; label: string }[]
  saveLabel: string
  cancelLabel: string
  title: string
  subtitle: string
}) {
  const dragColIdx = useRef<number | null>(null)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end pt-14 pr-4" onClick={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-xl w-64 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-border">
          <p className="text-[14px] font-medium">{title}</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
        <div className="py-1 max-h-[60vh] overflow-y-auto">
          {draftOrder.map((key, i) => {
            const col = allColumns.find(c => c.key === key)
            if (!col) return null
            return (
              <div
                key={key}
                draggable
                onDragStart={() => { dragColIdx.current = i }}
                onDragOver={(e) => {
                  e.preventDefault()
                  if (dragColIdx.current === null || dragColIdx.current === i) return
                  const next = [...draftOrder]
                  const [item] = next.splice(dragColIdx.current, 1)
                  next.splice(i, 0, item)
                  dragColIdx.current = i
                  setDraftOrder(next)
                }}
                onDragEnd={() => { dragColIdx.current = null }}
                className="flex items-center gap-2.5 px-3 py-2.5 hover:bg-accent transition-colors cursor-grab active:cursor-grabbing select-none"
              >
                <GripVertical className="size-4 text-muted-foreground/40 shrink-0" />
                <button
                  type="button"
                  onClick={() => {
                    const next = new Set(draftVisible)
                    next.has(key) ? next.delete(key) : next.add(key)
                    setDraftVisible(next)
                  }}
                  className="flex items-center gap-2 flex-1 text-left"
                >
                  <span className={cn("size-4 rounded border flex items-center justify-center shrink-0", draftVisible.has(key) ? "bg-primary border-primary text-white" : "border-border")}>
                    {draftVisible.has(key) && <Check className="size-3" />}
                  </span>
                  <span className="text-[13px]">{col.label}</span>
                </button>
              </div>
            )
          })}
        </div>
        <div className="px-3 py-3 border-t border-border flex items-center gap-2">
          <button onClick={onSave} className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors">
            {saveLabel}
          </button>
          <button onClick={onClose} className="h-8 px-3 rounded-lg border border-input text-[13px] text-muted-foreground hover:text-foreground transition-colors">
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
