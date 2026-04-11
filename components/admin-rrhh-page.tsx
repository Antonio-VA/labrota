"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Archive, RotateCcw, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { CompanyLeaveType, HolidayConfig } from "@/lib/types/database"
import {
  adminUpdateHolidayConfig,
  adminCreateCompanyLeaveType,
  adminUpdateCompanyLeaveType,
  adminGenerateBalancesForYear,
  adminRollOverCarryForward,
  adminRemoveHrModule,
} from "@/app/admin/hr-module-actions"

type Tab = "configuracion" | "saldos" | "tipos"

const TAB_LABELS: Record<Tab, string> = {
  configuracion: "Configuración",
  saldos: "Gestión de saldos",
  tipos: "Tipos de ausencia",
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

interface Props {
  orgId: string
  config: HolidayConfig | null
  leaveTypes: CompanyLeaveType[]
}

export function AdminRrhhPage({ orgId, config: initialConfig, leaveTypes: initialTypes }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>("configuracion")

  // ── Config state (with save button) ─────────────────────────────────────
  const [config, setConfig] = useState(initialConfig)
  const [configDirty, setConfigDirty] = useState(false)

  const updateConfig = (updates: Partial<NonNullable<typeof config>>) => {
    setConfig((p) => p ? { ...p, ...updates } : p)
    setConfigDirty(true)
  }

  const handleSaveConfig = () => {
    if (!config || !configDirty) return
    startTransition(async () => {
      const { id, organisation_id, created_at, updated_at, ...rest } = config
      const result = await adminUpdateHolidayConfig(orgId, rest)
      if (result.error) toast.error(result.error)
      else { toast.success("Guardado"); setConfigDirty(false) }
    })
  }

  // ── Leave types state (with save button) ────────────────────────────────
  const [editedTypes, setEditedTypes] = useState<CompanyLeaveType[]>(initialTypes)
  const [typesDirty, setTypesDirty] = useState(false)
  const [showAddType, setShowAddType] = useState(false)
  const [newType, setNewType] = useState({ name: "", name_en: "", has_balance: false, default_days: null as number | null, allows_carry_forward: false, overflow_to_type_id: null as string | null, is_paid: true, color: "#64748b" })

  const updateTypeField = (id: string, field: string, value: boolean | number | string | null) => {
    setEditedTypes((prev) => prev.map((lt) => lt.id === id ? { ...lt, [field]: value } : lt))
    setTypesDirty(true)
  }

  const handleSaveTypes = () => {
    startTransition(async () => {
      const changed = editedTypes.filter((lt) => {
        const orig = initialTypes.find((o) => o.id === lt.id)
        if (!orig) return false
        return lt.has_balance !== orig.has_balance || lt.default_days !== orig.default_days ||
          lt.allows_carry_forward !== orig.allows_carry_forward || lt.overflow_to_type_id !== orig.overflow_to_type_id ||
          lt.is_paid !== orig.is_paid || lt.is_archived !== orig.is_archived
      })
      for (const lt of changed) {
        const result = await adminUpdateCompanyLeaveType(lt.id, {
          has_balance: lt.has_balance, default_days: lt.default_days,
          allows_carry_forward: lt.allows_carry_forward, overflow_to_type_id: lt.overflow_to_type_id,
          is_paid: lt.is_paid, is_archived: lt.is_archived,
        })
        if (result.error) { toast.error(result.error); return }
      }
      toast.success("Guardado"); setTypesDirty(false); router.refresh()
    })
  }

  const handleAddType = () => {
    if (!newType.name) return
    startTransition(async () => {
      const result = await adminCreateCompanyLeaveType(orgId, newType)
      if (result.error) toast.error(result.error)
      else {
        toast.success("Guardado"); setShowAddType(false)
        setNewType({ name: "", name_en: "", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to_type_id: null, is_paid: true, color: "#64748b" })
        router.refresh()
      }
    })
  }

  // ── Year balance management ─────────────────────────────────────────────
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  const handleGenerateBalances = () => {
    startTransition(async () => {
      const result = await adminGenerateBalancesForYear(orgId, selectedYear)
      if (result.error) toast.error(result.error)
      else toast.success(`${result.created} saldos creados, ${result.skipped} omitidos`)
    })
  }

  const handleRollOver = () => {
    startTransition(async () => {
      const result = await adminRollOverCarryForward(orgId, selectedYear - 1)
      if (result.error) toast.error(result.error)
      else toast.success(`${result.processed} registros de arrastre procesados`)
    })
  }

  // ── Danger zone ─────────────────────────────────────────────────────────
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  const handleRemove = () => {
    startTransition(async () => {
      const result = await adminRemoveHrModule(orgId)
      if (result.error) toast.error(result.error)
      else { toast.success("Módulo RRHH desinstalado"); router.push(`/orgs/${orgId}`); router.refresh() }
    })
  }

  const activeTypes = editedTypes.filter((lt) => !lt.is_archived)
  const archivedTypes = editedTypes.filter((lt) => lt.is_archived)

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex border-b border-border -mb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "px-4 py-2 text-[14px] font-medium border-b-2 -mb-px transition-colors whitespace-nowrap",
              tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {/* ── Tab: Configuración ──────────────────────────────────────────── */}
      {tab === "configuracion" && config && (
        <div className="flex flex-col gap-5">
          {/* Leave Year */}
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
            <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Año de vacaciones</h3>
            <div className="flex items-center gap-2">
              <span className="text-[14px]">El año comienza</span>
              <select value={config.leave_year_start_month} onChange={(e) => updateConfig({ leave_year_start_month: parseInt(e.target.value) })} className="border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
                {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <span>/</span>
              <input type="number" min={1} max={31} value={config.leave_year_start_day} onChange={(e) => updateConfig({ leave_year_start_day: parseInt(e.target.value) || 1 })} className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending} />
            </div>
          </div>

          {/* Day counting */}
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
            <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Conteo de días</h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="radio" name="counting" checked={config.counting_method === "working_days"} onChange={() => updateConfig({ counting_method: "working_days" })} className="accent-primary" disabled={isPending} />
                Días laborables (lun–vie)
              </label>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="radio" name="counting" checked={config.counting_method === "calendar_days"} onChange={() => updateConfig({ counting_method: "calendar_days" })} className="accent-primary" disabled={isPending} />
                Días naturales
              </label>
              {config.counting_method === "calendar_days" && (
                <label className="flex items-center gap-2 text-[14px] ml-6">
                  <input type="checkbox" checked={config.weekends_deducted} onChange={(e) => updateConfig({ weekends_deducted: e.target.checked })} className="accent-primary" disabled={isPending} />
                  Descontar fines de semana
                </label>
              )}
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={config.public_holidays_deducted} onChange={(e) => updateConfig({ public_holidays_deducted: e.target.checked })} className="accent-primary" disabled={isPending} />
                Descontar festivos
              </label>
            </div>
          </div>

          {/* Carry forward */}
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
            <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Arrastre de días</h3>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={config.carry_forward_allowed} onChange={(e) => updateConfig({ carry_forward_allowed: e.target.checked })} className="accent-primary" disabled={isPending} />
                Permitir arrastre
              </label>
              {config.carry_forward_allowed && (
                <>
                  <div className="flex items-center gap-2 ml-6">
                    <span className="text-[14px]">Máximo días</span>
                    <input type="number" min={0} value={config.max_carry_forward_days} onChange={(e) => updateConfig({ max_carry_forward_days: parseInt(e.target.value) || 0 })} className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending} />
                  </div>
                  <div className="flex items-center gap-2 ml-6">
                    <span className="text-[14px]">Caduca</span>
                    <select value={config.carry_forward_expiry_month} onChange={(e) => updateConfig({ carry_forward_expiry_month: parseInt(e.target.value) })} className="border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
                      {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <span>/</span>
                    <input type="number" min={1} max={31} value={config.carry_forward_expiry_day} onChange={(e) => updateConfig({ carry_forward_expiry_day: parseInt(e.target.value) || 1 })} className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending} />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Save button */}
          {configDirty && (
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveConfig} disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
              <Button variant="outline" onClick={() => { setConfig(initialConfig); setConfigDirty(false) }} disabled={isPending}>
                Cancelar
              </Button>
            </div>
          )}

          {/* Danger zone */}
          <div className="rounded-lg border border-destructive/30 bg-background px-5 py-4 flex flex-col gap-4 mt-4">
            <h3 className="text-[13px] font-medium text-destructive uppercase">Zona de peligro</h3>
            {!showRemoveConfirm ? (
              <Button variant="outline" size="sm" onClick={() => setShowRemoveConfirm(true)} disabled={isPending} className="self-start">
                Desinstalar módulo RRHH
              </Button>
            ) : (
              <div className="rounded-lg border border-border bg-muted/50 p-4 flex flex-col gap-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="size-5 text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[14px] font-medium">Desinstalar módulo RRHH</p>
                    <p className="text-[14px] text-muted-foreground mt-1">Los datos se conservarán y se pueden restaurar reinstalando.</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowRemoveConfirm(false)}>Cancelar</Button>
                  <Button variant="destructive" size="sm" onClick={handleRemove} disabled={isPending}>Desinstalar</Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Gestión de saldos ──────────────────────────────────────── */}
      {tab === "saldos" && (
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
            <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Gestión de saldos anuales</h3>
            <div className="flex items-center gap-3">
              <span className="text-[14px]">Año</span>
              <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="border border-border rounded px-2 py-1 text-[14px] bg-background">
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleGenerateBalances} disabled={isPending}>
                Generar saldos para {selectedYear}
              </Button>
              <Button variant="outline" size="sm" onClick={handleRollOver} disabled={isPending}>
                Traspasar arrastre de {selectedYear - 1}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Tipos de ausencia ──────────────────────────────────────── */}
      {tab === "tipos" && (
        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
            <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Tipos de ausencia</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-3 py-2 font-medium">Nombre</th>
                    <th className="text-center px-2 py-2 font-medium">Controlado</th>
                    <th className="text-center px-2 py-2 font-medium">Días</th>
                    <th className="text-center px-2 py-2 font-medium">Arrastre</th>
                    <th className="text-left px-2 py-2 font-medium">Desbord.</th>
                    <th className="text-center px-2 py-2 font-medium">Remunerado</th>
                    <th className="w-10" />
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
                        <input type="checkbox" checked={lt.has_balance} onChange={(e) => updateTypeField(lt.id, "has_balance", e.target.checked)} className="accent-primary" disabled={isPending} />
                      </td>
                      <td className="px-2 py-2 text-center">
                        {lt.has_balance ? (
                          <input type="number" value={lt.default_days ?? ""} onChange={(e) => updateTypeField(lt.id, "default_days", e.target.value ? parseInt(e.target.value) : null)} className="w-16 border border-border rounded px-2 py-1 text-[14px] text-center bg-background" disabled={isPending} />
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={lt.allows_carry_forward} onChange={(e) => updateTypeField(lt.id, "allows_carry_forward", e.target.checked)} className="accent-primary" disabled={isPending || !lt.has_balance} />
                      </td>
                      <td className="px-2 py-2">
                        <select value={lt.overflow_to_type_id ?? ""} onChange={(e) => updateTypeField(lt.id, "overflow_to_type_id", e.target.value || null)} className="border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
                          <option value="">—</option>
                          {activeTypes.filter((t) => t.id !== lt.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2 text-center">
                        <input type="checkbox" checked={lt.is_paid} onChange={(e) => updateTypeField(lt.id, "is_paid", e.target.checked)} className="accent-primary" disabled={isPending} />
                      </td>
                      <td className="px-2 py-2">
                        <Button variant="ghost" size="icon-xs" onClick={() => updateTypeField(lt.id, "is_archived", true)} disabled={isPending}>
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
                <p className="text-[13px] text-muted-foreground mb-2">Archivados</p>
                {archivedTypes.map((lt) => (
                  <div key={lt.id} className="flex items-center justify-between py-1 text-[14px] text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0 opacity-40" style={{ backgroundColor: lt.color }} />
                      <span className="line-through">{lt.name}</span>
                      <Badge variant="inactive">Archivado</Badge>
                    </div>
                    <Button variant="ghost" size="xs" onClick={() => updateTypeField(lt.id, "is_archived", false)} disabled={isPending}>
                      <RotateCcw className="size-3 mr-1" />Restaurar
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {!showAddType ? (
              <Button variant="outline" size="sm" onClick={() => setShowAddType(true)} className="self-start" disabled={isPending}>
                <Plus className="size-4 mr-2" />Añadir tipo de ausencia
              </Button>
            ) : (
              <div className="border border-border rounded-lg p-4 flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[13px] text-muted-foreground">Nombre (ES)</label>
                    <input type="text" value={newType.name} onChange={(e) => setNewType((p) => ({ ...p, name: e.target.value }))} className="w-full border border-border rounded px-2 py-1 text-[14px] bg-background mt-1" />
                  </div>
                  <div>
                    <label className="text-[13px] text-muted-foreground">Name (EN)</label>
                    <input type="text" value={newType.name_en} onChange={(e) => setNewType((p) => ({ ...p, name_en: e.target.value }))} className="w-full border border-border rounded px-2 py-1 text-[14px] bg-background mt-1" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={newType.has_balance} onChange={(e) => setNewType((p) => ({ ...p, has_balance: e.target.checked }))} className="accent-primary" />Controlado</label>
                  <label className="flex items-center gap-2 text-[14px]"><input type="checkbox" checked={newType.is_paid} onChange={(e) => setNewType((p) => ({ ...p, is_paid: e.target.checked }))} className="accent-primary" />Remunerado</label>
                  {newType.has_balance && (
                    <div className="flex items-center gap-2">
                      <span className="text-[14px]">Días:</span>
                      <input type="number" value={newType.default_days ?? ""} onChange={(e) => setNewType((p) => ({ ...p, default_days: e.target.value ? parseInt(e.target.value) : null }))} className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background" />
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={handleAddType} disabled={isPending || !newType.name}>Guardar</Button>
                  <Button variant="outline" size="sm" onClick={() => setShowAddType(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Save button for type changes */}
            {typesDirty && (
              <div className="flex items-center gap-3 pt-3 border-t border-border">
                <Button onClick={handleSaveTypes} disabled={isPending}>
                  {isPending ? "Guardando…" : "Guardar cambios"}
                </Button>
                <Button variant="outline" onClick={() => { setEditedTypes(initialTypes); setTypesDirty(false) }} disabled={isPending}>
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
