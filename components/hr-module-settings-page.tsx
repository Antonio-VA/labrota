"use client"

import { useState, useTransition } from "react"
import { useTranslations } from "next-intl"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle, Plus, Archive, RotateCcw, Trash2 } from "lucide-react"
import {
  updateHolidayConfig,
  createCompanyLeaveType,
  updateCompanyLeaveType,
  archiveCompanyLeaveType,
  restoreCompanyLeaveType,
  generateBalancesForYear,
  rollOverCarryForward,
  removeHrModule,
  deleteAllHrData,
} from "@/app/(clinic)/settings/hr-module-actions"
import type { CompanyLeaveType, HolidayConfig } from "@/lib/types/database"

interface Props {
  config: HolidayConfig | null
  leaveTypes: CompanyLeaveType[]
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function HrModuleSettingsPage({ config: initialConfig, leaveTypes: initialTypes }: Props) {
  const t = useTranslations("hr")
  const tc = useTranslations("common")
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [config, setConfig] = useState(initialConfig)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [showAddType, setShowAddType] = useState(false)
  const [newType, setNewType] = useState({
    name: "",
    name_en: "",
    has_balance: false,
    default_days: null as number | null,
    allows_carry_forward: false,
    overflow_to_type_id: null as string | null,
    is_paid: true,
    color: "#64748b",
  })

  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState("")

  const saveConfig = (updates: Partial<NonNullable<typeof config>>) => {
    const newConfig = { ...config!, ...updates }
    setConfig(newConfig)
    startTransition(async () => {
      const result = await updateHolidayConfig(updates)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("saveSuccess"))
      }
    })
  }

  const handleAddType = () => {
    if (!newType.name) return
    startTransition(async () => {
      const result = await createCompanyLeaveType(newType)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("saveSuccess"))
        setShowAddType(false)
        setNewType({ name: "", name_en: "", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to_type_id: null, is_paid: true, color: "#64748b" })
        router.refresh()
      }
    })
  }

  const handleArchive = (id: string) => {
    startTransition(async () => {
      const result = await archiveCompanyLeaveType(id)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  const handleRestore = (id: string) => {
    startTransition(async () => {
      const result = await restoreCompanyLeaveType(id)
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  const handleToggleField = (id: string, field: string, value: boolean | number | string | null) => {
    startTransition(async () => {
      const result = await updateCompanyLeaveType(id, { [field]: value })
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

  const handleGenerateBalances = () => {
    startTransition(async () => {
      const result = await generateBalancesForYear(selectedYear)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("balancesGenerated", { created: result.created, skipped: result.skipped }))
      }
    })
  }

  const handleRollOver = () => {
    startTransition(async () => {
      const result = await rollOverCarryForward(selectedYear - 1)
      if (result.error) {
        toast.error(result.error)
      } else {
        toast.success(t("carryForwardProcessed", { processed: result.processed }))
      }
    })
  }

  const handleRemove = () => {
    startTransition(async () => {
      const result = await removeHrModule()
      if (result.error) toast.error(result.error)
      else {
        toast.success(t("removeSuccess"))
        router.push("/settings")
      }
    })
  }

  const handleDeleteData = () => {
    if (deleteInput !== "DELETE") return
    startTransition(async () => {
      const result = await deleteAllHrData()
      if (result.error) toast.error(result.error)
      else {
        toast.success(t("deleteSuccess"))
        router.push("/settings")
      }
    })
  }

  if (!config) return null

  const activeTypes = initialTypes.filter((lt) => !lt.is_archived)
  const archivedTypes = initialTypes.filter((lt) => lt.is_archived)

  return (
    <div className="flex flex-col gap-8">
      {/* Leave Year */}
      <section className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <h2 className="text-[13px] font-medium text-muted-foreground uppercase">{t("leaveYear")}</h2>
        <div className="flex items-center gap-2">
          <label className="text-[14px]">{t("leaveYearStart")}</label>
          <select
            value={config.leave_year_start_month}
            onChange={(e) => saveConfig({ leave_year_start_month: parseInt(e.target.value) })}
            className="border border-border rounded px-2 py-1 text-[14px] bg-background"
            disabled={isPending}
          >
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <span>/</span>
          <input
            type="number"
            min={1}
            max={31}
            value={config.leave_year_start_day}
            onChange={(e) => saveConfig({ leave_year_start_day: parseInt(e.target.value) || 1 })}
            className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background"
            disabled={isPending}
          />
        </div>
      </section>

      {/* Day Counting */}
      <section className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <h2 className="text-[13px] font-medium text-muted-foreground uppercase">{t("dayCounting")}</h2>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="radio"
              name="counting"
              checked={config.counting_method === "working_days"}
              onChange={() => saveConfig({ counting_method: "working_days" })}
              className="accent-primary"
              disabled={isPending}
            />
            {t("workingDays")}
          </label>
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="radio"
              name="counting"
              checked={config.counting_method === "calendar_days"}
              onChange={() => saveConfig({ counting_method: "calendar_days" })}
              className="accent-primary"
              disabled={isPending}
            />
            {t("calendarDays")}
          </label>
          {config.counting_method === "calendar_days" && (
            <label className="flex items-center gap-2 text-[14px] ml-6">
              <input
                type="checkbox"
                checked={config.weekends_deducted}
                onChange={(e) => saveConfig({ weekends_deducted: e.target.checked })}
                className="accent-primary"
                disabled={isPending}
              />
              {t("deductWeekends")}
            </label>
          )}
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={config.public_holidays_deducted}
              onChange={(e) => saveConfig({ public_holidays_deducted: e.target.checked })}
              className="accent-primary"
              disabled={isPending}
            />
            {t("deductPublicHolidays")}
          </label>
        </div>
      </section>

      {/* Carry Forward */}
      <section className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <h2 className="text-[13px] font-medium text-muted-foreground uppercase">{t("carryForwardSettings")}</h2>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={config.carry_forward_allowed}
              onChange={(e) => saveConfig({ carry_forward_allowed: e.target.checked })}
              className="accent-primary"
              disabled={isPending}
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
                  onChange={(e) => saveConfig({ max_carry_forward_days: parseInt(e.target.value) || 0 })}
                  className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background"
                  disabled={isPending}
                />
              </div>
              <div className="flex items-center gap-2 ml-6">
                <label className="text-[14px]">{t("carryForwardExpiry")}</label>
                <select
                  value={config.carry_forward_expiry_month}
                  onChange={(e) => saveConfig({ carry_forward_expiry_month: parseInt(e.target.value) })}
                  className="border border-border rounded px-2 py-1 text-[14px] bg-background"
                  disabled={isPending}
                >
                  {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <span>/</span>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={config.carry_forward_expiry_day}
                  onChange={(e) => saveConfig({ carry_forward_expiry_day: parseInt(e.target.value) || 1 })}
                  className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background"
                  disabled={isPending}
                />
              </div>
            </>
          )}
        </div>
      </section>

      {/* Leave Types */}
      <section className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <h2 className="text-[13px] font-medium text-muted-foreground uppercase">{t("leaveTypes")}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 font-medium">{t("leaveTypeName")}</th>
                <th className="text-center px-2 py-2 font-medium">{t("tracked")}</th>
                <th className="text-center px-2 py-2 font-medium">{t("annualDays")}</th>
                <th className="text-center px-2 py-2 font-medium">{t("carryForward")}</th>
                <th className="text-left px-2 py-2 font-medium">{t("overflowTo")}</th>
                <th className="text-center px-2 py-2 font-medium">{t("paid")}</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {activeTypes.map((lt) => (
                <tr key={lt.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: lt.color }} />
                      <span>{lt.name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={lt.has_balance}
                      onChange={(e) => handleToggleField(lt.id, "has_balance", e.target.checked)}
                      className="accent-primary"
                      disabled={isPending}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {lt.has_balance ? (
                      <input
                        type="number"
                        value={lt.default_days ?? ""}
                        onChange={(e) => handleToggleField(lt.id, "default_days", e.target.value ? parseInt(e.target.value) : null)}
                        className="w-16 border border-border rounded px-2 py-1 text-[14px] text-center bg-background"
                        disabled={isPending}
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={lt.allows_carry_forward}
                      onChange={(e) => handleToggleField(lt.id, "allows_carry_forward", e.target.checked)}
                      className="accent-primary"
                      disabled={isPending || !lt.has_balance}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={lt.overflow_to_type_id ?? ""}
                      onChange={(e) => handleToggleField(lt.id, "overflow_to_type_id", e.target.value || null)}
                      className="border border-border rounded px-2 py-1 text-[14px] bg-background"
                      disabled={isPending}
                    >
                      <option value="">—</option>
                      {activeTypes.filter((t) => t.id !== lt.id).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={lt.is_paid}
                      onChange={(e) => handleToggleField(lt.id, "is_paid", e.target.checked)}
                      className="accent-primary"
                      disabled={isPending}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => handleArchive(lt.id)}
                      disabled={isPending}
                    >
                      <Archive className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {archivedTypes.length > 0 && (
          <div className="mt-2">
            <p className="text-[13px] text-muted-foreground mb-2">{t("archived")}</p>
            {archivedTypes.map((lt) => (
              <div key={lt.id} className="flex items-center justify-between py-1 text-[14px] text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full shrink-0 opacity-40" style={{ backgroundColor: lt.color }} />
                  <span className="line-through">{lt.name}</span>
                  <Badge variant="inactive">{t("archived")}</Badge>
                </div>
                <Button variant="ghost" size="xs" onClick={() => handleRestore(lt.id)} disabled={isPending}>
                  <RotateCcw className="size-3 mr-1" />
                  {t("restoreLeaveType")}
                </Button>
              </div>
            ))}
          </div>
        )}

        {!showAddType ? (
          <Button variant="outline" size="sm" onClick={() => setShowAddType(true)} className="self-start" disabled={isPending}>
            <Plus className="size-4 mr-2" />
            {t("addLeaveType")}
          </Button>
        ) : (
          <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[13px] text-muted-foreground">{t("leaveTypeName")} (ES)</label>
                <input
                  type="text"
                  value={newType.name}
                  onChange={(e) => setNewType((p) => ({ ...p, name: e.target.value }))}
                  className="w-full border border-border rounded px-2 py-1 text-[14px] bg-background mt-1"
                />
              </div>
              <div>
                <label className="text-[13px] text-muted-foreground">{t("leaveTypeName")} (EN)</label>
                <input
                  type="text"
                  value={newType.name_en}
                  onChange={(e) => setNewType((p) => ({ ...p, name_en: e.target.value }))}
                  className="w-full border border-border rounded px-2 py-1 text-[14px] bg-background mt-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={newType.has_balance} onChange={(e) => setNewType((p) => ({ ...p, has_balance: e.target.checked }))} className="accent-primary" />
                {t("tracked")}
              </label>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={newType.is_paid} onChange={(e) => setNewType((p) => ({ ...p, is_paid: e.target.checked }))} className="accent-primary" />
                {t("paid")}
              </label>
              {newType.has_balance && (
                <div className="flex items-center gap-2">
                  <label className="text-[14px]">{t("annualDays")}:</label>
                  <input
                    type="number"
                    value={newType.default_days ?? ""}
                    onChange={(e) => setNewType((p) => ({ ...p, default_days: e.target.value ? parseInt(e.target.value) : null }))}
                    className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={handleAddType} disabled={isPending || !newType.name}>
                {tc("save")}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAddType(false)}>
                {tc("cancel")}
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* Year Balance Management */}
      <section className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <h2 className="text-[13px] font-medium text-muted-foreground uppercase">{t("yearBalanceManagement")}</h2>
        <div className="flex items-center gap-3">
          <label className="text-[14px]">{t("selectYear")}</label>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="border border-border rounded px-2 py-1 text-[14px] bg-background"
          >
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleGenerateBalances} disabled={isPending}>
            {t("generateBalances", { year: selectedYear })}
          </Button>
          <Button variant="outline" size="sm" onClick={handleRollOver} disabled={isPending}>
            {t("rollOverCarryForward", { year: selectedYear - 1 })}
          </Button>
        </div>
      </section>

      {/* Danger Zone */}
      <section className="rounded-lg border border-destructive/30 bg-background px-5 py-4 flex flex-col gap-4">
        <h2 className="text-[13px] font-medium text-destructive uppercase">{t("dangerZone")}</h2>

        {!showRemoveConfirm ? (
          <Button variant="outline" size="sm" onClick={() => setShowRemoveConfirm(true)} disabled={isPending} className="self-start">
            {t("removeButton")}
          </Button>
        ) : (
          <div className="rounded-lg border border-border bg-muted/50 p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[14px] font-medium">{t("removeConfirmTitle")}</p>
                <p className="text-[14px] text-muted-foreground mt-1">{t("removeConfirmMessage")}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowRemoveConfirm(false)}>{tc("cancel")}</Button>
              <Button variant="destructive" size="sm" onClick={handleRemove} disabled={isPending}>{t("removeButton")}</Button>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
