"use client"

import { useState, useRef, useEffect } from "react"
import { useTranslations } from "next-intl"
import { RefreshCw, Info } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { usePersistedState } from "@/hooks/use-persisted-state"
import type { StaffWithSkills, Tecnica, Department } from "@/lib/types/database"
import { calculateOptimalHeadcount, type HeadcountResult } from "@/app/(clinic)/staff/actions"

export function StaffKpis({
  staff,
  tecnicas,
  departments,
  deptBorder,
  maxStaff,
  t,
}: {
  staff: StaffWithSkills[]
  tecnicas: Tecnica[]
  departments: Department[]
  deptBorder: Record<string, string>
  maxStaff: number
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const ts = useTranslations("staff")

  const [headcount, setHeadcount] = usePersistedState<HeadcountResult | null>("labrota_headcount", null)
  const [headcountLoading, setHeadcountLoading] = useState(false)
  const [headcountOpen, setHeadcountOpen] = useState(false)
  const headcountRef = useRef<HTMLDivElement>(null)

   
  useEffect(() => {
    if (headcount !== null) return
    setHeadcountLoading(true)
    calculateOptimalHeadcount().then((res) => {
      if (res.data) setHeadcount(res.data)
      else console.error("Headcount calculation failed:", res.error)
      setHeadcountLoading(false)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
   

  useEffect(() => {
    if (!headcountOpen) return
    function h(e: MouseEvent) { if (headcountRef.current && !headcountRef.current.contains(e.target as Node)) setHeadcountOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [headcountOpen])

  async function recalculateHeadcount() {
    setHeadcountLoading(true)
    const res = await calculateOptimalHeadcount()
    if (res.data) {
      setHeadcount(res.data)
      toast.success(ts("recalculated"))
    } else {
      toast.error(res.error ?? "Error")
    }
    setHeadcountLoading(false)
  }

  const kpiActiveStaff = staff.filter((s) => s.onboarding_status !== "inactive")
  const kpiActiveOnly = staff.filter((s) => s.onboarding_status === "active")
  const kpiAvailable = maxStaff - kpiActiveOnly.length
  const isOverLimit = kpiActiveOnly.length > maxStaff
  const kpiActiveTecnicas = tecnicas.filter((tc) => tc.activa)
  const kpiFullyValidated = kpiActiveStaff.filter((s) => {
    if (s.role === "admin") return false
    const deptTecnicas = kpiActiveTecnicas.filter((tc) => tc.department.split(",").includes(s.role))
    if (deptTecnicas.length === 0) return false
    const certifiedCodes = new Set(s.staff_skills.filter((sk) => sk.level === "certified").map((sk) => sk.skill))
    return deptTecnicas.every((tc) => certifiedCodes.has(tc.codigo))
  }).length

  return (
    <>
      <div className="-mx-6 md:-mx-8 -mt-6 md:-mt-8 px-6 md:px-8 pt-6 md:pt-8 pb-5 bg-muted/40 border-b border-border mb-5">
        <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
          {/* Active headcount */}
          <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
            <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{t("kpiActive")}</p>
            <div className="flex items-baseline gap-2 mt-0.5">
              <p className="text-[22px] font-semibold text-foreground leading-tight">{kpiActiveStaff.length}</p>
              <div className="flex items-center gap-1">
                {departments.filter((d) => kpiActiveStaff.some((s) => s.role === d.code)).map((d) => {
                  const count = kpiActiveStaff.filter((s) => s.role === d.code).length
                  return (
                    <Tooltip key={d.code}>
                      <TooltipTrigger render={
                        <span className="text-[10px] px-1 py-0.5 rounded cursor-default" style={{ backgroundColor: `${deptBorder[d.code] ?? "#94A3B8"}20`, color: deptBorder[d.code] ?? "#94A3B8" }}>
                          {count}
                        </span>
                      } />
                      <TooltipContent side="bottom">{d.name}: {count}</TooltipContent>
                    </Tooltip>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Minimum headcount (recommended) */}
          <div ref={headcountRef} className="relative rounded-xl border border-border/60 bg-background px-4 py-3">
            <div className="flex items-center gap-1.5">
              <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">
                {t("kpiOptimalHeadcount")} <span className="normal-case font-normal">({ts("recommended")})</span>
              </p>
              <button
                onClick={() => setHeadcountOpen(!headcountOpen)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info className="size-3" />
              </button>
            </div>
            {headcountLoading ? (
              <div className="h-7 w-12 rounded bg-muted animate-pulse mt-1" />
            ) : headcount ? (
              <div className="flex items-baseline gap-2 mt-0.5">
                <p className="text-[22px] font-semibold text-foreground leading-tight">{headcount.total}</p>
                <div className="flex items-center gap-1">
                  {headcount.breakdown.map((d) => (
                    <span key={d.department} className="text-[10px] px-1 py-0.5 rounded" style={{ backgroundColor: `${deptBorder[d.department] ?? "#94A3B8"}20`, color: deptBorder[d.department] ?? "#94A3B8" }}>
                      {d.headcount}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[22px] font-semibold text-muted-foreground mt-0.5 leading-tight">—</p>
            )}

            {headcountOpen && headcount && (
              <div className="absolute left-0 top-full mt-1 z-50 w-[340px] rounded-xl border border-border bg-background shadow-xl p-4 flex flex-col gap-3">
                <p className="text-[13px] text-muted-foreground">{headcount.explanation}</p>
                <div className="flex flex-col gap-2">
                  {headcount.breakdown.map((d) => (
                    <div key={d.department} className="flex items-start gap-2">
                      <span className="mt-1 size-2 rounded-full shrink-0" style={{ backgroundColor: deptBorder[d.department] ?? "#94A3B8" }} />
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-[13px] font-medium">{d.label}</span>
                          <span className="text-[13px] font-semibold">{d.headcount}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground">{d.explanation}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={recalculateHeadcount}
                  disabled={headcountLoading}
                  className="flex items-center gap-1.5 text-[12px] text-primary hover:underline self-end disabled:opacity-50"
                >
                  <RefreshCw className={cn("size-3", headcountLoading && "animate-spin")} />
                  {ts("recalculate")}
                </button>
              </div>
            )}
          </div>

          {/* Training */}
          <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
            <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{t("kpiTraining")}</p>
            <p className="text-[22px] font-semibold text-foreground mt-0.5 leading-tight">{kpiActiveStaff.filter((s) => s.staff_skills.some((sk) => sk.level === "training")).length}</p>
          </div>

          {/* Full Validation */}
          <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
            <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{t("kpiFullValidation")}</p>
            <p className="text-[22px] font-semibold text-foreground mt-0.5 leading-tight">{kpiFullyValidated}</p>
          </div>

          {/* Available slots */}
          <div className={cn("rounded-xl border bg-background px-4 py-3", isOverLimit ? "border-destructive/40" : "border-border/60")}>
            <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{t("kpiAvailable")}</p>
            <div className="flex items-baseline gap-1 mt-0.5">
              <p className={cn("text-[22px] font-semibold leading-tight", isOverLimit ? "text-destructive" : "text-foreground")}>
                {kpiAvailable}
              </p>
              <p className="text-[14px] text-muted-foreground">/ {maxStaff}</p>
            </div>
          </div>
        </div>
      </div>

      {isOverLimit && (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 mb-1">
          <span className="text-destructive mt-0.5">⚠</span>
          <p className="text-[13px] text-destructive leading-snug">
            {ts.rich("overLimitMessage", {
              maxStaff,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      )}
    </>
  )
}
