"use client"

import { useState, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Upload, X, Loader2, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, Check, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { importFutureRota, type ImportRotaResult } from "@/app/(clinic)/onboarding/import-rota/actions"
import { processFile, formatSize } from "@/components/import-wizard/file-processing"
import { FileIcon } from "@/components/import-wizard/ui-helpers"
import type { ExtractedRota, DbStaff, DbShift, StaffMatch, ShiftMatch } from "./types"
import { matchStaff, matchShift, getMondayOfWeek, fmtDate, fmtWeekRange } from "./matching"

type Step = "upload" | "extracting" | "review" | "importing" | "done"

export function ImportRotaWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("upload")
  const [files, setFiles] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")

  // Extracted data
  const [extracted, setExtracted] = useState<ExtractedRota | null>(null)

  // DB data for matching
  const [dbStaff, setDbStaff] = useState<DbStaff[]>([])
  const [dbShifts, setDbShifts] = useState<DbShift[]>([])

  // Matching state
  const [staffMatches, setStaffMatches] = useState<StaffMatch[]>([])
  const [shiftMatches, setShiftMatches] = useState<ShiftMatch[]>([])
  const [conflictModes, setConflictModes] = useState<Record<string, "replace" | "merge" | "skip">>({})

  // Result
  const [result, setResult] = useState<ImportRotaResult | null>(null)

  // ── File handling ───────────────────────────────────────────────────────
  const addFiles = useCallback((newFiles: File[]) => {
    setFiles((prev) => [...prev, ...newFiles])
    setError("")
  }, [])

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    addFiles(Array.from(e.dataTransfer.files))
  }

  // ── Extract ─────────────────────────────────────────────────────────────
  async function handleExtract() {
    setStep("extracting")
    setError("")

    try {
      const processed = await Promise.all(files.map(processFile))
      const res = await fetch("/api/import-rota-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: processed }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Extraction failed")
      }

      const data: ExtractedRota = await res.json()
      setExtracted(data)

      const { createClient } = await import("@/lib/supabase/client")
      const supabase = createClient()
      const [sRes, shRes] = await Promise.all([
        supabase.from("staff").select("id, first_name, last_name, role").neq("onboarding_status", "inactive").order("first_name"),
        supabase.from("shift_types").select("code, name_es").order("sort_order"),
      ])

      const staff = (sRes.data ?? []) as DbStaff[]
      const shifts = (shRes.data ?? []) as DbShift[]
      setDbStaff(staff)
      setDbShifts(shifts)

      // Run matching
      const uniqueStaffNames = [...new Set(data.assignments.map((a) => a.staff_name).concat(data.days_off.map((d) => d.staff_name)))]
      const uniqueShiftCodes = [...new Set(data.assignments.map((a) => a.shift_code))]

      setStaffMatches(uniqueStaffNames.map((name) => matchStaff(name, staff)))
      setShiftMatches(uniqueShiftCodes.map((code) => matchShift(code, shifts)))

      // Detect weeks and set default conflict modes
      const weeks = new Set(data.assignments.map((a) => getMondayOfWeek(a.date)))
      const modes: Record<string, "replace" | "merge" | "skip"> = {}
      for (const w of weeks) modes[w] = "merge"
      setConflictModes(modes)

      setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error parsing file")
      setStep("upload")
    }
  }

  // ── Import ──────────────────────────────────────────────────────────────
  async function handleImport() {
    if (!extracted) return
    setStep("importing")
    setError("")

    // Build staff name → ID map from matches
    const staffIdMap: Record<string, string> = {}
    for (const m of staffMatches) {
      if (m.staff_id) staffIdMap[m.file_name] = m.staff_id
    }

    // Build shift code → DB code map
    const shiftCodeMap: Record<string, string> = {}
    for (const m of shiftMatches) {
      if (m.db_code) shiftCodeMap[m.file_code] = m.db_code
    }

    // Filter and map assignments
    const assignments = extracted.assignments
      .filter((a) => staffIdMap[a.staff_name] && shiftCodeMap[a.shift_code])
      .map((a) => ({
        staff_id: staffIdMap[a.staff_name],
        date: a.date,
        shift_code: shiftCodeMap[a.shift_code],
        task_codes: a.task_codes,
      }))

    const days_off = extracted.days_off
      .filter((d) => staffIdMap[d.staff_name])
      .map((d) => ({
        staff_id: staffIdMap[d.staff_name],
        date: d.date,
      }))

    const skippedStaff = staffMatches.filter((m) => !m.staff_id).length
    const skippedShifts = shiftMatches.filter((m) => !m.db_code).length

    try {
      const res = await importFutureRota({
        assignments,
        days_off,
        conflict_mode: conflictModes,
      })

      setResult({ ...res, staff_skipped: skippedStaff, shifts_skipped: skippedShifts })
      setStep("done")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
      setStep("review")
    }
  }

  // ── Step indicator ──────────────────────────────────────────────────────
  const STEPS = ["upload", "extracting", "review", "importing", "done"] as const
  const stepIdx = STEPS.indexOf(step)

  // ── Counts for review ──────────────────────────────────────────────────
  const matchedStaff = staffMatches.filter((m) => m.staff_id).length
  const matchedShifts = shiftMatches.filter((m) => m.db_code).length
  const totalAssignments = extracted?.assignments.length ?? 0
  const weekStarts = Object.keys(conflictModes).sort()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <h1 className="text-[18px] font-medium">Importar guardias futuras</h1>
        <p className="text-[14px] text-muted-foreground mt-1">
          Sube un archivo con guardias ya planificadas para cargarlas al calendario.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-[12px]">
        {["Subir", "Extraer", "Revisar", "Importar", "Listo"].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className={cn(
              "inline-flex items-center justify-center size-6 rounded-full text-[11px] font-medium",
              i < stepIdx ? "bg-emerald-500 text-white" :
              i === stepIdx ? "bg-primary text-primary-foreground" :
              "bg-muted text-muted-foreground"
            )}>
              {i < stepIdx ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={cn(
              "hidden sm:inline",
              i === stepIdx ? "text-foreground font-medium" : "text-muted-foreground"
            )}>{label}</span>
            {i < 4 && <ChevronRight className="size-3 text-muted-foreground/40" />}
          </div>
        ))}
      </div>

      {/* ── Step: Upload ───────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="flex flex-col gap-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            <Upload className="size-8 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-[14px] font-medium">Arrastra archivos aquí o haz clic para seleccionar</p>
            <p className="text-[12px] text-muted-foreground mt-1">Excel, CSV, PDF o imágenes</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
              multiple
              onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)); e.target.value = "" }}
              className="hidden"
            />
          </div>

          {files.length > 0 && (
            <div className="flex flex-col gap-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-background">
                  <FileIcon name={f.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">{formatSize(f.size)}</p>
                  </div>
                  <button onClick={() => removeFile(i)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <Button onClick={handleExtract} disabled={files.length === 0}>
            Analizar archivos
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      )}

      {/* ── Step: Extracting ───────────────────────────────────────────────── */}
      {step === "extracting" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-[14px] text-muted-foreground">Analizando archivos con IA...</p>
          <p className="text-[12px] text-muted-foreground/60">Esto puede tardar unos segundos</p>
        </div>
      )}

      {/* ── Step: Review ───────────────────────────────────────────────────── */}
      {step === "review" && extracted && (
        <div className="flex flex-col gap-5">
          {/* Date range */}
          <div className="rounded-lg border border-border bg-background px-4 py-3">
            <p className="text-[13px] text-muted-foreground">Período detectado</p>
            <p className="text-[14px] font-medium mt-0.5">
              {fmtDate(extracted.date_range.start)} — {fmtDate(extracted.date_range.end)}
              <span className="text-muted-foreground font-normal ml-2">({weekStarts.length} semana{weekStarts.length !== 1 ? "s" : ""})</span>
            </p>
          </div>

          {/* Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-center">
              <p className="text-[20px] font-medium">{totalAssignments}</p>
              <p className="text-[12px] text-muted-foreground">Asignaciones</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-center">
              <p className="text-[20px] font-medium">{matchedStaff}/{staffMatches.length}</p>
              <p className="text-[12px] text-muted-foreground">Personal</p>
            </div>
            <div className="rounded-lg border border-border bg-background px-4 py-3 text-center">
              <p className="text-[20px] font-medium">{matchedShifts}/{shiftMatches.length}</p>
              <p className="text-[12px] text-muted-foreground">Turnos</p>
            </div>
          </div>

          {/* Staff matching */}
          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">Personal</p>
            </div>
            <div className="divide-y divide-border/50">
              {staffMatches.map((m, i) => (
                <div key={m.file_name} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-[13px] w-40 truncate">{m.file_name}</span>
                  <ArrowRight className="size-3 text-muted-foreground/40 shrink-0" />
                  {m.confidence === "none" ? (
                    <select
                      value={m.staff_id}
                      onChange={(e) => {
                        const s = dbStaff.find((st) => st.id === e.target.value)
                        setStaffMatches((prev) => prev.map((x, j) => j === i ? {
                          ...x,
                          staff_id: e.target.value,
                          staff_label: s ? `${s.first_name} ${s.last_name}` : "",
                          confidence: e.target.value ? "fuzzy" : "none",
                        } : x))
                      }}
                      className="flex-1 text-[13px] border border-border rounded-md px-2 py-1 bg-background"
                    >
                      <option value="">— Seleccionar —</option>
                      {dbStaff.map((s) => (
                        <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex-1 text-[13px]">{m.staff_label}</span>
                  )}
                  <span className={cn(
                    "text-[11px] font-medium px-1.5 py-0.5 rounded",
                    m.confidence === "exact" ? "bg-emerald-50 text-emerald-600" :
                    m.confidence === "fuzzy" ? "bg-amber-50 text-amber-600" :
                    "bg-red-50 text-red-600"
                  )}>
                    {m.confidence === "exact" ? "✓" : m.confidence === "fuzzy" ? "~" : "✗"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Shift matching */}
          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <div className="px-4 py-2.5 border-b border-border bg-muted/30">
              <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">Turnos</p>
            </div>
            <div className="divide-y divide-border/50">
              {shiftMatches.map((m, i) => (
                <div key={m.file_code} className="flex items-center gap-3 px-4 py-2">
                  <span className="text-[13px] font-mono w-20">{m.file_code}</span>
                  <ArrowRight className="size-3 text-muted-foreground/40 shrink-0" />
                  {m.confidence === "none" ? (
                    <select
                      value={m.db_code}
                      onChange={(e) => {
                        const s = dbShifts.find((st) => st.code === e.target.value)
                        setShiftMatches((prev) => prev.map((x, j) => j === i ? {
                          ...x,
                          db_code: e.target.value,
                          db_label: s ? `${s.code} - ${s.name_es}` : "",
                          confidence: e.target.value ? "name" : "none",
                        } : x))
                      }}
                      className="flex-1 text-[13px] border border-border rounded-md px-2 py-1 bg-background"
                    >
                      <option value="">— Seleccionar —</option>
                      {dbShifts.map((s) => (
                        <option key={s.code} value={s.code}>{s.code} - {s.name_es}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="flex-1 text-[13px]">{m.db_label}</span>
                  )}
                  <span className={cn(
                    "text-[11px] font-medium px-1.5 py-0.5 rounded",
                    m.confidence !== "none" ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                  )}>
                    {m.confidence !== "none" ? "✓" : "✗"}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Week conflict modes */}
          {weekStarts.length > 0 && (
            <div className="rounded-lg border border-border bg-background overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">Semanas</p>
              </div>
              <div className="divide-y divide-border/50">
                {weekStarts.map((ws) => (
                  <div key={ws} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="text-[13px] flex-1">{fmtWeekRange(ws)}</span>
                    <select
                      value={conflictModes[ws]}
                      onChange={(e) => setConflictModes((prev) => ({ ...prev, [ws]: e.target.value as "replace" | "merge" | "skip" }))}
                      className="text-[12px] border border-border rounded-md px-2 py-1 bg-background"
                    >
                      <option value="merge">Fusionar</option>
                      <option value="replace">Reemplazar</option>
                      <option value="skip">Omitir</option>
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Unrecognised shifts warning */}
          {extracted.unrecognised_shifts.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[13px] font-medium text-amber-700">Códigos de turno no reconocidos</p>
                <p className="text-[12px] text-amber-600 mt-0.5">{extracted.unrecognised_shifts.join(", ")}</p>
              </div>
            </div>
          )}

          {error && <p className="text-[13px] text-destructive">{error}</p>}

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => { setStep("upload"); setExtracted(null) }}>
              <ChevronLeft className="size-4 mr-1" />
              Volver
            </Button>
            <Button onClick={handleImport} disabled={matchedStaff === 0 || matchedShifts === 0}>
              Importar {totalAssignments} asignaciones
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}

      {/* ── Step: Importing ────────────────────────────────────────────────── */}
      {step === "importing" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-[14px] text-muted-foreground">Importando asignaciones...</p>
        </div>
      )}

      {/* ── Step: Done ─────────────────────────────────────────────────────── */}
      {step === "done" && result && (
        <div className="flex flex-col items-center gap-5 py-8">
          <CheckCircle2 className="size-12 text-emerald-500" />
          <div className="text-center">
            <p className="text-[18px] font-medium">Importación completada</p>
            <p className="text-[14px] text-muted-foreground mt-1">
              {result.weeks_imported} semana{result.weeks_imported !== 1 ? "s" : ""} · {result.assignments_created} asignaciones
            </p>
          </div>

          {(result.staff_skipped > 0 || result.shifts_skipped > 0) && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-700">
              {result.staff_skipped > 0 && <p>{result.staff_skipped} persona(s) sin emparejar — omitidas</p>}
              {result.shifts_skipped > 0 && <p>{result.shifts_skipped} turno(s) sin emparejar — omitidos</p>}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={() => router.push("/settings")}>
              Volver a ajustes
            </Button>
            <Button onClick={() => router.push("/")}>
              Ir al calendario
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
