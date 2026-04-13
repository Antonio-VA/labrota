"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"
import type { ExtractedData, ExtractedStaff, ExtractedShift, ExtractedTechnique, ExtractedRule, ExtractedLabSettings } from "@/lib/types/import"
import { ConfidenceBadge, ReviewSection } from "./ui-helpers"

type Step = "upload" | "extracting" | "review" | "importing" | "done"

export function ReviewStep({
  extracted,
  setRotaMode,
  updateCoverage,
  updatePunctions,
  updateLabSettings,
  updateStaff,
  updateShift,
  updateTechnique,
  updateRule,
  startImport,
  setStep,
  t,
}: {
  extracted: ExtractedData
  setRotaMode: (type: "by_task" | "by_shift") => void
  updateCoverage: (period: "weekday" | "saturday" | "sunday", dept: "lab" | "andrology" | "admin", value: number) => void
  updatePunctions: (period: "weekday" | "saturday" | "sunday", value: number) => void
  updateLabSettings: (updates: Partial<ExtractedLabSettings>) => void
  updateStaff: (idx: number, updates: Partial<ExtractedStaff>) => void
  updateShift: (idx: number, updates: Partial<ExtractedShift>) => void
  updateTechnique: (idx: number, updates: Partial<ExtractedTechnique>) => void
  updateRule: (idx: number, updates: Partial<ExtractedRule>) => void
  startImport: () => void
  setStep: (step: Step) => void
  t: (key: string, params?: Record<string, any>) => string
}) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-medium">{t("reviewTitle")}</h2>
        <p className="text-[14px] text-muted-foreground mt-1">{t("reviewDescription")}</p>
      </div>

      {/* 1. Rota mode — radio toggle (first decision) */}
      <ReviewSection title={t("rotaModeTitle")} count={0} hideCount>
        <div className="flex flex-col gap-3">
          <label className={cn(
            "flex items-start gap-3 px-3 py-3 rounded-lg border cursor-pointer transition-colors",
            extracted.rota_mode?.type === "by_task" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
          )}>
            <input
              type="radio"
              name="rota_mode"
              checked={extracted.rota_mode?.type === "by_task"}
              onChange={() => setRotaMode("by_task")}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-[14px] font-medium">
                {t("rotaModeByTask")}
                {extracted.rota_mode?.type === "by_task" && extracted.rota_mode.confidence > 0 && (
                  <> <ConfidenceBadge confidence={extracted.rota_mode.confidence} /></>
                )}
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5">{t("rotaModeByTaskHint")}</p>
            </div>
          </label>
          <label className={cn(
            "flex items-start gap-3 px-3 py-3 rounded-lg border cursor-pointer transition-colors",
            extracted.rota_mode?.type === "by_shift" ? "border-primary bg-primary/5" : "border-border hover:border-primary/30"
          )}>
            <input
              type="radio"
              name="rota_mode"
              checked={extracted.rota_mode?.type === "by_shift"}
              onChange={() => setRotaMode("by_shift")}
              className="mt-0.5"
            />
            <div className="flex-1">
              <p className="text-[14px] font-medium">
                {t("rotaModeByShift")}
                {extracted.rota_mode?.type === "by_shift" && extracted.rota_mode.confidence > 0 && (
                  <> <ConfidenceBadge confidence={extracted.rota_mode.confidence} /></>
                )}
              </p>
              <p className="text-[12px] text-muted-foreground mt-0.5">{t("rotaModeByShiftHint")}</p>
            </div>
          </label>
          {extracted.rota_mode?.reasoning && (
            <p className="text-[11px] text-muted-foreground/70 italic px-1">{extracted.rota_mode.reasoning}</p>
          )}
        </div>
      </ReviewSection>

      {/* 2. Task coverage (only for by_task mode) */}
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

      {/* 3. Lab settings — editable configuration */}
      {extracted.lab_settings && (
        <ReviewSection title={t("labSettingsTitle")} count={0} hideCount>
          <div className="flex flex-col gap-5">
            {/* Coverage grid */}
            <div>
              <p className="text-[13px] font-medium mb-2">{t("coverageTitle")}</p>
              <div className="overflow-x-auto">
                <table className="text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-2 px-2 font-medium w-24"></th>
                      <th className="py-2 px-2 font-medium text-center w-20">Lab</th>
                      <th className="py-2 px-2 font-medium text-center w-20">Andr.</th>
                      <th className="py-2 px-2 font-medium text-center w-20">Admin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["weekday", "saturday", "sunday"] as const).map((period) => (
                      <tr key={period} className="border-b border-border/50">
                        <td className="py-1.5 px-2 text-muted-foreground">
                          {t(period === "weekday" ? "coverageWeekday" : period === "saturday" ? "coverageSaturday" : "coverageSunday")}
                        </td>
                        {(["lab", "andrology", "admin"] as const).map((dept) => (
                          <td key={dept} className="py-1.5 px-2 text-center">
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={extracted.lab_settings!.coverage_by_day[period][dept]}
                              onChange={(e) => updateCoverage(period, dept, Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))}
                              className="w-14 text-center rounded border border-border bg-transparent py-1 text-[13px] outline-none focus:border-primary"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Punctions */}
            <div>
              <p className="text-[13px] font-medium mb-2">{t("punctionsTitle")}</p>
              <div className="flex items-center gap-4">
                {(["weekday", "saturday", "sunday"] as const).map((period) => (
                  <div key={period} className="flex items-center gap-1.5">
                    <span className="text-[12px] text-muted-foreground">
                      {t(period === "weekday" ? "coverageWeekday" : period === "saturday" ? "coverageSaturday" : "coverageSunday")}:
                    </span>
                    <input
                      type="number"
                      min={0}
                      max={20}
                      value={extracted.lab_settings!.punctions_by_day[period]}
                      onChange={(e) => updatePunctions(period, Math.max(0, Math.min(20, parseInt(e.target.value) || 0)))}
                      className="w-14 text-center rounded border border-border bg-transparent py-1 text-[13px] outline-none focus:border-primary"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Days off preference */}
            <div>
              <p className="text-[13px] font-medium mb-2">{t("daysOffTitle")}</p>
              <div className="flex items-center gap-4">
                {(["always_weekend", "prefer_weekend", "any_day"] as const).map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="days_off_pref"
                      checked={extracted.lab_settings!.days_off_preference === opt}
                      onChange={() => updateLabSettings({ days_off_preference: opt })}
                    />
                    <span className="text-[13px]">
                      {t(opt === "always_weekend" ? "daysOffAlwaysWeekend" : opt === "prefer_weekend" ? "daysOffPreferWeekend" : "daysOffAnyDay")}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Shift rotation */}
            <div>
              <p className="text-[13px] font-medium mb-2">{t("shiftRotationTitle")}</p>
              <div className="flex items-center gap-4">
                {(["stable", "weekly", "daily"] as const).map((opt) => (
                  <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="shift_rotation"
                      checked={extracted.lab_settings!.shift_rotation === opt}
                      onChange={() => updateLabSettings({ shift_rotation: opt })}
                    />
                    <span className="text-[13px]">
                      {t(opt === "stable" ? "shiftRotationStable" : opt === "weekly" ? "shiftRotationWeekly" : "shiftRotationDaily")}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Admin on weekends */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={extracted.lab_settings!.admin_on_weekends}
                onChange={(e) => updateLabSettings({ admin_on_weekends: e.target.checked })}
                className="rounded"
              />
              <span className="text-[13px]">{t("adminOnWeekends")}</span>
            </label>
          </div>
        </ReviewSection>
      )}

      {/* 4. Staff */}
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

      {/* 5. Shifts */}
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

      {/* 6. Techniques */}
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

      {/* 7. Rules */}
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
  )
}
