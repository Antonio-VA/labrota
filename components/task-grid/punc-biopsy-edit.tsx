"use client"

import { useState, useRef, useEffect } from "react"

export function PuncBiopsyEdit({ date, value, defaultValue, isOverride, biopsyForecast, onChange, onBiopsyChange, disabled }: {
  date: string; value: number; defaultValue: number; isOverride: boolean
  biopsyForecast: number
  onChange?: (date: string, value: number | null) => void
  onBiopsyChange?: (date: string, value: number) => void
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const [biopsyDraft, setBiopsyDraft] = useState(String(biopsyForecast))
  const popRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setDraft(String(value)) }, [value])
  useEffect(() => { setBiopsyDraft(String(biopsyForecast)) }, [biopsyForecast])

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  function save() {
    const n = parseInt(draft, 10)
    if (!isNaN(n) && n >= 0) onChange?.(date, n === defaultValue ? null : n)
    else setDraft(String(value))
    const nb = parseInt(biopsyDraft, 10)
    if (!isNaN(nb) && nb >= 0 && nb !== biopsyForecast) onBiopsyChange?.(date, nb)
    setOpen(false)
  }

  const pLabel = `P:${value}`
  const bLabel = `B:${biopsyForecast}`

  if (disabled) {
    return (value > 0 || biopsyForecast > 0) ? (
      <span className="flex items-center gap-1 text-[11px] font-medium tabular-nums text-muted-foreground">
        <span className={isOverride ? "text-primary" : ""}>{pLabel}</span>
        <span>{bLabel}</span>
      </span>
    ) : null
  }

  return (
    <div ref={popRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setDraft(String(value)); setBiopsyDraft(String(biopsyForecast)); setOpen((o) => !o) }}
        className="flex items-center gap-1 text-[11px] font-medium tabular-nums rounded px-1 py-0.5 transition-colors hover:bg-background/80 cursor-pointer"
      >
        <span className={isOverride ? "text-primary" : "text-muted-foreground"}>{pLabel}</span>
        <span className="text-muted-foreground">{bLabel}</span>
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2.5 w-40 flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
          <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1.5 items-center">
            <span className="text-[11px] text-muted-foreground text-right">Punciones</span>
            <input autoFocus type="number" min={0} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false) }} className="w-12 text-[12px] text-center border border-input rounded px-1 py-0.5 outline-none focus:border-primary bg-background" />
            <span className="text-[11px] text-muted-foreground text-right">Biopsias</span>
            <input type="number" min={0} value={biopsyDraft} onChange={(e) => setBiopsyDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") setOpen(false) }} className="w-12 text-[12px] text-center border border-input rounded px-1 py-0.5 outline-none focus:border-primary bg-background" />
          </div>
          <div className="flex gap-1">
            <button onClick={save} className="flex-1 text-[11px] bg-primary text-primary-foreground rounded px-2 py-1 hover:opacity-90 transition-opacity">Guardar</button>
            {isOverride && (
              <button onClick={() => { onChange?.(date, null); setOpen(false) }} className="text-[11px] text-muted-foreground hover:text-foreground px-2 py-1 rounded transition-colors">Reset</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
