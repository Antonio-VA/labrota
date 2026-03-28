"use client"

import { useState, useTransition, useRef, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Plus, Trash2, GripVertical, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { bulkSaveTecnicas, seedDefaultTecnicas } from "@/app/(clinic)/lab/tecnicas-actions"
import type { Tecnica, Department } from "@/lib/types/database"
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove, SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

// ── Color palette ────────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316", "#EC4899",
  "#06B6D4", "#84CC16", "#6366F1", "#D946EF", "#0EA5E9", "#22C55E", "#A855F7", "#F43F5E",
  "#64748B", "#78716C", "#0D9488", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#CA8A04",
]

const LEGACY_COLOR_HEX: Record<string, string> = {
  amber: "#F59E0B", blue: "#3B82F6", green: "#10B981", purple: "#8B5CF6",
  coral: "#EF4444", teal: "#14B8A6", slate: "#64748B", red: "#EF4444",
}
function resolveHex(color: string): string {
  if (color.startsWith("#")) return color
  return LEGACY_COLOR_HEX[color] ?? "#64748B"
}

export type TecnicaColor = string

// ── Color picker ─────────────────────────────────────────────────────────────

function ColorPicker({ value, onChange, disabled }: {
  value: string; onChange: (c: string) => void; disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])
  const hex = resolveHex(value)
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" disabled={disabled} onClick={() => setOpen(!open)}
        className="size-6 rounded-full border-2 border-background ring-1 ring-border hover:ring-primary transition-shadow disabled:opacity-50"
        style={{ backgroundColor: hex }}
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-[200px]">
          <div className="grid grid-cols-8 gap-1">
            {COLOR_PALETTE.map((c) => (
              <button key={c} type="button" onClick={() => { onChange(c); setOpen(false) }}
                className={cn("size-5 rounded-full transition-transform hover:scale-125", c === hex && "ring-2 ring-primary ring-offset-1 ring-offset-background")}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Draft type ───────────────────────────────────────────────────────────────

type Draft = {
  id?: string
  sortId: string
  nombre_es: string; nombre_en: string; codigo: string
  color: string; department: "lab" | "andrology"; typical_shifts: string[]; activa: boolean; orden: number
}

// ── Table grid ───────────────────────────────────────────────────────────────
// Columns: color(28px) | name(flex) | code(80px) | dept(120px) | shifts(flex) | actions(72px)
const GRID = "28px minmax(100px,1fr) 80px 120px minmax(80px,1fr) 72px"

// ── Sortable table row ───────────────────────────────────────────────────────

function SortableRow({
  tecnica, onChange, onDelete, disabled, shiftCodes, departments, even,
}: {
  tecnica: Draft
  onChange: (t: Draft) => void; onDelete: () => void
  disabled: boolean; shiftCodes: string[]; departments: Department[]
  even: boolean
}) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: tecnica.sortId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.6 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, gridTemplateColumns: GRID }}
      className={cn(
        "grid items-center px-2 py-1.5 min-h-[40px] border-b border-border/50",
        even ? "bg-muted/20" : "bg-background",
        isDragging && "shadow-md rounded-md"
      )}
    >
      {/* Color dot */}
      <ColorPicker value={tecnica.color} onChange={(c) => onChange({ ...tecnica, color: c })} disabled={disabled} />

      {/* Name */}
      <input
        value={tecnica.nombre_es}
        onChange={(e) => onChange({ ...tecnica, nombre_es: e.target.value, nombre_en: e.target.value })}
        disabled={disabled}
        placeholder="ICSI"
        className="bg-transparent text-[13px] font-medium outline-none border-b border-transparent focus:border-primary px-1 h-7 w-full"
      />

      {/* Code */}
      <input
        value={tecnica.codigo}
        onChange={(e) => onChange({ ...tecnica, codigo: e.target.value.toUpperCase().slice(0, 3) })}
        disabled={disabled}
        placeholder="OPU"
        maxLength={3}
        className="bg-transparent text-[13px] font-mono uppercase outline-none border-b border-transparent focus:border-primary px-1 h-7 w-full text-center"
      />

      {/* Department (multi-select pills, root departments only) */}
      <div className="flex gap-0.5 items-center flex-wrap">
        {(departments.length > 0 ? departments.filter((d) => !d.parent_id) : [{ id: "lab", code: "lab", name: "Embr." } as any, { id: "andrology", code: "andrology", name: "Andr." } as any]).map((d: Department) => {
          const deptCodes = tecnica.department.split(",").filter(Boolean)
          const active = deptCodes.includes(d.code)
          return (
            <button
              key={d.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                let next: string[]
                if (active) {
                  next = deptCodes.filter((c) => c !== d.code)
                  if (next.length === 0) return // must have at least one
                } else {
                  next = [...deptCodes, d.code]
                }
                onChange({ ...tecnica, department: next.join(",") as any })
              }}
              className={cn(
                "h-5 px-1.5 rounded text-[10px] font-semibold border transition-colors disabled:opacity-50",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-transparent text-muted-foreground border-border hover:border-primary/40"
              )}
            >
              {d.abbreviation || d.name?.slice(0, 4)}
            </button>
          )
        })}
      </div>

      {/* Typical shifts */}
      <div className="flex gap-0.5 items-center">
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
                "h-5 px-1.5 rounded text-[10px] font-semibold border transition-colors disabled:opacity-50",
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

      {/* Actions: delete + drag handle */}
      <div className="flex items-center justify-end gap-1">
        <button
          type="button" disabled={disabled} onClick={onDelete}
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-30"
        >
          <Trash2 className="size-3.5" />
        </button>
        <button
          type="button"
          className="p-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

