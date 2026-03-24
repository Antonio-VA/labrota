"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { Plus, Trash2, ChevronUp, ChevronDown, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { Department } from "@/lib/types/database"
import { saveDepartments, seedDefaultDepartments } from "@/app/(clinic)/lab/department-actions"

const COLOUR_PRESETS = [
  { hex: "#60A5FA", label: "Azul" },
  { hex: "#34D399", label: "Esmeralda" },
  { hex: "#94A3B8", label: "Gris" },
  { hex: "#F59E0B", label: "Ámbar" },
  { hex: "#EF4444", label: "Rojo" },
  { hex: "#A855F7", label: "Púrpura" },
  { hex: "#EC4899", label: "Rosa" },
  { hex: "#14B8A6", label: "Teal" },
]

type Draft = {
  id?: string
  code: string
  name: string
  name_en: string
  abbreviation: string
  colour: string
  is_default: boolean
  sort_order: number
}

export function DepartmentsTab({ initialDepartments }: { initialDepartments: Department[] }) {
  const t = useTranslations("departments")
  const tc = useTranslations("common")
  const [departments, setDepartments] = useState<Draft[]>(
    initialDepartments.map((d) => ({
      id: d.id, code: d.code, name: d.name, name_en: d.name_en,
      abbreviation: d.abbreviation, colour: d.colour,
      is_default: d.is_default, sort_order: d.sort_order,
    }))
  )
  const [isPending, startTransition] = useTransition()
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMsg, setErrorMsg] = useState("")

  function handleSeed() {
    if (departments.length > 0 && !confirm("Esto reemplazará los departamentos actuales con los valores predeterminados. ¿Continuar?")) return
    startTransition(async () => {
      const result = await seedDefaultDepartments()
      if (result.error) { setErrorMsg(result.error); setStatus("error"); return }
      if (result.seeded) window.location.reload()
    })
  }

  function addRow() {
    const nextOrder = departments.length
    const nextCode = `dept_${Date.now()}`
    setDepartments((prev) => [
      ...prev,
      { code: nextCode, name: "", name_en: "", abbreviation: "", colour: "#94A3B8", is_default: false, sort_order: nextOrder },
    ])
  }

  function updateRow(index: number, draft: Draft) {
    setDepartments((prev) => prev.map((d, i) => i === index ? draft : d))
  }

  function moveUp(index: number) {
    if (index === 0) return
    setDepartments((prev) => {
      const next = [...prev]
      ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
      return next.map((d, i) => ({ ...d, sort_order: i }))
    })
  }

  function moveDown(index: number) {
    if (index === departments.length - 1) return
    setDepartments((prev) => {
      const next = [...prev]
      ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
      return next.map((d, i) => ({ ...d, sort_order: i }))
    })
  }

  function deleteRow(index: number) {
    setDepartments((prev) => prev.filter((_, i) => i !== index).map((d, i) => ({ ...d, sort_order: i })))
  }

  function handleSave() {
    // Validation
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
        id: d.id,
        code: d.code,
        name: d.name.trim(),
        name_en: d.name_en.trim(),
        abbreviation: d.abbreviation.trim().toUpperCase().slice(0, 3),
        colour: d.colour,
        is_default: d.is_default,
        sort_order: i,
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
          <p className="text-[14px] text-muted-foreground mb-3">No hay departamentos definidos.</p>
          <Button type="button" variant="outline" size="sm" onClick={handleSeed} disabled={isPending}>
            Cargar defaults (Embriología, Andrología, Admin)
          </Button>
        </div>
      )}
      {departments.length > 0 && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={handleSeed} disabled={isPending} className="text-[12px] text-muted-foreground">
            Cargar defaults
          </Button>
        </div>
      )}
      {departments.map((dept, i) => (
        <div key={dept.id ?? `new-${i}`} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background">
          {/* Reorder */}
          <div className="flex flex-col gap-0.5 pt-1 shrink-0">
            <button type="button" disabled={isPending || i === 0} onClick={() => moveUp(i)}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronUp className="size-3.5" />
            </button>
            <button type="button" disabled={isPending || i === departments.length - 1} onClick={() => moveDown(i)}
              className="p-0.5 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronDown className="size-3.5" />
            </button>
          </div>

          {/* Colour + fields */}
          <div className="flex-1 flex flex-col gap-2">
            <div className="grid grid-cols-[1fr_1fr_80px] gap-2">
              <Input value={dept.name} onChange={(e) => updateRow(i, { ...dept, name: e.target.value })}
                disabled={isPending} placeholder={t("nameEs")} className="h-8 text-[13px]" />
              <Input value={dept.name_en} onChange={(e) => updateRow(i, { ...dept, name_en: e.target.value })}
                disabled={isPending} placeholder={t("nameEn")} className="h-8 text-[13px]" />
              <Input value={dept.abbreviation} onChange={(e) => updateRow(i, { ...dept, abbreviation: e.target.value.toUpperCase().slice(0, 3) })}
                disabled={isPending} placeholder={t("abbreviation")} maxLength={3} className="h-8 text-[13px] font-mono uppercase" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex gap-1.5">
                {COLOUR_PRESETS.map((c) => (
                  <button key={c.hex} type="button" disabled={isPending} onClick={() => updateRow(i, { ...dept, colour: c.hex })}
                    title={c.label}
                    className={cn(
                      "size-5 rounded-full border-2 transition-all disabled:opacity-50",
                      dept.colour === c.hex ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                    )}
                    style={{ background: c.hex }}
                  />
                ))}
              </div>
              {dept.is_default && (
                <span className="text-[10px] text-muted-foreground bg-slate-100 px-1.5 py-0.5 rounded font-medium">Por defecto</span>
              )}
              {/* Preview */}
              <span className="ml-auto text-[11px] font-medium text-foreground border border-border bg-background px-1.5 py-0.5"
                style={{ borderLeft: `3px solid ${dept.colour}`, borderRadius: 4 }}>
                {dept.abbreviation || dept.name.slice(0, 3) || "—"}
              </span>
            </div>
          </div>

          {/* Delete */}
          {!dept.is_default && (
            <button type="button" disabled={isPending} onClick={() => deleteRow(i)}
              className="shrink-0 p-1 rounded text-muted-foreground/30 hover:text-destructive transition-colors disabled:opacity-50 mt-1">
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      ))}

      <button type="button" onClick={addRow} disabled={isPending}
        className="flex items-center gap-2 text-[13px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 py-1">
        <Plus className="size-3.5" />
        Añadir departamento
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
