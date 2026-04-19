"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Check, ChevronLeft, ChevronRight, Trash2, Plus } from "lucide-react"
import { DEFAULT_LEAVE_TYPES } from "@/lib/hr-balance-engine"
import {
  installHrModule,
  updateHolidayConfig,
  mapLegacyLeaveType,
  getCompanyLeaveTypes,
} from "@/app/(clinic)/settings/hr-module-actions"
import type { CompanyLeaveType } from "@/lib/types/database"

interface HrSetupWizardProps {
  legacyTypes: string[]
  existingTypes: CompanyLeaveType[]
}

type WizardLeaveType = {
  name: string
  name_en: string
  has_balance: boolean
  default_days: number | null
  allows_carry_forward: boolean
  overflow_to: string | null
  is_paid: boolean
  color: string
}

const LEGACY_TYPE_LABELS: Record<string, { es: string; en: string }> = {
  annual: { es: "Vacaciones", en: "Annual Leave" },
  sick: { es: "Baja por enfermedad", en: "Sick Leave" },
  personal: { es: "Personal", en: "Personal" },
  training: { es: "Formacion", en: "Training" },
  maternity: { es: "Baja por maternidad", en: "Maternity Leave" },
  other: { es: "Otro", en: "Other" },
}

export function HrSetupWizard({ legacyTypes, existingTypes }: HrSetupWizardProps) {
  const t = useTranslations("hr")
  const tc = useTranslations("common")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [step, setStep] = useState(1)

  // Step 1 — Leave types
  const [leaveTypes, setLeaveTypes] = useState<WizardLeaveType[]>(
    DEFAULT_LEAVE_TYPES.map((lt) => ({
      name: lt.name,
      name_en: lt.name_en,
      has_balance: lt.has_balance,
      default_days: lt.default_days,
      allows_carry_forward: lt.allows_carry_forward,
      overflow_to: lt.overflow_to,
      is_paid: lt.is_paid,
      color: lt.color,
    }))
  )

  // Step 2 — Legacy mappings
  const [mappings, setMappings] = useState<Record<string, string>>(
    Object.fromEntries(legacyTypes.map((lt) => {
      const matchName = LEGACY_TYPE_LABELS[lt]?.es
      return [lt, matchName || ""]
    }))
  )

  // Step 3 — Config defaults
  const [config, setConfig] = useState({
    counting_method: "working_days" as "working_days" | "calendar_days",
    public_holidays_deducted: true,
    carry_forward_allowed: true,
    max_carry_forward_days: 5,
    carry_forward_expiry_month: 3,
    carry_forward_expiry_day: 31,
    leave_year_start_month: 1,
    leave_year_start_day: 1,
  })

  const handleRemoveType = (index: number) => {
    setLeaveTypes((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAddType = () => {
    setLeaveTypes((prev) => [
      ...prev,
      {
        name: "",
        name_en: "",
        has_balance: false,
        default_days: null,
        allows_carry_forward: false,
        overflow_to: null,
        is_paid: true,
        color: "#64748b",
      },
    ])
  }

  const handleUpdateType = (index: number, field: keyof WizardLeaveType, value: unknown) => {
    setLeaveTypes((prev) =>
      prev.map((lt, i) => (i === index ? { ...lt, [field]: value } : lt))
    )
  }

  const handleActivate = () => {
    startTransition(async () => {
      // 1. Install the module (seeds leave types + creates config)
      const result = await installHrModule()
      if (result.error) {
        toast.error(result.error)
        return
      }

      // 2. Update config with wizard values
      const configResult = await updateHolidayConfig(config)
      if (configResult.error) {
        toast.error(configResult.error)
        return
      }

      // 3. Map legacy leave types
      const createdTypes = await getCompanyLeaveTypes()
      for (const [legacyType, targetName] of Object.entries(mappings)) {
        if (!targetName) continue
        const target = createdTypes.find((t) => t.name === targetName)
        if (target) {
          await mapLegacyLeaveType(legacyType, target.id)
        }
      }

      toast.success(t("installSuccess"))
      router.push("/settings/hr-module")
      router.refresh()
    })
  }

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

  return (
    <div className="flex flex-col gap-6">
      {/* Progress indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-[14px] font-medium ${
                s < step
                  ? "bg-primary text-primary-foreground"
                  : s === step
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {s < step ? <Check className="size-4" /> : s}
            </div>
            {s < 4 && <div className={`w-12 h-0.5 ${s < step ? "bg-primary" : "bg-border"}`} />}
          </div>
        ))}
      </div>

      {/* Step 1 — Leave Types */}
      {step === 1 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-[14px] font-medium">{t("wizardStep1Title")}</h2>
            <p className="text-[14px] text-muted-foreground mt-1">{t("wizardStep1Desc")}</p>
          </div>

          <div className="rounded-lg border border-border bg-background overflow-hidden">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-3 py-2 font-medium">{t("leaveTypeName")}</th>
                  <th className="text-center px-3 py-2 font-medium">{t("tracked")}</th>
                  <th className="text-center px-3 py-2 font-medium">{t("annualDays")}</th>
                  <th className="text-center px-3 py-2 font-medium">{t("carryForward")}</th>
                  <th className="text-center px-3 py-2 font-medium">{t("paid")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {leaveTypes.map((lt, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={lt.name}
                        onChange={(e) => handleUpdateType(i, "name", e.target.value)}
                        className="w-full border border-border rounded px-2 py-1 text-[14px] bg-background"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={lt.has_balance}
                        onChange={(e) => handleUpdateType(i, "has_balance", e.target.checked)}
                        className="accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      {lt.has_balance ? (
                        <input
                          type="number"
                          value={lt.default_days ?? ""}
                          onChange={(e) => handleUpdateType(i, "default_days", e.target.value ? parseInt(e.target.value) : null)}
                          className="w-16 border border-border rounded px-2 py-1 text-[14px] text-center bg-background"
                        />
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={lt.allows_carry_forward}
                        onChange={(e) => handleUpdateType(i, "allows_carry_forward", e.target.checked)}
                        disabled={!lt.has_balance}
                        className="accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={lt.is_paid}
                        onChange={(e) => handleUpdateType(i, "is_paid", e.target.checked)}
                        className="accent-primary"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => handleRemoveType(i)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button variant="outline" size="sm" onClick={handleAddType} className="self-start">
            <Plus className="size-4 mr-2" />
            {t("addLeaveType")}
          </Button>
        </div>
      )}

      {/* Step 2 — Map Existing Leave Types */}
      {step === 2 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-[14px] font-medium">{t("wizardStep2Title")}</h2>
            <p className="text-[14px] text-muted-foreground mt-1">{t("wizardStep2Desc")}</p>
          </div>

          {legacyTypes.length === 0 ? (
            <p className="text-[14px] text-muted-foreground">{t("noExistingLeaves")}</p>
          ) : (
            <div className="rounded-lg border border-border bg-background overflow-hidden">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="text-left px-3 py-2 font-medium">Existing Type</th>
                    <th className="text-left px-3 py-2 font-medium">{t("mapTo")}</th>
                  </tr>
                </thead>
                <tbody>
                  {legacyTypes.map((lt) => (
                    <tr key={lt} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Badge variant="outline">{LEGACY_TYPE_LABELS[lt]?.en ?? lt}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={mappings[lt] ?? ""}
                          onChange={(e) => setMappings((prev) => ({ ...prev, [lt]: e.target.value }))}
                          className="border border-border rounded px-2 py-1 text-[14px] bg-background"
                        >
                          <option value="">{t("skip")}</option>
                          {leaveTypes.map((wlt) => (
                            <option key={wlt.name} value={wlt.name}>
                              {wlt.name}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Step 3 — Default Configuration */}
      {step === 3 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-[14px] font-medium">{t("wizardStep3Title")}</h2>
            <p className="text-[14px] text-muted-foreground mt-1">{t("wizardStep3Desc")}</p>
          </div>

          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-5">
            {/* Leave Year */}
            <div>
              <label className="text-[13px] font-medium text-muted-foreground uppercase">{t("leaveYear")}</label>
              <div className="flex items-center gap-2 mt-2">
                <label className="text-[14px]">{t("leaveYearStart")}</label>
                <select
                  value={config.leave_year_start_month}
                  onChange={(e) => setConfig((p) => ({ ...p, leave_year_start_month: parseInt(e.target.value) }))}
                  className="border border-border rounded px-2 py-1 text-[14px] bg-background"
                >
                  {MONTHS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <span className="text-[14px]">/</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={config.leave_year_start_day}
                  onChange={(e) => setConfig((p) => ({ ...p, leave_year_start_day: parseInt(e.target.value) || 1 }))}
                  className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background"
                />
              </div>
            </div>

            {/* Day Counting */}
            <div>
              <label className="text-[13px] font-medium text-muted-foreground uppercase">{t("dayCounting")}</label>
              <div className="flex flex-col gap-2 mt-2">
                <label className="flex items-center gap-2 text-[14px]">
                  <input
                    type="radio"
                    name="counting"
                    checked={config.counting_method === "working_days"}
                    onChange={() => setConfig((p) => ({ ...p, counting_method: "working_days" }))}
                    className="accent-primary"
                  />
                  {t("workingDays")}
                </label>
                <label className="flex items-center gap-2 text-[14px]">
                  <input
                    type="radio"
                    name="counting"
                    checked={config.counting_method === "calendar_days"}
                    onChange={() => setConfig((p) => ({ ...p, counting_method: "calendar_days" }))}
                    className="accent-primary"
                  />
                  {t("calendarDays")}
                </label>
                <label className="flex items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    checked={config.public_holidays_deducted}
                    onChange={(e) => setConfig((p) => ({ ...p, public_holidays_deducted: e.target.checked }))}
                    className="accent-primary"
                  />
                  {t("deductPublicHolidays")}
                </label>
              </div>
            </div>

            {/* Carry Forward */}
            <div>
              <label className="text-[13px] font-medium text-muted-foreground uppercase">{t("carryForwardSettings")}</label>
              <div className="flex flex-col gap-2 mt-2">
                <label className="flex items-center gap-2 text-[14px]">
                  <input
                    type="checkbox"
                    checked={config.carry_forward_allowed}
                    onChange={(e) => setConfig((p) => ({ ...p, carry_forward_allowed: e.target.checked }))}
                    className="accent-primary"
                  />
                  {t("allowCarryForward")}
                </label>
                {config.carry_forward_allowed && (
                  <>
                    <div className="flex items-center gap-2 ml-6">
                      <label className="text-[14px]">{t("maxCarryForwardDays")}</label>
                      <input
                        type="number"
                        min={0}
                        value={config.max_carry_forward_days}
                        onChange={(e) => setConfig((p) => ({ ...p, max_carry_forward_days: parseInt(e.target.value) || 0 }))}
                        className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background"
                      />
                    </div>
                    <div className="flex items-center gap-2 ml-6">
                      <label className="text-[14px]">{t("carryForwardExpiry")}</label>
                      <select
                        value={config.carry_forward_expiry_month}
                        onChange={(e) => setConfig((p) => ({ ...p, carry_forward_expiry_month: parseInt(e.target.value) }))}
                        className="border border-border rounded px-2 py-1 text-[14px] bg-background"
                      >
                        {MONTHS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                      <span className="text-[14px]">/</span>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={config.carry_forward_expiry_day}
                        onChange={(e) => setConfig((p) => ({ ...p, carry_forward_expiry_day: parseInt(e.target.value) || 1 }))}
                        className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 4 — Review & Activate */}
      {step === 4 && (
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="text-[14px] font-medium">{t("wizardStep4Title")}</h2>
            <p className="text-[14px] text-muted-foreground mt-1">{t("wizardStep4Desc")}</p>
          </div>

          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
            <div className="flex justify-between text-[14px]">
              <span className="text-muted-foreground">{t("leaveTypes")}</span>
              <span>{t("leaveTypesSummary", { count: leaveTypes.length })}</span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-muted-foreground">{t("countingMethodSummary")}</span>
              <span>{config.counting_method === "working_days" ? t("workingDays") : t("calendarDays")}</span>
            </div>
            <div className="flex justify-between text-[14px]">
              <span className="text-muted-foreground">{t("carryForwardSummary")}</span>
              <span>
                {config.carry_forward_allowed
                  ? t("cfAllowed", { days: config.max_carry_forward_days, month: config.carry_forward_expiry_month, day: config.carry_forward_expiry_day })
                  : t("cfNotAllowed")}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4 border-t border-border">
        <div>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isPending}>
              <ChevronLeft className="size-4 mr-1" />
              {tc("back")}
            </Button>
          )}
        </div>
        <div>
          {step < 4 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={isPending}>
              {tc("next")}
              <ChevronRight className="size-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleActivate} disabled={isPending}>
              {isPending ? tc("saving") : t("activateButton")}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
