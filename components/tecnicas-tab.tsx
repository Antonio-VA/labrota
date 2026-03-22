"use client"

import { useState, useTransition } from "react"
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { saveTecnica, deleteTecnica, reorderTecnicas, seedDefaultTecnicas } from "@/app/(clinic)/lab/tecnicas-actions"
import type { Tecnica } from "@/lib/types/database"

// ── Color options ──────────────────────────────────────────────────────────────

const COLORS = [
  { key: "amber",  label: "Amber",  dot: "bg-amber-400",  pill: "bg-amber-50 border-amber-300 text-amber-800" },
  { key: "blue",   label: "Blue",   dot: "bg-blue-400",   pill: "bg-blue-50 border-blue-300 text-blue-700" },
  { key: "green",  label: "Green",  dot: "bg-green-400",  pill: "bg-green-50 border-green-300 text-green-700" },
  { key: "purple", label: "Purple", dot: "bg-purple-400", pill: "bg-purple-50 border-purple-300 text-purple-700" },
  { key: "coral",  label: "Coral",  dot: "bg-red-400",    pill: "bg-red-50 border-red-300 text-red-700" },
  { key: "teal",   label: "Teal",   dot: "bg-teal-400",   pill: "bg-teal-50 border-teal-300 text-teal-700" },
  { key: "slate",  label: "Slate",  dot: "bg-slate-400",  pill: "bg-slate-100 border-slate-300 text-slate-600" },
  { key: "red",    label: "Red",    dot: "bg-red-500",    pill: "bg-red-50 border-red-400 text-red-800" },
] as const

export type TecnicaColor = typeof COLORS[number]["key"]


// ── Color picker ───────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange, disabled }: {
  value: string; onChange: (c: string) => void; disabled?: boolean
}) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {COLORS.map((c) => (
        <button
          key={c.key}
          type="button"
          disabled={disabled}
          onClick={() => onChange(c.key)}
          title={c.label}
          className={cn(
            "size-5 rounded-full border-2 transition-all disabled:opacity-50",
            c.dot,
            value === c.key ? "border-foreground scale-110" : "border-transparent hover:scale-105"
          )}
        />
      ))}
    </div>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────────

type Draft = {
  id?: string
  nombre_es: string; nombre_en: string; codigo: string
  color: string; department: "lab" | "andrology"; activa: boolean; orden: number
}

