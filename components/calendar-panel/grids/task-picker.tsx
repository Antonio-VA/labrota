"use client"

import { useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { resolveColor } from "@/components/task-grid/constants"
import type { Tecnica } from "@/lib/types/database"

/** Shared item list for both picker variants */
function PickerItems({ tecnicas, assigned, onSelect, onClose }: {
  tecnicas: Tecnica[]; assigned: Set<string>
  onSelect: (codigo: string) => void; onClose: () => void
}) {
  const available = tecnicas.filter((t) => t.activa && !assigned.has(t.codigo))
  if (available.length === 0) return null
  return (
    <>
      {available.map((t) => (
        <button key={t.id}
          className="flex items-center gap-2 w-full px-2.5 py-1 text-[11px] hover:bg-muted text-left transition-colors"
          onClick={(e) => { e.stopPropagation(); onSelect(t.codigo); onClose() }}>
          <span className="size-2 rounded-full shrink-0 flex-none" style={{ background: resolveColor(t.color) }} />
          <span className="truncate">{t.nombre_es}</span>
        </button>
      ))}
    </>
  )
}

/** Portal-based task picker — rendered at a fixed position via createPortal */
export function TaskPickerPortal({ tecnicas, assigned, pos, onSelect, onClose }: {
  tecnicas: Tecnica[]; assigned: Set<string>
  pos: { top: number; left: number }; onSelect: (codigo: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])
  const available = tecnicas.filter((t) => t.activa && !assigned.has(t.codigo))
  if (available.length === 0) return null
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 200 }}
      className="bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-[200px] overflow-y-auto">
      <PickerItems tecnicas={tecnicas} assigned={assigned} onSelect={onSelect} onClose={onClose} />
    </div>,
    document.body
  )
}

/** Inline task picker — rendered in normal flow with absolute positioning */
export function TaskPickerInline({ tecnicas, assigned, onSelect, onClose }: {
  tecnicas: Tecnica[]; assigned: Set<string>
  onSelect: (codigo: string) => void; onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])
  const available = tecnicas.filter((t) => t.activa && !assigned.has(t.codigo))
  if (available.length === 0) return null
  return (
    <div ref={ref}
      className="absolute left-0 top-full mt-0.5 z-50 bg-background border border-border rounded-lg shadow-lg py-1 min-w-[140px] max-h-[200px] overflow-y-auto">
      <PickerItems tecnicas={tecnicas} assigned={assigned} onSelect={onSelect} onClose={onClose} />
    </div>
  )
}
