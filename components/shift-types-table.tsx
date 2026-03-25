"use client"

import { useState, useRef, useTransition } from "react"
import { GripVertical, Plus, X, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { saveShiftTypes, countAssignmentsForShift } from "@/app/(clinic)/lab/shift-type-actions"
import type { ShiftTypeDefinition } from "@/lib/types/database"
import { cn } from "@/lib/utils"

interface ShiftRow {
  id: string           // local id (may be DB id or temp)
  code: string
  name_es: string
  name_en: string
  start_time: string
  end_time: string
  isNew: boolean       // true = not yet saved to DB
}

function rowFromDefinition(def: ShiftTypeDefinition): ShiftRow {
  return {
    id: def.id,
    code: def.code,
    name_es: def.name_es,
    name_en: def.name_en,
    start_time: def.start_time,
    end_time: def.end_time,
    isNew: false,
  }
}

let nextLocalId = 0
function newRow(): ShiftRow {
  return {
    id: `new-${++nextLocalId}`,
    code: "",
    name_es: "",
    name_en: "",
    start_time: "07:30",
    end_time: "15:30",
    isNew: true,
  }
}

export function ShiftTypesTable({ initialTypes }: { initialTypes: ShiftTypeDefinition[] }) {
  const [rows, setRows] = useState<ShiftRow[]>(initialTypes.map(rowFromDefinition))
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; count: number } | null>(null)

  // Drag state
  const dragIdx = useRef<number | null>(null)

  // ── Validation ────────────────────────────────────────────────────────────
  const codes = rows.map((r) => r.code.trim().toUpperCase())
  const duplicateCodes = new Set(
    codes.filter((c, i) => c && codes.indexOf(c) !== i)
  )
  const hasErrors = rows.some((r) => {
    const code = r.code.trim()
    if (!code || code.length > 3) return true
    if (duplicateCodes.has(code.toUpperCase())) return true
    if (r.start_time >= r.end_time) return true
    return false
  })

  // ── Row mutations ─────────────────────────────────────────────────────────
  function updateRow(id: string, patch: Partial<ShiftRow>) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r))
  }

  function addRow() {
    setRows((prev) => [...prev, newRow()])
  }

  function removeRow(id: string) {
    setRows((prev) => prev.filter((r) => r.id !== id))
    if (confirmDelete?.id === id) setConfirmDelete(null)
  }

  async function handleDeleteClick(row: ShiftRow) {
    if (row.isNew) {
      removeRow(row.id)
      return
    }
    // Check active assignments
    const count = await countAssignmentsForShift(row.code)
    if (count > 0) {
      setConfirmDelete({ id: row.id, count })
    } else {
      removeRow(row.id)
    }
  }

  // ── Drag-to-reorder ───────────────────────────────────────────────────────
  function onDragStart(idx: number) {
    dragIdx.current = idx
  }

  function onDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    const from = dragIdx.current
    if (from === null || from === idx) return
    setRows((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(idx, 0, moved)
      return next
    })
    dragIdx.current = idx
  }

  function onDragEnd() {
    dragIdx.current = null
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  function handleSave() {
    setStatus("idle")
    startTransition(async () => {
      const types = rows.map((r) => ({
        code: r.code.trim().toUpperCase(),
        name_es: r.name_es.trim(),
        name_en: r.name_en.trim() || r.name_es.trim(),
        start_time: r.start_time,
        end_time: r.end_time,
        sort_order: 0, // overwritten by saveShiftTypes
        active: true,
      }))
      const result = await saveShiftTypes(types)
      if (result.error) {
        setErrorMsg(result.error)
        setStatus("error")
      } else {
        setStatus("success")
        // Mark all as saved
        setRows((prev) => prev.map((r) => ({ ...r, isNew: false })))
        setTimeout(() => setStatus("idle"), 3000)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Column headers */}
      <div className="grid grid-cols-[1.5rem_3rem_6rem_6rem_1fr_1.5rem] gap-2 items-center pb-1.5 border-b border-border">
        <span />
        <span className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide text-center">Código</span>
        <span className="text-[12px] text-muted-foreground text-center">Inicio</span>
        <span className="text-[12px] text-muted-foreground text-center">Fin</span>
        <span className="text-[12px] text-muted-foreground text-center">Nombre</span>
        <span />
      </div>

      {/* Shift rows */}
      <div className="flex flex-col gap-1.5">
        {rows.map((row, idx) => {
          const code = row.code.trim().toUpperCase()
          const isDuplicate = code && duplicateCodes.has(code)
          const timeError = row.start_time && row.end_time && row.start_time >= row.end_time
          const codeError = row.code && (row.code.length > 3 || isDuplicate)

          return (
            <div key={row.id}>
              <div
                className="grid grid-cols-[1.5rem_3rem_6rem_6rem_1fr_1.5rem] gap-2 items-center"
                draggable
                onDragStart={() => onDragStart(idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDragEnd={onDragEnd}
              >
                {/* Drag handle */}
                <GripVertical className="size-4 text-muted-foreground/50 cursor-grab active:cursor-grabbing" />

                {/* Code */}
                <div>
                  <Input
                    value={row.code}
                    onChange={(e) => updateRow(row.id, { code: e.target.value.slice(0, 3) })}
                    disabled={isPending}
                    maxLength={3}
                    className={cn(
                      "text-center text-[13px] font-mono font-medium uppercase px-1",
                      codeError && "border-destructive focus:ring-destructive/30"
                    )}
                    placeholder="T1"
                  />
                </div>

                {/* Start time */}
                <Input
                  type="time"
                  value={row.start_time}
                  onChange={(e) => updateRow(row.id, { start_time: e.target.value })}
                  disabled={isPending}
                  className={cn("text-center text-[13px] px-1", timeError && "border-destructive")}
                />

                {/* End time */}
                <Input
                  type="time"
                  value={row.end_time}
                  onChange={(e) => updateRow(row.id, { end_time: e.target.value })}
                  disabled={isPending}
                  className={cn("text-center text-[13px] px-1", timeError && "border-destructive")}
                />

                {/* ES name */}
                <Input
                  value={row.name_es}
                  onChange={(e) => updateRow(row.id, { name_es: e.target.value })}
                  disabled={isPending}
                  className="text-[13px]"
                  maxLength={30}
                  placeholder="Mañana"
                />

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDeleteClick(row)}
                  disabled={isPending}
                  className="text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center"
                  aria-label="Eliminar turno"
                >
                  <X className="size-3.5" />
                </button>
              </div>

              {/* Inline validation messages */}
              {isDuplicate && (
                <p className="text-[11px] text-destructive pl-8 -mt-0.5">Código duplicado</p>
              )}
              {timeError && (
                <p className="text-[11px] text-destructive pl-8 -mt-0.5">La hora de inicio debe ser anterior a la de fin</p>
              )}

              {/* Delete confirm */}
              {confirmDelete?.id === row.id && (
                <div className="ml-8 mt-1 p-2.5 rounded-lg border border-amber-300 bg-amber-50 flex flex-col gap-2">
                  <p className="text-[12px] text-amber-800">
                    Este turno tiene <strong>{confirmDelete.count}</strong> asignaciones activas. Eliminar afectará a las guardias existentes. ¿Continuar?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      className="text-[12px] font-medium text-destructive hover:underline"
                    >
                      Sí, eliminar
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="text-[12px] text-muted-foreground hover:underline"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Add row */}
      <button
        type="button"
        onClick={addRow}
        disabled={isPending}
        className="flex items-center gap-1.5 text-[13px] text-primary hover:underline self-start"
      >
        <Plus className="size-3.5" />
        Añadir turno
      </button>

      {/* Save footer */}
      <div className="flex items-center gap-3 pt-1">
        <Button onClick={handleSave} disabled={isPending || hasErrors} size="sm">
          {isPending ? "Guardando…" : "Guardar turnos"}
        </Button>
        {status === "success" && (
          <span className="flex items-center gap-1.5 text-[13px] text-emerald-600">
            <CheckCircle2 className="size-3.5" />
            Guardado
          </span>
        )}
        {status === "error" && (
          <span className="flex items-center gap-1.5 text-[13px] text-destructive">
            <AlertCircle className="size-3.5" />
            {errorMsg}
          </span>
        )}
      </div>
    </div>
  )
}
