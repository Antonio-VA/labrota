"use client"

import { useState, useTransition, useRef, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Plus, Trash2, GripVertical, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Department } from "@/lib/types/database"
import { saveDepartments, seedDefaultDepartments } from "@/app/(clinic)/lab/department-actions"
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

function ColorCircle({ value, onChange, disabled }: {
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

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className="size-5 rounded-full border-2 border-background ring-1 ring-border hover:ring-primary transition-shadow disabled:opacity-50"
        style={{ backgroundColor: value }}
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
                  c === value && "ring-2 ring-primary ring-offset-1 ring-offset-background"
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

// ── Types ────────────────────────────────────────────────────────────────────

type Draft = {
  id?: string
  sortId: string
  code: string
  name: string
  name_en: string
  abbreviation: string
  colour: string
  is_default: boolean
  sort_order: number
  parent_id: string | null
}

// ── Sortable row ─────────────────────────────────────────────────────────────

function SortableRow({ dept, onChange, onDelete, disabled, isChild }: {
  dept: Draft; onChange: (d: Draft) => void; onDelete: () => void; disabled: boolean; isChild?: boolean
}) {
  const t = useTranslations("departments")
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: dept.sortId })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("flex items-center gap-2 p-2 rounded-lg border border-border bg-background", isChild && "ml-6")}
    >
      {/* Drag handle */}
      <button
        type="button"
        className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground hover:text-foreground touch-none"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      {/* Color · Name · Abbreviation */}
      <ColorCircle value={dept.colour} onChange={(c) => onChange({ ...dept, colour: c })} disabled={disabled} />
      <Input
        value={dept.name}
        onChange={(e) => onChange({ ...dept, name: e.target.value, name_en: e.target.value })}
        disabled={disabled}
        placeholder={t("namePlaceholder")}
        className="h-7 text-[13px] flex-1"
      />
      <Input
        value={dept.abbreviation}
        onChange={(e) => onChange({ ...dept, abbreviation: e.target.value.toUpperCase().slice(0, 3) })}
        disabled={disabled}
        placeholder="ABR"
        maxLength={3}
        className="h-7 text-[13px] font-mono uppercase w-[64px] shrink-0"
      />

      {/* Preview pill */}
      <span
        className="text-[11px] font-medium text-foreground border border-border bg-background px-1.5 py-0.5 shrink-0"
        style={{ borderLeft: `3px solid ${dept.colour}`, borderRadius: 4 }}
      >
        {dept.abbreviation || dept.name.slice(0, 3) || "—"}
      </span>

      {/* Delete */}
      {!dept.is_default ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onDelete}
          className="shrink-0 p-1 rounded text-muted-foreground/30 hover:text-destructive transition-colors disabled:opacity-50"
        >
          <Trash2 className="size-3.5" />
        </button>
      ) : (
        <div className="size-[26px] shrink-0" /> /* spacer to keep alignment */
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

let _counter = 0

export function DepartmentsTab({ initialDepartments }: { initialDepartments: Department[] }) {
  const t = useTranslations("departments")
  const tc = useTranslations("common")
  const [departments, setDepartments] = useState<Draft[]>(
    initialDepartments.map((d) => ({
      id: d.id, sortId: d.id || `init-${_counter++}`,
      code: d.code, name: d.name, name_en: d.name_en,
      abbreviation: d.abbreviation, colour: d.colour,
      is_default: d.is_default, sort_order: d.sort_order,
      parent_id: d.parent_id ?? null,
    }))
  )
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  )

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setDepartments((prev) => {
      const oldIndex = prev.findIndex((d) => d.sortId === active.id)
      const newIndex = prev.findIndex((d) => d.sortId === over.id)
      return arrayMove(prev, oldIndex, newIndex).map((d, i) => ({ ...d, sort_order: i }))
    })
  }

  function handleSeed() {
    if (departments.length > 0 && !confirm(t("loadDefaultsConfirm"))) return
    startTransition(async () => {
      const result = await seedDefaultDepartments()
      if (result.error) { setErrorMsg(result.error); setStatus("error"); return }
      if (result.seeded) window.location.reload()
    })
  }

  function addRow(parentId: string | null = null) {
    const sortId = `new-${_counter++}`
    const parent = parentId ? departments.find((d) => d.id === parentId || d.sortId === parentId) : null
    setDepartments((prev) => [
      ...prev,
      { sortId, code: `dept_${Date.now()}`, name: "", name_en: "", abbreviation: "",
        colour: parent?.colour ?? COLOR_PALETTE[prev.length % COLOR_PALETTE.length], is_default: false, sort_order: prev.length,
        parent_id: parentId },
    ])
  }

  const updateRow = useCallback((sortId: string, draft: Draft) => {
    setDepartments((prev) => prev.map((d) => d.sortId === sortId ? draft : d))
  }, [])

  function deleteRow(sortId: string) {
    setDepartments((prev) => prev.filter((d) => d.sortId !== sortId).map((d, i) => ({ ...d, sort_order: i })))
  }

  function handleSave() {
    for (const d of departments) {
      if (!d.name.trim()) {
        setErrorMsg(t("allNeedName"))
        setStatus("error")
        return
      }
    }
    const abbrs = departments.map((d) => d.abbreviation.toUpperCase()).filter(Boolean)
    if (new Set(abbrs).size !== abbrs.length) {
      setErrorMsg(t("duplicateAbbr"))
      setStatus("error")
      return
    }

    setStatus("idle")
    startTransition(async () => {
      const result = await saveDepartments(departments.map((d, i) => ({
        id: d.id, code: d.code, name: d.name.trim(), name_en: d.name_en.trim(),
        abbreviation: d.abbreviation.trim().toUpperCase().slice(0, 3),
        colour: d.colour, is_default: d.is_default, sort_order: i,
        parent_id: d.parent_id ?? null,
      })))
      if (result.error) {
        setErrorMsg(result.error)
        setStatus("error")
      } else {
        setStatus("success")
        setTimeout(() => setStatus("idle"), 3000)
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {departments.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-6 text-center">
          <p className="text-[14px] text-muted-foreground mb-3">{t("noDepartments")}</p>
          <Button type="button" variant="outline" size="sm" onClick={handleSeed} disabled={isPending}>
            {t("loadDefaults")}
          </Button>
        </div>
      )}
      {departments.length > 0 && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={handleSeed} disabled={isPending} className="text-[12px] text-muted-foreground">
            {t("loadDefaultsShort")}
          </Button>
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={departments.map((d) => d.sortId)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {/* Render parents first, then their children */}
            {departments.filter((d) => !d.parent_id).map((dept) => {
              const children = departments.filter((d) => d.parent_id === dept.id || d.parent_id === dept.sortId)
              return (
                <div key={dept.sortId} className="flex flex-col gap-1.5">
                  <SortableRow
                    dept={dept}
                    onChange={(draft) => updateRow(dept.sortId, draft)}
                    onDelete={() => deleteRow(dept.sortId)}
                    disabled={isPending}
                  />
                  {children.map((child) => (
                    <SortableRow
                      key={child.sortId}
                      dept={child}
                      onChange={(draft) => updateRow(child.sortId, draft)}
                      onDelete={() => deleteRow(child.sortId)}
                      disabled={isPending}
                      isChild
                    />
                  ))}
                  {!isPending && (
                    <button
                      type="button"
                      onClick={() => addRow(dept.id ?? dept.sortId)}
                      className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors ml-6 py-0.5"
                    >
                      <Plus className="size-3" />
                      {t("addSubDepartment")}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      <button type="button" onClick={() => addRow(null)} disabled={isPending}
        className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 py-1">
        <Plus className="size-3.5" />
        {t("addDepartment")}
      </button>

      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button type="button" onClick={handleSave} disabled={isPending || departments.length === 0}>
          {isPending ? tc("saving") : t("saveDepartments")}
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
