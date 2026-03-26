"use client"

import { useState, useTransition, useEffect } from "react"
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  getImplementationStatus,
  loadDefaultShifts,
  loadDefaultTecnicas,
  loadDefaultDepartments,
  loadAllDefaults,
  type ImplementationStatus,
} from "@/app/admin/implementation-actions"
import { ES_SHIFTS, ES_TECNICAS, ES_DEPARTMENTS } from "@/lib/defaults/es"
import { EN_SHIFTS, EN_TECNICAS, EN_DEPARTMENTS } from "@/lib/defaults/en"

type Lang = "es" | "en"
type LoadMode = "overwrite" | "merge"

function StatusIcon({ count }: { count: number }) {
  return count > 0
    ? <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
    : <XCircle className="size-4 text-muted-foreground/30 shrink-0" />
}

export function AdminImplementation({ orgId, userEmail }: { orgId: string; userEmail?: string }) {
  const [status, setStatus] = useState<ImplementationStatus | null>(null)
  const [lang, setLang] = useState<Lang>("en")
  const [isPending, startTransition] = useTransition()
  const [confirmAction, setConfirmAction] = useState<{ category: string; mode: LoadMode } | null>(null)

  useEffect(() => {
    getImplementationStatus(orgId).then(setStatus)
  }, [orgId])

  function refresh() {
    getImplementationStatus(orgId).then(setStatus)
  }

  function handleLoad(category: "shifts" | "tecnicas" | "departments" | "all", mode: LoadMode) {
    setConfirmAction(null)
    startTransition(async () => {
      let result: { error?: string; count?: number }
      switch (category) {
        case "shifts":      result = await loadDefaultShifts(orgId, lang, mode, userEmail); break
        case "tecnicas":    result = await loadDefaultTecnicas(orgId, lang, mode, userEmail); break
        case "departments": result = await loadDefaultDepartments(orgId, lang, mode, userEmail); break
        case "all":         result = await loadAllDefaults(orgId, lang, mode, userEmail); break
      }
      if (result.error) toast.error(result.error)
      else toast.success(`${category === "all" ? "All defaults" : category} loaded (${lang.toUpperCase()})`)
      refresh()
    })
  }

  function requestLoad(category: string, existingCount: number) {
    if (existingCount > 0) {
      setConfirmAction({ category, mode: "overwrite" })
    } else {
      handleLoad(category as "shifts" | "tecnicas" | "departments", "overwrite")
    }
  }

  const shifts = lang === "es" ? ES_SHIFTS : EN_SHIFTS
  const tecnicas = lang === "es" ? ES_TECNICAS : EN_TECNICAS
  const departments = lang === "es" ? ES_DEPARTMENTS : EN_DEPARTMENTS

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <p className="text-[14px] font-medium">Implementation</p>
        <div className="flex items-center gap-2">
          {(["es", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={cn(
                "px-3 py-1 text-[12px] font-medium rounded-md transition-colors",
                lang === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
              )}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Checklist */}
      {status && (
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide mb-3">Setup checklist</p>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 text-[13px]">
              <StatusIcon count={status.shifts} />
              <span>Shift types</span>
              <span className="text-muted-foreground ml-auto">{status.shifts}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <StatusIcon count={status.tecnicas} />
              <span>Techniques / Tasks</span>
              <span className="text-muted-foreground ml-auto">{status.tecnicas}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <StatusIcon count={status.departments} />
              <span>Departments</span>
              <span className="text-muted-foreground ml-auto">{status.departments}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              <StatusIcon count={status.rules} />
              <span>Scheduling rules</span>
              <span className="text-muted-foreground ml-auto">{status.rules}</span>
            </div>
            <div className="flex items-center gap-2 text-[13px]">
              {status.coverageConfigured
                ? <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
                : <XCircle className="size-4 text-muted-foreground/30 shrink-0" />}
              <span>Coverage minimums</span>
            </div>
          </div>
        </div>
      )}

      {/* Load all */}
      <Button
        onClick={() => {
          const total = (status?.shifts ?? 0) + (status?.tecnicas ?? 0) + (status?.departments ?? 0)
          if (total > 0) {
            setConfirmAction({ category: "all", mode: "overwrite" })
          } else {
            handleLoad("all", "overwrite")
          }
        }}
        disabled={isPending}
        className="gap-2"
      >
        {isPending ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        Load all defaults ({lang.toUpperCase()})
      </Button>

      {/* Individual sections */}
      {[
        { key: "shifts" as const, label: "Shift types", count: status?.shifts ?? 0, preview: shifts.map((s) => `${s.code} ${s.start_time}–${s.end_time}`).join(", ") },
        { key: "tecnicas" as const, label: "Techniques", count: status?.tecnicas ?? 0, preview: tecnicas.map((t) => t.codigo).join(", ") },
        { key: "departments" as const, label: "Departments", count: status?.departments ?? 0, preview: departments.map((d) => d.name).join(", ") },
      ].map((section) => (
        <div key={section.key} className="rounded-lg border border-border p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium">{section.label}</p>
              <p className="text-[11px] text-muted-foreground">
                {section.count > 0 ? `${section.count} configured` : "Not configured"}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => requestLoad(section.key, section.count)}
              disabled={isPending}
              className="text-[12px] h-7"
            >
              Load defaults
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground/70 leading-relaxed">{section.preview}</p>
        </div>
      ))}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-background rounded-xl border border-border shadow-xl p-5 max-w-sm w-full mx-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-[14px] font-medium">Existing data found</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  This lab already has {confirmAction.category === "all" ? "configured data" : `${confirmAction.category} configured`}. What would you like to do?
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleLoad(confirmAction.category as "shifts" | "tecnicas" | "departments" | "all", "overwrite")}
                disabled={isPending}
              >
                Overwrite
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleLoad(confirmAction.category as "shifts" | "tecnicas" | "departments" | "all", "merge")}
                disabled={isPending}
              >
                Merge (skip duplicates)
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