function TecnicaRow({
  tecnica, index, total, onChange, onMoveUp, onMoveDown, onDelete, disabled,
}: {
  tecnica: Draft; index: number; total: number
  onChange: (t: Draft) => void; onMoveUp: () => void; onMoveDown: () => void
  onDelete: () => void; disabled: boolean
}) {
  const colorDef = COLORS.find((c) => c.key === tecnica.color) ?? COLORS[0]

  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-lg border border-border bg-background",
      !tecnica.activa && "opacity-60"
    )}>
      {/* Reorder */}
      <div className="flex flex-col gap-0.5 pt-1 shrink-0">
        <button
          type="button"
          disabled={disabled || index === 0}
          onClick={onMoveUp}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        ><ChevronUp className="size-3.5" /></button>
        <button
          type="button"
          disabled={disabled || index === total - 1}
          onClick={onMoveDown}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors"
        ><ChevronDown className="size-3.5" /></button>
      </div>

      {/* Fields */}
      <div className="flex-1 grid grid-cols-[1fr_1fr_80px] gap-2">
        {/* Row 1: Nombre ES / Nombre EN / Código */}
        <Input
          value={tecnica.nombre_es}
          onChange={(e) => onChange({ ...tecnica, nombre_es: e.target.value })}
          disabled={disabled}
          placeholder="Nombre (ES)"
          className="h-8 text-[13px]"
        />
        <Input
          value={tecnica.nombre_en}
          onChange={(e) => onChange({ ...tecnica, nombre_en: e.target.value })}
          disabled={disabled}
          placeholder="Name (EN)"
          className="h-8 text-[13px]"
        />
        <div className="relative">
          <Input
            value={tecnica.codigo}
            onChange={(e) => onChange({ ...tecnica, codigo: e.target.value.toUpperCase().slice(0, 3) })}
            disabled={disabled}
            placeholder="OPU"
            maxLength={3}
            className="h-8 text-[13px] font-mono uppercase pr-8"
          />
          {tecnica.codigo && (
            <span className={cn(
              "absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold px-1 py-0.5 rounded border",
              colorDef.pill
            )}>
              {tecnica.codigo}
            </span>
          )}
        </div>

        {/* Row 2: Color / Skill / Activa */}
        <div className="col-span-3 flex items-center gap-4 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground shrink-0">Color</span>
            <ColorPicker value={tecnica.color} onChange={(c) => onChange({ ...tecnica, color: c })} disabled={disabled} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground shrink-0">Dept.</span>
            <select
              value={tecnica.department}
              onChange={(e) => onChange({ ...tecnica, department: e.target.value as "lab" | "andrology" })}
              disabled={disabled}
              className="h-7 rounded-lg border border-input bg-transparent px-2 text-[12px] outline-none focus-visible:border-ring"
            >
              <option value="lab">Embriólogo</option>
              <option value="andrology">Andrología</option>
            </select>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[12px] text-muted-foreground">Activa</span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange({ ...tecnica, activa: !tecnica.activa })}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                tecnica.activa ? "bg-primary" : "bg-muted-foreground/30",
                disabled && "cursor-not-allowed opacity-50"
              )}
            >
              <span className={cn(
                "inline-block size-4 rounded-full bg-white shadow transition-transform",
                tecnica.activa ? "translate-x-4" : "translate-x-0"
              )} />
            </button>
          </div>
        </div>
      </div>

      {/* Delete */}
      <button
        type="button"
        disabled={disabled}
        onClick={onDelete}
        className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30 shrink-0 mt-0.5"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function TécnicasTab({ initialTecnicas }: { initialTecnicas: Tecnica[] }) {
  const [tecnicas, setTecnicas] = useState<Draft[]>(
    initialTecnicas.map((t) => ({
      id:             t.id,
      nombre_es:      t.nombre_es,
      nombre_en:      t.nombre_en,
      codigo:         t.codigo,
      color:          t.color,
      department:     t.department ?? "lab" as const,
      activa:         t.activa,
      orden:          t.orden,
    }))
  )
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  function addRow() {
    setTecnicas((prev) => [
      ...prev,
      {
        nombre_es: "", nombre_en: "", codigo: "",
        color: "blue", department: "lab" as const, activa: true,
        orden: prev.length,
      },
    ])
  }

  function updateRow(index: number, draft: Draft) {
    setTecnicas((prev) => prev.map((t, i) => i === index ? draft : t))
  }

  function moveUp(index: number) {
    if (index === 0) return
    setTecnicas((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next.map((t, i) => ({ ...t, orden: i }))
    })
  }

  function moveDown(index: number) {
    setTecnicas((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next.map((t, i) => ({ ...t, orden: i }))
    })
  }

  function deleteRow(index: number) {
    setTecnicas((prev) => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, orden: i })))
  }

  function handleSave() {
    setStatus("idle")
    const invalid = tecnicas.filter((t) => !t.nombre_es.trim() || !t.codigo.trim())
    if (invalid.length > 0) {
      setErrorMsg("Todas las técnicas necesitan nombre y código.")
      setStatus("error")
      return
    }

    startTransition(async () => {
      // Save each técnica (upsert)
      const results = await Promise.all(
        tecnicas.map((t, i) => saveTecnica({ ...t, orden: i }))
      )
      const firstError = results.find((r): r is { error: string } => "error" in r)
      if (firstError) {
        setErrorMsg(firstError.error)
        setStatus("error")
        return
      }

      // Sync IDs back into state
      setTecnicas((prev) =>
        prev.map((t, i) => {
          const res = results[i]
          return !t.id && "id" in res ? { ...t, id: res.id } : t
        })
      )

      // Persist order
      const ids = tecnicas.map((t, i) => {
        const res = results[i]
        return t.id ?? ("id" in res ? res.id : "")
      }).filter(Boolean)
      await reorderTecnicas(ids)

      setStatus("success")
      setTimeout(() => setStatus("idle"), 3000)
    })
  }

  async function handleSeed() {
    startTransition(async () => {
      const result = await seedDefaultTecnicas()
      if (result.error) {
        setErrorMsg(result.error)
        setStatus("error")
      } else if (result.seeded) {
        window.location.reload()
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {tecnicas.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-[14px] text-muted-foreground mb-3">No hay técnicas definidas.</p>
          <Button type="button" variant="outline" size="sm" onClick={handleSeed} disabled={isPending}>
            Cargar defaults (OPU, ICS, ET, BX, DEN, AND)
          </Button>
        </div>
      )}

      {/* Embriólogo técnicas */}
      {tecnicas.some((t) => t.department === "lab") && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Embriólogo</p>
          <div className="flex flex-col gap-3">
            {tecnicas.map((t, i) => t.department === "lab" ? (
              <TecnicaRow
                key={t.id ?? `new-${i}`}
                tecnica={t} index={i} total={tecnicas.length}
                onChange={(draft) => updateRow(i, draft)}
                onMoveUp={() => moveUp(i)} onMoveDown={() => moveDown(i)}
                onDelete={() => deleteRow(i)} disabled={isPending}
              />
            ) : null)}
          </div>
        </div>
      )}

      {/* Andrología técnicas */}
      {tecnicas.some((t) => t.department === "andrology") && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">Andrología</p>
          <div className="flex flex-col gap-3">
            {tecnicas.map((t, i) => t.department === "andrology" ? (
              <TecnicaRow
                key={t.id ?? `new-${i}`}
                tecnica={t} index={i} total={tecnicas.length}
                onChange={(draft) => updateRow(i, draft)}
                onMoveUp={() => moveUp(i)} onMoveDown={() => moveDown(i)}
                onDelete={() => deleteRow(i)} disabled={isPending}
              />
            ) : null)}
          </div>
        </div>
      )}

      {/* Add row */}
      <button
        type="button"
        onClick={addRow}
        disabled={isPending}
        className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 py-1"
      >
        <Plus className="size-3.5" />
        Añadir técnica
      </button>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button type="button" onClick={handleSave} disabled={isPending || tecnicas.length === 0}>
          {isPending ? "Guardando…" : "Guardar técnicas"}
        </Button>
        {status === "success" && (
          <span className="flex items-center gap-1.5 text-[14px] text-emerald-600">
            <CheckCircle2 className="size-4" />Guardado
          </span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1.5 text-[14px] text-destructive">
            <AlertCircle className="size-4" />{errorMsg}
          </span>
        )}
      </div>
    </div>
  )
}
