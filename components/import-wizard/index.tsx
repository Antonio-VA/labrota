"use client"

import { useState, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { Upload, X, Loader2, CheckCircle2, AlertTriangle, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { importHistoricalGuardia } from "@/app/(clinic)/onboarding/import/actions"
import type { ExtractedData, ExtractedStaff, ExtractedShift, ExtractedTechnique, ExtractedRule, ExtractedLabSettings, ImportResult } from "@/lib/types/import"
import { processFile, formatSize } from "./file-processing"
import { FileIcon } from "./ui-helpers"
import { ReviewStep } from "./review-step"

type Step = "upload" | "extracting" | "review" | "importing" | "done"

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
      const enriched: ExtractedData = {
        staff: (data.staff ?? []).map((s: any) => ({ ...s, included: true })),
        shifts: (data.shifts ?? []).map((s: any) => ({ ...s, included: true })),
        techniques: (data.techniques ?? []).map((t: any) => ({ ...t, included: true })),
        rules: (data.rules ?? []).map((r: any) => ({ ...r, accepted: r.confidence >= 0.6 })),
        rota_mode: data.rota_mode ?? undefined,
        task_coverage: data.task_coverage ?? undefined,
        lab_settings: data.lab_settings ?? undefined,
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

  const setRotaMode = useCallback((type: "by_task" | "by_shift") => {
    setExtracted((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        rota_mode: {
          type,
          confidence: prev.rota_mode?.confidence ?? 1,
          reasoning: prev.rota_mode?.reasoning ?? "",
        },
      }
    })
  }, [])

  const updateLabSettings = useCallback((updates: Partial<ExtractedLabSettings>) => {
    setExtracted((prev) => {
      if (!prev) return prev
      const current = prev.lab_settings ?? {
        coverage_by_day: {
          weekday: { lab: 0, andrology: 0, admin: 0 },
          saturday: { lab: 0, andrology: 0, admin: 0 },
          sunday: { lab: 0, andrology: 0, admin: 0 },
        },
        punctions_by_day: { weekday: 0, saturday: 0, sunday: 0 },
        days_off_preference: "prefer_weekend" as const,
        shift_rotation: "weekly" as const,
        admin_on_weekends: false,
      }
      return { ...prev, lab_settings: { ...current, ...updates } }
    })
  }, [])

  const updateCoverage = useCallback((
    period: "weekday" | "saturday" | "sunday",
    dept: "lab" | "andrology" | "admin",
    value: number
  ) => {
    setExtracted((prev) => {
      if (!prev?.lab_settings) return prev
      const cov = { ...prev.lab_settings.coverage_by_day }
      cov[period] = { ...cov[period], [dept]: value }
      return { ...prev, lab_settings: { ...prev.lab_settings, coverage_by_day: cov } }
    })
  }, [])

  const updatePunctions = useCallback((period: "weekday" | "saturday" | "sunday", value: number) => {
    setExtracted((prev) => {
      if (!prev?.lab_settings) return prev
      return {
        ...prev,
        lab_settings: {
          ...prev.lab_settings,
          punctions_by_day: { ...prev.lab_settings.punctions_by_day, [period]: value },
        },
      }
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
        <ReviewStep
          extracted={extracted}
          setRotaMode={setRotaMode}
          updateCoverage={updateCoverage}
          updatePunctions={updatePunctions}
          updateLabSettings={updateLabSettings}
          updateStaff={updateStaff}
          updateShift={updateShift}
          updateTechnique={updateTechnique}
          updateRule={updateRule}
          startImport={startImport}
          setStep={setStep}
          t={t}
        />
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
              {t(result.counts.labSettings ? "doneDescriptionWithSettings" : "doneDescription", {
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