let _counter = 0

export function TécnicasTab({ initialTecnicas, shiftCodes = ["T1", "T2", "T3"], departments = [] }: { initialTecnicas: Tecnica[]; shiftCodes?: string[]; departments?: Department[] }) {
  const t = useTranslations("tecnicas")
  const tc = useTranslations("common")
  const [tecnicas, setTecnicas] = useState<Draft[]>(
    initialTecnicas.map((t) => ({
      id:             t.id,
      sortId:         t.id || `init-${_counter++}`,
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    // Find which department group the active item belongs to
    const activeItem = tecnicas.find((t) => t.sortId === active.id)
    const overItem = tecnicas.find((t) => t.sortId === over.id)
    if (!activeItem || !overItem) return
    // Prevent cross-dept drag: check if they share at least one department
    const activeDepts = activeItem.department.split(",")
    const overDepts = overItem.department.split(",")
    if (!activeDepts.some((d) => overDepts.includes(d))) return
    setTecnicas((prev) => {
      const oldIndex = prev.findIndex((t) => t.sortId === active.id)
      const newIndex = prev.findIndex((t) => t.sortId === over.id)
      return arrayMove(prev, oldIndex, newIndex).map((t, i) => ({ ...t, orden: i }))
    })
  }

  function addRow(dept: string = "lab") {
    const sortId = `new-${_counter++}`
    setTecnicas((prev) => [
      ...prev,
      {
        sortId,
        nombre_es: "", nombre_en: "", codigo: "",
        color: COLOR_PALETTE[prev.length % COLOR_PALETTE.length],
        department: dept as any, typical_shifts: [], activa: true,
        orden: prev.length,
      },
    ])
  }

  const updateRow = useCallback((sortId: string, draft: Draft) => {
    setTecnicas((prev) => prev.map((t) => t.sortId === sortId ? draft : t))
  }, [])

  function deleteRow(sortId: string) {
    const toDelete = tecnicas.find((t) => t.sortId === sortId)
    if (toDelete?.id) setDeletedIds((prev) => [...prev, toDelete.id!])
    setTecnicas((prev) => prev.filter((t) => t.sortId !== sortId).map((t, i) => ({ ...t, orden: i })))
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
      setTecnicas((prev) =>
        prev.map((t, i) => ({ ...t, id: t.id ?? result.ids[i], sortId: t.id ?? result.ids[i] ?? t.sortId }))
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

  // Group by department (root departments only, multi-dept técnicas appear in first matching group)
  const rootDepts = departments.length > 0
    ? departments.filter((d) => !d.parent_id)
    : [{ id: "lab", code: "lab", name: t("embriologia") } as Department, { id: "andrology", code: "andrology", name: t("andrologia") } as Department]
  const assigned = new Set<string>()
  const deptGroups = rootDepts.map((d) => {
    const items = tecnicas.filter((tc) => {
      if (assigned.has(tc.sortId)) return false
      const codes = tc.department.split(",").filter(Boolean)
      if (codes.includes(d.code)) { assigned.add(tc.sortId); return true }
      return false
    })
    return { code: d.code, name: d.name, items }
  })

  return (
    <div className="flex flex-col gap-2">
      {tecnicas.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-[14px] text-muted-foreground mb-3">{t("noTecnicas")}</p>
          <Button type="button" variant="outline" size="sm" onClick={handleSeed} disabled={isPending}>
            {t("loadDefaults")}
          </Button>
        </div>
      )}

      {/* Table header */}
      {tecnicas.length > 0 && (
        <div className="grid items-center px-2 py-1.5" style={{ gridTemplateColumns: GRID }}>
          <span />
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("nameEs")}</span>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide text-center">{t("shortName")}</span>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("department")}</span>
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{t("typicalShift")}</span>
          <span />
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {deptGroups.map((group) => (
          <div key={group.code}>
            {/* Department group header */}
            <div className="sticky top-0 z-[5] bg-muted/60 px-2 py-1.5 border-b border-border">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{group.name}</span>
              <span className="text-[11px] text-muted-foreground/60 ml-2">{group.items.length}</span>
            </div>

            <SortableContext items={group.items.map((t) => t.sortId)} strategy={verticalListSortingStrategy}>
              {group.items.map((tec, idx) => (
                <SortableRow
                  key={tec.sortId}
                  tecnica={tec}
                  onChange={(draft) => updateRow(tec.sortId, draft)}
                  onDelete={() => deleteRow(tec.sortId)}
                  disabled={isPending}
                  shiftCodes={shiftCodes}
                  departments={departments}
                  even={idx % 2 === 0}
                />
              ))}
            </SortableContext>

            {/* Add row within this department */}
            <button
              type="button"
              onClick={() => addRow(group.code)}
              disabled={isPending}
              className="flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 py-2 px-2 w-full border-b border-border/30"
            >
              <Plus className="size-3" />
              {t("addTecnica")}
            </button>
          </div>
        ))}
      </DndContext>

      {/* Footer */}
      <div className="flex items-center gap-3 pt-3 border-t border-border">
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
