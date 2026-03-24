"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Plus, Trash2, GripVertical, ChevronUp, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { bulkSaveTecnicas, seedDefaultTecnicas } from "@/app/(clinic)/lab/tecnicas-actions"
import type { Tecnica } from "@/lib/types/database"

// ── Color options ──────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316", "#EC4899",
  "#06B6D4", "#84CC16", "#6366F1", "#D946EF", "#0EA5E9", "#22C55E", "#A855F7", "#F43F5E",
  "#64748B", "#78716C", "#0D9488", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#CA8A04",
]

// Map legacy named colors → hex for backward compat
const LEGACY_COLOR_HEX: Record<string, string> = {
  amber: "#F59E0B", blue: "#3B82F6", green: "#10B981", purple: "#8B5CF6",
  coral: "#EF4444", teal: "#14B8A6", slate: "#64748B", red: "#EF4444",
}
function resolveHex(color: string): string {
  if (color.startsWith("#")) return color
  return LEGACY_COLOR_HEX[color] ?? "#64748B"
}

export type TecnicaColor = string


// ── Color picker (circle + popover) ─────────────────────────────────────────

function ColorPicker({ value, onChange, disabled }: {
  value: string; onChange: (c: string) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  const hex = resolveHex(value)

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="size-5 rounded-full border-2 border-background ring-1 ring-border hover:ring-primary transition-shadow disabled:opacity-50"
        style={{ backgroundColor: hex }}
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-[200px]">
          <div className="grid grid-cols-8 gap-1">
            {COLOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => { onChange(c); setOpen(false) }}
                className={cn(
                  "size-5 rounded-full transition-transform hover:scale-125",
                  c === hex && "ring-2 ring-primary ring-offset-1 ring-offset-background"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Row ────────────────────────────────────────────────────────────────────────

type Draft = {
  id?: string
  nombre_es: string; nombre_en: string; codigo: string
  color: string; department: "lab" | "andrology"; typical_shifts: string[]; activa: boolean; orden: number
}

function TecnicaRow({
  tecnica, index, total, onChange, onMoveUp, onMoveDown, onDelete, disabled, shiftCodes,
}: {
  tecnica: Draft; index: number; total: number
  onChange: (t: Draft) => void; onMoveUp: () => void; onMoveDown: () => void
  onDelete: () => void; disabled: boolean; shiftCodes: string[]
}) {
  const t = useTranslations("tecnicas")
  const hex = resolveHex(tecnica.color)

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
          placeholder={t("nameEs")}
          className="h-8 text-[13px]"
        />
        <Input
          value={tecnica.nombre_en}
          onChange={(e) => onChange({ ...tecnica, nombre_en: e.target.value })}
          disabled={disabled}
          placeholder={t("nameEn")}
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
            <span
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[9px] font-semibold px-1 py-0.5 rounded border"
              style={{ backgroundColor: hex + "1A", borderColor: hex + "66", color: hex }}
            >
              {tecnica.codigo}
            </span>
          )}
        </div>

        {/* Row 2: Color swatches */}
        <div className="col-span-3 flex items-center gap-2 pt-1">
          <span className="text-[12px] text-muted-foreground shrink-0">{t("color")}</span>
          <ColorPicker value={tecnica.color} onChange={(c) => onChange({ ...tecnica, color: c })} disabled={disabled} />
        </div>

        {/* Row 3: Department / Turno típico / Activa */}
        <div className="col-span-3 flex items-center gap-4 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground shrink-0">{t("department")}</span>
            <select
              value={tecnica.department}
              onChange={(e) => onChange({ ...tecnica, department: e.target.value as "lab" | "andrology" })}
              disabled={disabled}
              className="h-7 rounded-lg border border-input bg-transparent px-2 text-[12px] outline-none focus-visible:border-ring"
            >
              <option value="lab">{t("embriologia")}</option>
              <option value="andrology">{t("andrologia")}</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-muted-foreground shrink-0">{t("typicalShift")}</span>
            <div className="flex gap-1">
              {shiftCodes.map((shift) => {
                const active = tecnica.typical_shifts.includes(shift)
                return (
                  <button
                    key={shift}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const next = active
                        ? tecnica.typical_shifts.filter((s) => s !== shift)
                        : [...tecnica.typical_shifts, shift]
                      onChange({ ...tecnica, typical_shifts: next })
                    }}
                    className={cn(
                      "h-6 px-1.5 rounded text-[10px] font-semibold border transition-colors disabled:opacity-50",
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-transparent text-muted-foreground border-border hover:border-primary/40"
                    )}
                  >
                    {shift}
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[12px] text-muted-foreground">{t("active")}</span>
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

export function TécnicasTab({ initialTecnicas, shiftCodes = ["T1", "T2", "T3"] }: { initialTecnicas: Tecnica[]; shiftCodes?: string[] }) {
  const t = useTranslations("tecnicas")
  const tc = useTranslations("common")
  const [tecnicas, setTecnicas] = useState<Draft[]>(
    initialTecnicas.map((t) => ({
      id:             t.id,
      nombre_es:      t.nombre_es,
      nombre_en:      t.nombre_en,
      codigo:         t.codigo,
      color:          t.color,
      department:     t.department ?? "lab" as const,
      typical_shifts: t.typical_shifts ?? [],
      activa:         t.activa,
      orden:          t.orden,
    }))
  )
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [deletedIds, setDeletedIds] = useState<string[]>([])

  function addRow() {
    setTecnicas((prev) => [
      ...prev,
      {
        nombre_es: "", nombre_en: "", codigo: "",
        color: "blue", department: "lab" as const, typical_shifts: [], activa: true,
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
    const toDelete = tecnicas[index]
    if (toDelete?.id) setDeletedIds((prev) => [...prev, toDelete.id!])
    setTecnicas((prev) => prev.filter((_, i) => i !== index).map((t, i) => ({ ...t, orden: i })))
  }

  function handleSave() {
    setStatus("idle")
    const invalid = tecnicas.filter((t) => !t.nombre_es.trim() || !t.codigo.trim())
    if (invalid.length > 0) {
      setErrorMsg(t("allNeedNameCode"))
      setStatus("error")
      return
    }

    startTransition(async () => {
      const result = await bulkSaveTecnicas(tecnicas, deletedIds)
      if (result.error) {
        setErrorMsg(result.error)
        setStatus("error")
        return
      }
      setDeletedIds([])
      // Sync IDs back into state
      setTecnicas((prev) =>
        prev.map((t, i) => ({ ...t, id: t.id ?? result.ids[i] }))
      )
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
          <p className="text-[14px] text-muted-foreground mb-3">{t("noTecnicas")}</p>
          <Button type="button" variant="outline" size="sm" onClick={handleSeed} disabled={isPending}>
            {t("loadDefaults")}
          </Button>
        </div>
      )}

      {/* Embriología técnicas */}
      {tecnicas.some((t) => t.department === "lab") && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("embriologia")}</p>
          <div className="flex flex-col gap-3">
            {tecnicas.map((t, i) => t.department === "lab" ? (
              <TecnicaRow
                key={t.id ?? `new-${i}`}
                tecnica={t} index={i} total={tecnicas.length}
                onChange={(draft) => updateRow(i, draft)}
                onMoveUp={() => moveUp(i)} onMoveDown={() => moveDown(i)}
                onDelete={() => deleteRow(i)} disabled={isPending} shiftCodes={shiftCodes}
              />
            ) : null)}
          </div>
        </div>
      )}

      {/* Andrología técnicas */}
      {tecnicas.some((t) => t.department === "andrology") && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("andrologia")}</p>
          <div className="flex flex-col gap-3">
            {tecnicas.map((t, i) => t.department === "andrology" ? (
              <TecnicaRow
                key={t.id ?? `new-${i}`}
                tecnica={t} index={i} total={tecnicas.length}
                onChange={(draft) => updateRow(i, draft)}
                onMoveUp={() => moveUp(i)} onMoveDown={() => moveDown(i)}
                onDelete={() => deleteRow(i)} disabled={isPending} shiftCodes={shiftCodes}
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
        {t("addTecnica")}
      </button>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button type="button" onClick={handleSave} disabled={isPending || tecnicas.length === 0}>
          {isPending ? tc("saving") : t("saveTecnicas")}
        </Button>
        {status === "success" && (
          <span className="flex items-center gap-1.5 text-[14px] text-emerald-600">
            <CheckCircle2 className="size-4" />{tc("saved")}
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
