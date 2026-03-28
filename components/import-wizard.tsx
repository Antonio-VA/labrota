"use client"

import { useState, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Upload, X, FileText, FileSpreadsheet, Image, Loader2, CheckCircle2, AlertTriangle, ChevronRight, ChevronLeft, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { importHistoricalGuardia } from "@/app/(clinic)/onboarding/import/actions"
import type { ExtractedData, ExtractedStaff, ExtractedShift, ExtractedTechnique, ExtractedRule, ProcessedFile, ImportResult } from "@/lib/types/import"

type Step = "upload" | "extracting" | "review" | "importing" | "done"

// ── File processing helpers ─────────────────────────────────────────────────

async function processExcel(file: File): Promise<ProcessedFile> {
  const XLSX = await import("xlsx")
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: "array" })
  const texts: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: "\t" })
    texts.push(`Sheet: ${name}\n${csv}`)
  }
  return { type: "text", content: texts.join("\n\n"), fileName: file.name }
}

async function processPdf(file: File): Promise<ProcessedFile> {
  const pdfjsLib = await import("pdfjs-dist")
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs"
  const buffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const text = content.items.map((item: any) => item.str).join(" ")
    pages.push(text)
  }
  return { type: "text", content: pages.join("\n\n"), fileName: file.name }
}

async function processImage(file: File): Promise<ProcessedFile> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      const base64 = dataUrl.split(",")[1]
      resolve({ type: "image", base64, mediaType: file.type, fileName: file.name })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function processFile(file: File): Promise<ProcessedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? ""
  if (["xlsx", "xls", "csv"].includes(ext)) return processExcel(file)
  if (ext === "pdf") return processPdf(file)
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return processImage(file)
  // Fallback: read as text
  const text = await file.text()
  return { type: "text", content: text, fileName: file.name }
}

// ── File icon helper ────────────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? ""
  if (["xlsx", "xls", "csv"].includes(ext)) return <FileSpreadsheet className="size-5 text-emerald-500" />
  if (ext === "pdf") return <FileText className="size-5 text-red-500" />
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return <Image className="size-5 text-blue-500" />
  return <FileText className="size-5 text-muted-foreground" />
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ── Confidence badge ────────────────────────────────────────────────────────

function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100)
  const color = confidence >= 0.8 ? "bg-blue-100 text-blue-700 border-blue-200"
    : confidence >= 0.6 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-orange-100 text-orange-700 border-orange-200"
  return <span className={cn("text-[11px] font-medium px-1.5 py-0.5 rounded border", color)}>{pct}%</span>
}

// ── Main Component ──────────────────────────────────────────────────────────

