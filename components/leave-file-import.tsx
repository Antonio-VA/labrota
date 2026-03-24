"use client"

import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Upload, X, AlertTriangle, FileUp } from "lucide-react"
import { parseLeaveFile, type ParsedLeaveEntry, type StaffRecord } from "@/lib/parse-leave-file"
import { createLeave } from "@/app/(clinic)/leaves/actions"

const LEAVE_TYPES = [
  { value: "annual", label: "Vacaciones" },
  { value: "sick", label: "Baja médica" },
  { value: "personal", label: "Asuntos propios" },
  { value: "training", label: "Formación" },
  { value: "maternity", label: "Maternidad/Paternidad" },
  { value: "other", label: "Otros" },
]

export function LeaveFileImport({
  staff,
  onClose,
}: {
  staff: { id: string; first_name: string; last_name: string }[]
  onClose: () => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState<"upload" | "review">("upload")
  const [entries, setEntries] = useState<ParsedLeaveEntry[]>([])
  const [error, setError] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const staffRecords: StaffRecord[] = staff.map((s) => ({
    id: s.id,
    first_name: s.first_name,
    last_name: s.last_name,
    initials: `${(s.first_name[0] ?? "").toUpperCase()}${(s.last_name[0] ?? "").toUpperCase()}`,
  }))

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError("")

    try {
      const buffer = await file.arrayBuffer()
      const result = await parseLeaveFile(buffer, file.name, staffRecords)

      if (result.error) {
        setError(result.error)
        return
      }

      setEntries(result.entries)
      setStep("review")
    } catch {
      setError("No se pudo leer el archivo. Por favor comprueba que no está protegido con contraseña.")
    }

    e.target.value = ""
  }

  function removeEntry(id: string) {
    setEntries((prev) => prev.filter((e) => e.id !== id))
  }

  function updateEntry(id: string, updates: Partial<ParsedLeaveEntry>) {
    setEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...updates } : e))
  }

  function handleConfirm() {
    startTransition(async () => {
      let saved = 0
      let skipped = 0

      for (const entry of entries) {
        if (!entry.matchedStaffId || !entry.from) { skipped++; continue }

        const fd = new FormData()
        fd.set("staff_id", entry.matchedStaffId)
        fd.set("type", entry.type)
        fd.set("start_date", entry.from)
        fd.set("end_date", entry.to || entry.from)
        fd.set("notes", "")

        const result = await createLeave(null, fd)
        if (result && "error" in result) { skipped++} else { saved++ }
      }

      if (saved > 0) toast.success(`${saved} ausencias guardadas`)
      if (skipped > 0) toast.warning(`${skipped} entradas omitidas`)
      router.refresh()
      onClose()
    })
  }

  const unmatchedCount = entries.filter((e) => !e.matchedStaffId).length
  const incompleteDates = entries.filter((e) => !e.from).length

  // ── Upload step ─────────────────────────────────────────────────────────
  if (step === "upload") {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <FileUp className="size-10 text-muted-foreground" />
        <div className="text-center">
          <p className="text-[15px] font-medium">Añadir ausencias desde archivo</p>
          <p className="text-[13px] text-muted-foreground mt-1">PDF, Word o Excel con información de ausencias</p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.doc,.xls,.xlsx"
          onChange={handleFile}
          className="hidden"
        />
        <Button onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" />
          Seleccionar archivo
        </Button>
        {error && (
          <div className="flex items-center gap-2 text-[13px] text-destructive max-w-sm text-center">
            <AlertTriangle className="size-4 shrink-0" />
            {error}
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
      </div>
    )
  }

  // ── Review step ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] font-medium">Ausencias detectadas</p>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border py-8 text-center">
          <p className="text-[14px] text-muted-foreground">No se detectaron ausencias en el archivo.</p>
          <p className="text-[12px] text-muted-foreground mt-1">Puedes añadir entradas manualmente.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-muted border-b border-border">
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Personal</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Desde</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Hasta</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Tipo</th>
                <th className="px-3 py-2 text-left font-medium text-muted-foreground">Notas</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const hasWarning = !entry.matchedStaffId || !entry.from
                return (
                  <tr key={entry.id} className={cn("border-b border-border last:border-0", hasWarning && "bg-amber-50/50 dark:bg-amber-900/10")}>
                    <td className="px-3 py-1.5">
                      {entry.matchedStaffId ? (
                        <span className="text-[13px] font-medium">{entry.matchedStaffName}</span>
                      ) : (
                        <select
                          value={entry.matchedStaffId ?? ""}
                          onChange={(e) => {
                            const s = staff.find((st) => st.id === e.target.value)
                            updateEntry(entry.id, {
                              matchedStaffId: e.target.value || null,
                              matchedStaffName: s ? `${s.first_name} ${s.last_name}` : null,
                            })
                          }}
                          className="h-7 w-full rounded border border-amber-300 bg-transparent px-2 text-[12px]"
                        >
                          <option value="">{entry.rawStaff} (sin coincidencia)</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="date"
                        value={entry.from}
                        onChange={(e) => updateEntry(entry.id, { from: e.target.value })}
                        className={cn("h-7 text-[12px]", !entry.from && "border-amber-300")}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        type="date"
                        value={entry.to}
                        onChange={(e) => updateEntry(entry.id, { to: e.target.value })}
                        className="h-7 text-[12px]"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={entry.type}
                        onChange={(e) => updateEntry(entry.id, { type: e.target.value })}
                        className="h-7 rounded border border-input bg-transparent px-2 text-[12px]"
                      >
                        {LEAVE_TYPES.map((lt) => (
                          <option key={lt.value} value={lt.value}>{lt.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      {(!entry.from || !entry.matchedStaffId) && (
                        <span className="text-[10px] text-muted-foreground italic truncate block max-w-[150px]" title={entry.rawText}>
                          {entry.rawText.slice(0, 50)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => removeEntry(entry.id)} className="text-muted-foreground hover:text-destructive">
                        <X className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary */}
      <p className="text-[12px] text-muted-foreground">
        {entries.length} ausencias detectadas
        {unmatchedCount > 0 && ` · ${unmatchedCount} sin confirmar personal`}
        {incompleteDates > 0 && ` · ${incompleteDates} con fechas incompletas`}
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleConfirm} disabled={isPending || entries.length === 0}>
          {isPending ? "Guardando…" : "Confirmar"}
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={isPending}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
