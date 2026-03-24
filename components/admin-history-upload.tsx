"use client"

import { useState, useRef, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react"
import { getSheetNames, parseSheet } from "@/lib/parse-excel-rota"
import { importHistoricalRota } from "@/app/admin/import-actions"

export function AdminHistoryUpload({ orgId }: { orgId: string }) {
  const [isPending, startTransition] = useTransition()
  const [results, setResults] = useState<{ file: string; weeks: number; skills: number; leaves: number }[]>([])
  const [processing, setProcessing] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length === 0) return
    setProcessing(true)

    startTransition(async () => {
      const newResults: typeof results = []

      for (const file of files) {
        try {
          const buffer = await file.arrayBuffer()
          const sheets = getSheetNames(buffer)

          for (const sheet of sheets) {
            try {
              const parsed = parseSheet(buffer, sheet)

              const result = await importHistoricalRota(orgId, {
                staff: parsed.staff,
                techniques: parsed.techniques,
                assignments: parsed.assignments,
                leaves: parsed.leaves,
                weekStart: parsed.weekStart,
              })

              if (result.error) {
                toast.error(`${file.name} (${sheet}): ${result.error}`)
              } else {
                newResults.push({
                  file: `${file.name} — ${sheet}`,
                  weeks: 1,
                  skills: result.skillsAdded ?? 0,
                  leaves: result.leavesAdded ?? 0,
                })
              }
            } catch {
              // Skip unparseable sheets
            }
          }
        } catch {
          toast.error(`No se pudo leer ${file.name}`)
        }
      }

      setResults((prev) => [...prev, ...newResults])
      setProcessing(false)

      if (newResults.length > 0) {
        const totalSkills = newResults.reduce((sum, r) => sum + r.skills, 0)
        const totalLeaves = newResults.reduce((sum, r) => sum + r.leaves, 0)
        toast.success(`${newResults.length} hoja(s) procesadas · ${totalSkills} tareas · ${totalLeaves} ausencias`)
      }
    })

    // Reset input so same file can be re-selected
    e.target.value = ""
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-[18px] font-medium">Cargar historial</h2>
      <p className="text-[13px] text-muted-foreground -mt-1">
        Sube hojas de horarios pasados para identificar tareas del personal y ausencias. Se pueden subir varios archivos a la vez.
      </p>

      <div className="rounded-lg border border-border bg-background px-4 py-3">
        <input
          ref={fileRef}
          type="file"
          accept=".xls,.xlsx"
          multiple
          onChange={handleFiles}
          className="hidden"
        />
        <div className="flex items-center gap-3">
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={processing}>
            <Upload className="size-3.5" />
            {processing ? "Procesando…" : "Subir archivos"}
          </Button>
          <span className="text-[12px] text-muted-foreground">.xls / .xlsx · Varias hojas y archivos soportados</span>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-3 flex flex-col gap-1">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
                <span className="text-muted-foreground truncate flex-1">{r.file}</span>
                <span className="text-muted-foreground shrink-0">{r.skills} tareas</span>
                <span className="text-muted-foreground shrink-0">{r.leaves} ausencias</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