export function ImportWizard() {
  const t = useTranslations("import")
  const router = useRouter()

  const [step, setStep] = useState<Step>("upload")
  const [files, setFiles] = useState<File[]>([])
  const [extracted, setExtracted] = useState<ExtractedData | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Step 1: Upload ──────────────────────────────────────────────────────

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const accepted = Array.from(newFiles).filter((f) => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? ""
      return ["xlsx", "xls", "csv", "pdf", "png", "jpg", "jpeg", "webp"].includes(ext)
    })
    setFiles((prev) => [...prev, ...accepted])
  }, [])

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }, [])

  const startExtraction = useCallback(async () => {
    setStep("extracting")
    setError(null)
    try {
      const processed = await Promise.all(files.map(processFile))
      const res = await fetch("/api/import-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: processed }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Request failed" }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      // Add included/accepted defaults
      const enriched: ExtractedData = {
        staff: (data.staff ?? []).map((s: any) => ({ ...s, included: true })),
        shifts: (data.shifts ?? []).map((s: any) => ({ ...s, included: true })),
        techniques: (data.techniques ?? []).map((t: any) => ({ ...t, included: true })),
        rules: (data.rules ?? []).map((r: any) => ({ ...r, accepted: r.confidence >= 0.6 })),
      }
      setExtracted(enriched)
      setStep("review")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed")
      setStep("upload")
    }
  }, [files])

  // ── Step 3: Review helpers ──────────────────────────────────────────────

  const updateStaff = useCallback((idx: number, updates: Partial<ExtractedStaff>) => {
    setExtracted((prev) => {
      if (!prev) return prev
      const staff = [...prev.staff]
      staff[idx] = { ...staff[idx], ...updates }
      return { ...prev, staff }
    })
  }, [])

  const updateShift = useCallback((idx: number, updates: Partial<ExtractedShift>) => {
    setExtracted((prev) => {
      if (!prev) return prev
      const shifts = [...prev.shifts]
      shifts[idx] = { ...shifts[idx], ...updates }
      return { ...prev, shifts }
    })
  }, [])

  const updateTechnique = useCallback((idx: number, updates: Partial<ExtractedTechnique>) => {
    setExtracted((prev) => {
      if (!prev) return prev
      const techniques = [...prev.techniques]
      techniques[idx] = { ...techniques[idx], ...updates }
      return { ...prev, techniques }
    })
  }, [])

  const updateRule = useCallback((idx: number, updates: Partial<ExtractedRule>) => {
    setExtracted((prev) => {
      if (!prev) return prev
      const rules = [...prev.rules]
      rules[idx] = { ...rules[idx], ...updates }
      return { ...prev, rules }
    })
  }, [])

  // ── Step 4: Import ─────────────────────────────────────────────────────

  const startImport = useCallback(async () => {
    if (!extracted) return
    setStep("importing")
    setError(null)
    try {
      const res = await importHistoricalGuardia(extracted)
      setResult(res)
      if (res.success) {
        setStep("done")
      } else {
        setError(res.error ?? "Import failed")
        setStep("review")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed")
      setStep("review")
    }
  }, [extracted])

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(["upload", "extracting", "review", "importing", "done"] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            {i > 0 && <div className="w-6 h-px bg-border" />}
            <div className={cn(
              "size-7 rounded-full flex items-center justify-center text-[12px] font-medium border",
              step === s ? "bg-primary text-primary-foreground border-primary"
                : (["upload", "extracting", "review", "importing", "done"].indexOf(step) > i)
                  ? "bg-primary/10 text-primary border-primary/30"
                  : "bg-muted text-muted-foreground border-border"
            )}>
              {i + 1}
            </div>
          </div>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 flex items-start gap-2">
          <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-[13px] text-destructive">{error}</p>
        </div>
      )}

      {/* ── STEP 1: Upload ────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-[18px] font-medium">{t("uploadTitle")}</h2>
            <p className="text-[14px] text-muted-foreground mt-1">{t("uploadHint")}</p>
          </div>

          {/* Drop zone */}
          <div
            className="border-2 border-dashed border-border rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary/40") }}
            onDragLeave={(e) => { e.currentTarget.classList.remove("border-primary/40") }}
            onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-primary/40"); addFiles(e.dataTransfer.files) }}
          >
            <Upload className="size-8 text-muted-foreground" />
            <p className="text-[14px] font-medium">{t("dropzone")}</p>
            <p className="text-[12px] text-muted-foreground">{t("dropzoneFormats")}</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = "" }}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center gap-3 px-3 py-2 rounded-lg border border-border bg-background">
                  <FileIcon name={f.name} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium truncate">{f.name}</p>
                    <p className="text-[11px] text-muted-foreground">{formatSize(f.size)}</p>
                  </div>
                  <button onClick={() => removeFile(i)} className="size-6 flex items-center justify-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={startExtraction}
            disabled={files.length === 0}
            className={cn(
              "px-6 py-2.5 rounded-lg text-[14px] font-medium transition-colors flex items-center gap-2 self-end",
              files.length > 0
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {t("analyseButton")}
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}

      {/* ── STEP 2: Extracting ────────────────────────────────────────── */}
      {step === "extracting" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-[14px] font-medium">{t("extracting", { count: files.length })}</p>
          <p className="text-[12px] text-muted-foreground">{t("extractingHint")}</p>
        </div>
      )}

      {/* ── STEP 3: Review ────────────────────────────────────────────── */}
      {step === "review" && extracted && (
        <div className="flex flex-col gap-6">
          <div>
            <h2 className="text-[18px] font-medium">{t("reviewTitle")}</h2>
            <p className="text-[14px] text-muted-foreground mt-1">{t("reviewDescription")}</p>
          </div>

          {/* Rota mode detection */}
          {extracted.rota_mode && (
            <div className="rounded-lg border border-border bg-background p-4">
              <div className="flex items-start gap-3">
                <div className={cn("size-8 rounded-lg flex items-center justify-center shrink-0", extracted.rota_mode.type === "by_task" ? "bg-blue-50 text-blue-600" : "bg-emerald-50 text-emerald-600")}>
                  {extracted.rota_mode.type === "by_task" ? "T" : "S"}
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-medium">
                    {extracted.rota_mode.type === "by_task" ? "Organización por tarea" : "Organización por turno"}
                    <ConfidenceBadge confidence={extracted.rota_mode.confidence} />
                  </p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{extracted.rota_mode.reasoning}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1.5 italic">
                    {extracted.rota_mode.type === "by_task"
                      ? "Por tarea es habitual en laboratorios grandes (10+ personas), donde cada profesional se asigna a procedimientos específicos cada día."
                      : "Por turno es habitual en laboratorios pequeños (<10 personas), donde todo el equipo rota entre turnos sin asignación fija de tareas."}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Task coverage (only for by_task mode) */}
          {extracted.rota_mode?.type === "by_task" && extracted.task_coverage && extracted.task_coverage.length > 0 && (
            <ReviewSection title="Cobertura por tarea detectada" count={extracted.task_coverage.length}>
              <p className="text-[12px] text-muted-foreground mb-3">
                Estos son los niveles de personal observados por tarea. Se usarán como cobertura mínima sugerida si activas la opción en Configuración.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 px-2 font-medium">Tarea</th>
                      <th className="py-2 px-2 font-medium text-center">Típico</th>
                      <th className="py-2 px-2 font-medium text-center">Mín.</th>
                      <th className="py-2 px-2 font-medium text-center">Máx.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extracted.task_coverage.map((tc, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-1.5 px-2 font-mono">{tc.task_code}</td>
                        <td className="py-1.5 px-2 text-center font-medium">{tc.typical_staff_count}</td>
                        <td className="py-1.5 px-2 text-center text-muted-foreground">{tc.min_observed}</td>
                        <td className="py-1.5 px-2 text-center text-muted-foreground">{tc.max_observed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </ReviewSection>
          )}

          {/* Section A: Staff */}
          <ReviewSection title={t("staffSection")} count={extracted.staff.filter((s) => s.included).length}>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="py-2 px-2 w-8"></th>
                    <th className="py-2 px-2 font-medium">{t("name")}</th>
                    <th className="py-2 px-2 font-medium">{t("department")}</th>
                    <th className="py-2 px-2 font-medium">{t("shift")}</th>
                    <th className="py-2 px-2 font-medium">{t("days")}</th>
                  </tr>
                </thead>
                <tbody>
                  {extracted.staff.map((s, i) => (
                    <tr key={i} className={cn("border-b border-border/50", !s.included && "opacity-40")}>
                      <td className="py-1.5 px-2">
                        <input type="checkbox" checked={s.included} onChange={(e) => updateStaff(i, { included: e.target.checked })} className="rounded" />
                      </td>
                      <td className="py-1.5 px-2">
                        <input value={s.name} onChange={(e) => updateStaff(i, { name: e.target.value })} className="bg-transparent border-b border-transparent focus:border-primary outline-none w-full" />
                      </td>
                      <td className="py-1.5 px-2">
                        <select value={s.department} onChange={(e) => updateStaff(i, { department: e.target.value })} className="bg-transparent text-[13px] outline-none">
                          <option value="lab">Lab</option>
                          <option value="andrology">Andrology</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-1.5 px-2">
                        <input value={s.shift_preference} onChange={(e) => updateStaff(i, { shift_preference: e.target.value })} className="bg-transparent border-b border-transparent focus:border-primary outline-none w-16" />
                      </td>
                      <td className="py-1.5 px-2 text-[11px] text-muted-foreground">
                        {s.observed_days.join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReviewSection>

          {/* Section B: Shifts */}
          <ReviewSection title={t("shiftsSection")} count={extracted.shifts.filter((s) => s.included).length}>
            <div className="flex flex-col gap-2">
              {extracted.shifts.map((s, i) => (
                <div key={i} className={cn("flex items-center gap-3 px-3 py-2 rounded-lg border border-border", !s.included && "opacity-40")}>
                  <input type="checkbox" checked={s.included} onChange={(e) => updateShift(i, { included: e.target.checked })} className="rounded" />
                  <input value={s.code} onChange={(e) => updateShift(i, { code: e.target.value })} className="bg-transparent font-medium w-16 border-b border-transparent focus:border-primary outline-none" />
                  <input value={s.name} onChange={(e) => updateShift(i, { name: e.target.value })} className="bg-transparent flex-1 border-b border-transparent focus:border-primary outline-none text-[13px]" />
                  <input value={s.start} onChange={(e) => updateShift(i, { start: e.target.value })} className="bg-transparent w-16 text-center border-b border-transparent focus:border-primary outline-none text-[13px]" placeholder="HH:MM" />
                  <span className="text-muted-foreground">–</span>
                  <input value={s.end} onChange={(e) => updateShift(i, { end: e.target.value })} className="bg-transparent w-16 text-center border-b border-transparent focus:border-primary outline-none text-[13px]" placeholder="HH:MM" />
                </div>
              ))}
            </div>
          </ReviewSection>

          {/* Section C: Techniques */}
          <ReviewSection title={t("techniquesSection")} count={extracted.techniques.filter((t) => t.included).length}>
            <div className="flex flex-wrap gap-2">
              {extracted.techniques.map((tech, i) => (
                <button
                  key={i}
                  onClick={() => updateTechnique(i, { included: !tech.included })}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-[13px] font-medium transition-colors",
                    tech.included
                      ? "border-primary/30 bg-primary/5 text-primary"
                      : "border-border bg-background text-muted-foreground"
                  )}
                >
                  <span className="font-bold">{tech.code}</span> {tech.name}
                </button>
              ))}
            </div>
          </ReviewSection>

          {/* Section D: Rules */}
          <ReviewSection title={t("rulesSection")} count={extracted.rules.filter((r) => r.accepted).length}>
            <div className="flex flex-col gap-2">
              {extracted.rules.map((r, i) => (
                <div key={i} className={cn("flex items-start gap-3 px-3 py-2.5 rounded-lg border border-border", !r.accepted && "opacity-40")}>
                  <input type="checkbox" checked={r.accepted} onChange={(e) => updateRule(i, { accepted: e.target.checked })} className="rounded mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <ConfidenceBadge confidence={r.confidence} />
                      <span className="text-[11px] text-muted-foreground">{r.observed_count}/{r.total_weeks} {t("weeks")}</span>
                    </div>
                    <p className="text-[13px]">{r.description}</p>
                    {r.staff_involved.length > 0 && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">{r.staff_involved.join(", ")}</p>
                    )}
                  </div>
                </div>
              ))}
              {extracted.rules.length === 0 && (
                <p className="text-[13px] text-muted-foreground italic py-4 text-center">{t("noRules")}</p>
              )}
            </div>
          </ReviewSection>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            <button onClick={() => setStep("upload")} className="px-4 py-2 rounded-lg text-[14px] font-medium text-muted-foreground hover:text-foreground flex items-center gap-1.5">
              <ChevronLeft className="size-4" />
              {t("back")}
            </button>
            <button onClick={startImport} className="px-6 py-2.5 rounded-lg text-[14px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2">
              {t("importButton")}
              <ChevronRight className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Importing ──────────────────────────────────────────── */}
      {step === "importing" && (
        <div className="flex flex-col items-center gap-4 py-12">
          <Loader2 className="size-8 text-primary animate-spin" />
          <p className="text-[14px] font-medium">{t("importing")}</p>
        </div>
      )}

      {/* ── STEP 5: Done ──────────────────────────────────────────────── */}
      {step === "done" && result?.counts && (
        <div className="flex flex-col items-center gap-6 py-12">
          <div className="size-16 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="size-8 text-emerald-600" />
          </div>
          <div className="text-center">
            <h2 className="text-[18px] font-medium">{t("doneTitle")}</h2>
            <p className="text-[14px] text-muted-foreground mt-2 max-w-md">
              {t("doneDescription", {
                staff: result.counts.staff,
                shifts: result.counts.shifts,
                techniques: result.counts.techniques,
                rules: result.counts.rules,
              })}
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button onClick={() => router.push("/staff")} className="px-4 py-2 rounded-lg text-[14px] font-medium border border-border hover:bg-accent">
              {t("viewStaff")}
            </button>
            <button onClick={() => router.push("/")} className="px-6 py-2.5 rounded-lg text-[14px] font-medium bg-primary text-primary-foreground hover:bg-primary/90">
              {t("viewCalendar")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Review Section wrapper ──────────────────────────────────────────────────

function ReviewSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-[14px] font-medium">{title}</h3>
        <span className="text-[12px] text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <div className="p-4">
        {children}
      </div>
    </div>
  )
}
