"use client"

import { Fragment } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type {
  Department,
  ShiftTypeDefinition,
  Tecnica,
} from "@/lib/types/database"
import { DAY_KEYS, isWeekendKey } from "./shared"

export function TaskCoverageSection({
  enabled,
  onToggle,
  taskCoverage,
  setTaskCov,
  tecnicas,
  departments,
  shiftTypes,
  disabled,
}: {
  enabled: boolean
  onToggle: () => void
  taskCoverage: Record<string, Record<string, number>>
  setTaskCov: (code: string, day: string, raw: string) => void
  tecnicas: Tecnica[]
  departments: Department[]
  shiftTypes: ShiftTypeDefinition[]
  disabled: boolean
}) {
  const t = useTranslations("lab")
  const activeShifts = shiftTypes.filter((st) => st.active !== false)

  return (
    <div className="rounded-lg border border-border bg-background overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium">{t("fields.taskCoverageOptional")}</span>
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            enabled ? "bg-emerald-500" : "bg-muted-foreground/20"
          )}
        >
          <span className={cn(
            "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
            enabled ? "translate-x-5" : "translate-x-0"
          )} />
        </button>
      </div>
      {!enabled ? (
        <div className="px-5 py-4">
          <p className="text-[13px] text-muted-foreground">{t("fields.taskCoverageDisabledHint")}</p>
        </div>
      ) : (
        <TaskCoverageTable
          taskCoverage={taskCoverage}
          setTaskCov={setTaskCov}
          tecnicas={tecnicas}
          departments={departments}
          activeShifts={activeShifts}
          disabled={disabled}
        />
      )}
    </div>
  )
}

function TaskCoverageTable({
  taskCoverage,
  setTaskCov,
  tecnicas,
  departments,
  activeShifts,
  disabled,
}: {
  taskCoverage: Record<string, Record<string, number>>
  setTaskCov: (code: string, day: string, raw: string) => void
  tecnicas: Tecnica[]
  departments: Department[]
  activeShifts: ShiftTypeDefinition[]
  disabled: boolean
}) {
  const t = useTranslations("lab")
  const rootDepts = departments.length > 0
    ? departments.filter((d) => !d.parent_id)
    : [
        { id: "lab", code: "lab", name: t("fields.embryology") },
        { id: "andrology", code: "andrology", name: t("fields.andrology") },
      ] as Array<Pick<Department, "id" | "code" | "name">>
  const activeTecnicas = tecnicas.filter((tc) => tc.activa).sort((a, b) => a.orden - b.orden)
  const activeShiftCodes = activeShifts.map((st) => st.code)
  const shiftLabelMap: Record<string, string> = {}
  for (const st of activeShifts) shiftLabelMap[st.code] = st.name_es || st.code

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-muted border-b border-border">
            <th className="px-3 py-2 text-left font-medium text-muted-foreground w-[140px]">{t("fields.taskColumn")}</th>
            {DAY_KEYS.map((day) => (
              <th key={day} className="px-1 py-2 text-center font-medium text-muted-foreground w-[52px]">
                {t(`days.${day}`).slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rootDepts.map((dept) => {
            const deptTecnicas = activeTecnicas.filter((tc) => tc.department.split(",").includes(dept.code))
            if (deptTecnicas.length === 0) return null

            type CovRow = { tec: typeof deptTecnicas[0]; covKey: string; shiftCode?: string }
            const rows: CovRow[] = []
            for (const tec of deptTecnicas) {
              const ts = tec.typical_shifts ?? []
              const inMultipleShifts = ts.length > 1 || (ts.length === 0 && activeShiftCodes.length > 1)
              if (inMultipleShifts) {
                const shifts = ts.length > 0 ? ts : activeShiftCodes
                for (const sc of shifts) rows.push({ tec, covKey: `${tec.codigo}__${sc}`, shiftCode: sc })
              } else {
                rows.push({ tec, covKey: tec.codigo })
              }
            }

            return (
              <Fragment key={dept.id ?? dept.code}>
                <tr className="bg-muted/60">
                  <td colSpan={8} className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {dept.name} <span className="text-muted-foreground/50 ml-1">{deptTecnicas.length}</span>
                  </td>
                </tr>
                {rows.map((row, idx) => (
                  <tr key={row.covKey} className={cn("border-b border-border/50", idx % 2 === 0 ? "bg-background" : "bg-muted/10")}>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2 rounded-full shrink-0"
                          style={{ backgroundColor: row.tec.color?.startsWith("#") ? row.tec.color : "#64748B" }}
                        />
                        <span className="text-[13px] font-medium">{row.tec.codigo}</span>
                        <span className="text-[11px] text-muted-foreground truncate max-w-[80px]">{row.tec.nombre_es}</span>
                        {row.shiftCode && (
                          <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold uppercase leading-none bg-muted text-muted-foreground border border-border">
                            {shiftLabelMap[row.shiftCode] ?? row.shiftCode}
                          </span>
                        )}
                      </span>
                    </td>
                    {DAY_KEYS.map((day) => {
                      const explicitVal = taskCoverage[row.covKey]?.[day]
                      return (
                        <td key={day} className={cn("px-1 py-1 text-center", isWeekendKey(day) && "bg-muted/30")}>
                          <input
                            type="number" min={0} value={explicitVal ?? ""}
                            onChange={(e) => setTaskCov(row.covKey, day, e.target.value)}
                            disabled={disabled}
                            className={cn(
                              "w-12 h-7 rounded border text-center text-[13px] outline-none disabled:opacity-50 mx-auto block",
                              explicitVal !== undefined
                                ? "border-input bg-background text-foreground"
                                : "border-input bg-background text-muted-foreground/40",
                              "focus:border-ring focus:ring-1 focus:ring-ring/50"
                            )}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
