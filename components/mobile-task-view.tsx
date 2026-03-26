"use client"

import { useTranslations } from "next-intl"
import { X, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Tecnica } from "@/lib/types/database"
import type { RotaDay } from "@/app/(clinic)/rota/actions"

const TECNICA_DOT: Record<string, string> = {
  amber: "bg-amber-400", blue: "bg-blue-400", green: "bg-green-400",
  purple: "bg-purple-400", coral: "bg-red-400", teal: "bg-teal-400",
  slate: "bg-slate-400", red: "bg-red-400",
}

interface MobileTaskViewProps {
  day: RotaDay | null
  tecnicas: Tecnica[]
  isEditMode: boolean
  onRemoveAssignment: (id: string) => void
  onAddToTecnica: (tecnicaCode: string) => void
  loading: boolean
}

export function MobileTaskView({
  day, tecnicas, isEditMode, onRemoveAssignment, onAddToTecnica, loading,
}: MobileTaskViewProps) {
  const t = useTranslations("mobileTask")
  if (loading || !day) return null

  const activeTecnicas = tecnicas.filter((t) => t.activa).sort((a, b) => a.orden - b.orden)

  // Group assignments by function_label (technique code)
  const byTecnica: Record<string, typeof day.assignments> = {}
  const unassigned: typeof day.assignments = []
  for (const a of day.assignments) {
    const code = a.function_label
    if (code) {
      if (!byTecnica[code]) byTecnica[code] = []
      byTecnica[code].push(a)
    } else {
      unassigned.push(a)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {activeTecnicas.map((tec) => {
        const assignments = byTecnica[tec.codigo] ?? []
        const dotColor = TECNICA_DOT[tec.color] ?? TECNICA_DOT.blue
        return (
          <div key={tec.id} className="flex flex-col gap-1.5">
            {/* Technique header */}
            <div className="flex items-center gap-2">
              <span className={cn("size-2 rounded-full shrink-0", dotColor)} />
              <span className="text-[13px] font-medium">{tec.nombre_es}</span>
              <span className="text-[11px] text-muted-foreground">{assignments.length}</span>
            </div>
            {/* Staff chips */}
            <div className="flex flex-wrap gap-1.5 pl-4">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-md border text-[12px] font-medium",
                    "border-border bg-background"
                  )}
                >
                  <span>{a.staff.first_name} {a.staff.last_name[0]}.</span>
                  {isEditMode && (
                    <button
                      onClick={() => onRemoveAssignment(a.id)}
                      className="text-muted-foreground hover:text-destructive ml-0.5"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              ))}
              {isEditMode && (
                <button
                  onClick={() => onAddToTecnica(tec.codigo)}
                  className="flex items-center gap-1 px-2 py-1 rounded-md border border-dashed border-primary/30 text-[12px] text-primary hover:bg-primary/5 active:bg-primary/10 transition-colors"
                >
                  <Plus className="size-3" />
                </button>
              )}
              {assignments.length === 0 && !isEditMode && (
                <span className="text-[11px] text-muted-foreground italic">{t("unassigned")}</span>
              )}
            </div>
          </div>
        )
      })}

      {/* Unassigned staff */}
      {unassigned.length > 0 && (
        <div className="flex flex-col gap-1.5 mt-2">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-muted-foreground/30 shrink-0" />
            <span className="text-[13px] font-medium text-muted-foreground">{t("noTask")}</span>
            <span className="text-[11px] text-muted-foreground">{unassigned.length}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-4">
            {unassigned.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-muted/50 text-[12px] text-muted-foreground"
              >
                <span>{a.staff.first_name} {a.staff.last_name[0]}.</span>
                {isEditMode && (
                  <button
                    onClick={() => onRemoveAssignment(a.id)}
                    className="text-muted-foreground hover:text-destructive ml-0.5"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
