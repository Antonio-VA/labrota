"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Upload, ArrowLeft, ArrowRight, Check, AlertTriangle, FileSpreadsheet, X, Trash2, Plus } from "lucide-react"
import { getSheetNames, parseSheet, type ParsedRota, type ParsedStaff, type ParsedTechnique, type ParsedShift, type ParsedLeave } from "@/lib/parse-excel-rota"
import { importOrganisation, type ImportPayload } from "@/app/admin/import-actions"

type Step = "upload" | "sheet" | "mapping" | "confirm"
type TechniqueWithColor = ParsedTechnique & { color: string }

const DEFAULT_DEPTS = [
  { name: "Lab", code: "lab", colour: "#2563EB" },
  { name: "Andrology", code: "andrology", colour: "#059669" },
  { name: "Admin", code: "admin", colour: "#64748B" },
  { name: "Transport", code: "transport", colour: "#F59E0B" },
]

const TECHNIQUE_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444", "#14B8A6", "#F97316", "#EC4899",
  "#06B6D4", "#84CC16", "#6366F1", "#D946EF", "#0EA5E9", "#22C55E", "#A855F7", "#F43F5E",
  "#64748B", "#78716C", "#0D9488", "#2563EB", "#7C3AED", "#DB2777", "#EA580C", "#CA8A04",
]

function ColorCirclePicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
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
        onClick={() => setOpen(!open)}
        className="size-6 rounded-full border-2 border-background ring-1 ring-border hover:ring-primary transition-shadow"
        style={{ backgroundColor: value }}
      />
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-background border border-border rounded-lg shadow-lg p-2 w-[200px]">
          <div className="grid grid-cols-8 gap-1">
            {TECHNIQUE_COLORS.map((c) => (
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

export function AdminImportWizard({ orgName: externalOrgName }: { orgName?: string }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>("upload")
  const [isPending, startTransition] = useTransition()

  // Upload state
  const [buffer, setBuffer] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState("")
  const [sheets, setSheets] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState("")
  const [error, setError] = useState("")

  // Parsed state
  const [parsed, setParsed] = useState<ParsedRota | null>(null)
  const [orgName, setOrgName] = useState("")
  const [mode, setMode] = useState<"by_task" | "by_shift">("by_shift")
  const [staff, setStaff] = useState<ParsedStaff[]>([])
  const [depts, setDepts] = useState(DEFAULT_DEPTS)
  const [techniques, setTechniques] = useState<TechniqueWithColor[]>([])
  const [shifts, setShifts] = useState<ParsedShift[]>([])
  const [leaves, setLeaves] = useState<ParsedLeave[]>([])

  const fileRef = useRef<HTMLInputElement>(null)

  // ── Upload handler ──────────────────────────────────────────────────────
  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError("")
    setFileName(file.name)

    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const buf = ev.target?.result as ArrayBuffer
        setBuffer(buf)
        const names = await getSheetNames(buf)
        setSheets(names)
        if (names.length === 1) {
          setSelectedSheet(names[0])
          await doParse(buf, names[0])
        } else if (names.length > 1) {
          setSelectedSheet(names[0])
          setStep("sheet")
        } else {
          setError("No sheets found in file.")
        }
      } catch {
        setError("This file could not be read. Please upload a valid .xls or .xlsx file.")
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function doParse(buf: ArrayBuffer, sheet: string) {
    try {
      const result = await parseSheet(buf, sheet)
      setParsed(result)
      setOrgName(externalOrgName || sheet || fileName.replace(/\.(xlsx?)/i, ""))
      setMode(result.mode)
      setStaff(result.staff)
      setTechniques(result.techniques.map((t, i) => ({ ...t, color: TECHNIQUE_COLORS[i % TECHNIQUE_COLORS.length] })))
      setShifts(result.shifts.length > 0 ? result.shifts : [{ name: "T1", start: "07:30", end: "15:30" }])
      setLeaves(result.leaves)
      setStep("mapping")
    } catch {
      setError("Could not parse this sheet.")
    }
  }

  // ── Confirm + create ────────────────────────────────────────────────────
  function handleCreate() {
    startTransition(async () => {
      try {
        const payload: ImportPayload = {
          orgName,
          mode,
          staff,
          departments: depts,
          techniques: techniques.map((t) => ({ ...t, color: t.color })),
          shifts,
          leaves,
          assignments: parsed?.assignments ?? [],
          weekStart: parsed?.weekStart ?? new Date().toISOString().split("T")[0],
        }
        const result = await importOrganisation(payload)
        if (result.error) { toast.error(result.error); return }
        toast.success("Organización creada desde Excel")
        if (result.orgId) router.push(`/admin/orgs/${result.orgId}`)
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error creando la organización")
      }
    })
  }

  // ── Upload step ─────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="flex flex-col items-center gap-6 py-12">
        <FileSpreadsheet className="size-12 text-muted-foreground" />
        <div className="text-center">
          <p className="text-[16px] font-medium">Importar desde Excel</p>
          <p className="text-[13px] text-muted-foreground mt-1">Sube un archivo .xls o .xlsx con el horario del laboratorio</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx"
          onChange={handleFile}
          className="hidden"
        />
        <Button onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" />
          Seleccionar archivo
        </Button>
        {error && (
          <div className="flex items-center gap-2 text-[13px] text-destructive">
            <AlertTriangle className="size-4" />
            {error}
          </div>
        )}
      </div>
    )
  }

  // ── Sheet selection ─────────────────────────────────────────────────────
  if (step === "sheet") {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <p className="text-[16px] font-medium">Seleccionar hoja</p>
          <p className="text-[13px] text-muted-foreground mt-1">Este archivo contiene varias hojas. ¿Cuál quieres importar?</p>
        </div>
        <div className="flex flex-col gap-2">
          {sheets.map((s) => (
            <label key={s} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
              <input
                type="radio"
                name="sheet"
                checked={selectedSheet === s}
                onChange={() => setSelectedSheet(s)}
                className="accent-primary"
              />
              <span className="text-[14px]">{s}</span>
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setStep("upload")}><ArrowLeft className="size-4" /> Volver</Button>
          <Button onClick={() => buffer && doParse(buffer, selectedSheet)}>
            Continuar <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ── Mapping screen ──────────────────────────────────────────────────────
  if (step === "mapping") {
    return (
      <div className="flex flex-col gap-6">
        {/* Mode */}
        <div>
          <label className="text-[13px] font-medium text-muted-foreground">Modo detectado</label>
          <div className="flex items-center gap-3 mt-1">
            <span className={cn("text-[14px] font-medium", mode === "by_task" ? "text-primary" : "text-muted-foreground")}>
              {mode === "by_task" ? "Por tarea" : "Por turno"}
            </span>
            <button
              onClick={() => setMode((m) => m === "by_task" ? "by_shift" : "by_task")}
              className="text-[12px] text-muted-foreground hover:text-foreground underline"
            >
              Cambiar
            </button>
          </div>
        </div>

        {/* Staff */}
        <div>
          <p className="text-[13px] font-medium text-muted-foreground mb-2">Personal detectado ({staff.length})</p>
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-muted border-b border-border">
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-16">Iniciales</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Nombre</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">Apellido</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground w-32">Departamento</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s, i) => (
                  <tr key={s.initials} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5 font-mono text-[12px] font-semibold">{s.initials}</td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={s.firstName}
                        onChange={(e) => setStaff((prev) => prev.map((p, j) => j === i ? { ...p, firstName: e.target.value } : p))}
                        placeholder="Nombre"
                        className="h-7 text-[12px]"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={s.lastName}
                        onChange={(e) => setStaff((prev) => prev.map((p, j) => j === i ? { ...p, lastName: e.target.value } : p))}
                        placeholder="Apellido"
                        className="h-7 text-[12px]"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={s.department}
                        onChange={(e) => setStaff((prev) => prev.map((p, j) => j === i ? { ...p, department: e.target.value } : p))}
                        className="h-7 w-full rounded border border-input bg-transparent px-2 text-[12px]"
                      >
                        {depts.map((d) => <option key={d.code} value={d.code}>{d.name}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Départamentos */}
        <div>
          <p className="text-[13px] font-medium text-muted-foreground mb-2">Departamentos ({depts.length})</p>
          <div className="flex flex-col gap-1.5">
            {depts.map((d, i) => (
              <div key={d.code} className="flex items-center gap-2">
                <input type="color" value={d.colour} onChange={(e) => setDepts((prev) => prev.map((p, j) => j === i ? { ...p, colour: e.target.value } : p))} className="size-6 rounded border-0 cursor-pointer" />
                <Input value={d.name} onChange={(e) => setDepts((prev) => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))} className="h-7 text-[12px] flex-1" />
                <button onClick={() => setDepts((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><X className="size-3.5" /></button>
              </div>
            ))}
            <button onClick={() => setDepts((prev) => [...prev, { name: "", code: `dept_${Date.now()}`, colour: "#94A3B8" }])} className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1">
              <Plus className="size-3" /> Añadir departamento
            </button>
          </div>
        </div>

        {/* Techniques (by_task) */}
        {mode === "by_task" && (
          <div>
            <p className="text-[13px] font-medium text-muted-foreground mb-2">Tareas ({techniques.length})</p>
            {techniques.length === 0 && (
              <p className="text-[12px] text-muted-foreground/60 italic">No se detectaron tareas en el archivo.</p>
            )}
            <div className="flex flex-col gap-2">
              {techniques.map((t, i) => (
                <div key={i} className="rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2 mb-1">
                    <ColorCirclePicker
                      value={t.color}
                      onChange={(c) => setTechniques((prev) => prev.map((p, j) => j === i ? { ...p, color: c } : p))}
                    />
                    <Input
                      value={t.name}
                      onChange={(e) => setTechniques((prev) => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                      className="h-7 text-[13px] flex-1"
                    />
                    <button onClick={() => setTechniques((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0"><X className="size-3.5" /></button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {staff.map((s) => {
                      const qualified = t.qualifiedInitials.includes(s.initials)
                      return (
                        <button
                          key={s.initials}
                          onClick={() => setTechniques((prev) => prev.map((p, j) => j === i ? {
                            ...p,
                            qualifiedInitials: qualified
                              ? p.qualifiedInitials.filter((q) => q !== s.initials)
                              : [...p.qualifiedInitials, s.initials],
                          } : p))}
                          className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-semibold border transition-colors",
                            qualified ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-muted-foreground border-border"
                          )}
                        >
                          {s.initials}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Shifts (by_shift) */}
        {mode === "by_shift" && (
          <div>
            <p className="text-[13px] font-medium text-muted-foreground mb-2">Turnos ({shifts.length})</p>
            <div className="flex flex-col gap-2">
              {shifts.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={s.name}
                    onChange={(e) => setShifts((prev) => prev.map((p, j) => j === i ? { ...p, name: e.target.value } : p))}
                    className="h-7 text-[13px] flex-1"
                  />
                  <Input
                    value={s.start}
                    onChange={(e) => setShifts((prev) => prev.map((p, j) => j === i ? { ...p, start: e.target.value } : p))}
                    placeholder="07:00"
                    className="h-7 text-[13px] w-20 text-center"
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    value={s.end}
                    onChange={(e) => setShifts((prev) => prev.map((p, j) => j === i ? { ...p, end: e.target.value } : p))}
                    placeholder="15:00"
                    className="h-7 text-[13px] w-20 text-center"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Leave */}
        {leaves.length > 0 && (
          <div>
            <p className="text-[13px] font-medium text-muted-foreground mb-2">Ausencias detectadas ({leaves.length})</p>
            <div className="flex flex-col gap-1">
              {leaves.map((l, i) => (
                <div key={i} className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium w-12">{l.initials}</span>
                  <span>{l.from} → {l.to || "?"}</span>
                  <select
                    value={l.type}
                    onChange={(e) => setLeaves((prev) => prev.map((p, j) => j === i ? { ...p, type: e.target.value } : p))}
                    className="h-7 rounded border border-input bg-transparent px-2 text-[12px]"
                  >
                    <option value="annual">Vacaciones</option>
                    <option value="sick">Baja médica</option>
                    <option value="personal">Personal</option>
                    <option value="training">Formación</option>
                    <option value="other">Otro</option>
                  </select>
                  <button onClick={() => setLeaves((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rota week */}
        {parsed && parsed.assignments.length > 0 && (
          <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
            <p className="text-[13px] text-muted-foreground">
              La semana del <strong>{parsed.weekStart}</strong> se importará como horario inicial ({parsed.assignments.length} asignaciones).
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setStep(sheets.length > 1 ? "sheet" : "upload")}>
            <ArrowLeft className="size-4" /> Volver
          </Button>
          <Button onClick={() => { if (externalOrgName) setOrgName(externalOrgName); setStep("confirm") }} disabled={!(externalOrgName || orgName).trim()}>
            Revisar <ArrowRight className="size-4" />
          </Button>
        </div>
      </div>
    )
  }

  // ── Confirmation ────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[16px] font-medium">Confirmar importación</p>

      <div className="rounded-lg border border-border bg-background p-4 flex flex-col gap-2">
        <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Organización</span><span className="font-medium">{orgName}</span></div>
        <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Modo</span><span className="font-medium">{mode === "by_task" ? "Por tarea" : "Por turno"}</span></div>
        <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Personal</span><span className="font-medium">{staff.length}</span></div>
        <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Departamentos</span><span className="font-medium">{depts.length}</span></div>
        <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">{mode === "by_task" ? "Tareas" : "Turnos"}</span><span className="font-medium">{mode === "by_task" ? techniques.length : shifts.length}</span></div>
        <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Ausencias</span><span className="font-medium">{leaves.length}</span></div>
        <div className="flex justify-between text-[13px]"><span className="text-muted-foreground">Asignaciones</span><span className="font-medium">{parsed?.assignments.length ?? 0}</span></div>
      </div>

      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setStep("mapping")}>
          <ArrowLeft className="size-4" /> Volver
        </Button>
        <Button onClick={handleCreate} disabled={isPending}>
          {isPending ? "Creando…" : "Crear organización"}
          <Check className="size-4" />
        </Button>
      </div>
    </div>
  )
}
