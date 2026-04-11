"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Archive, RotateCcw, AlertTriangle, Info } from "lucide-react"
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

type Tab = "configuracion" | "tipos" | "saldos"

const TAB_LABELS: Record<Tab, string> = {
  configuracion: "Configuración",
  tipos: "Tipos de ausencia",
  saldos: "Gestión de saldos",
}

const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

interface Props {
  orgId: string
  config: HolidayConfig | null
  leaveTypes: CompanyLeaveType[]
}

export function AdminRrhhPage({ orgId, config: initialConfig, leaveTypes: initialTypes }: Props) {
  const router = useRouter()
  const locale = useLocale() as "es" | "en"
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>("configuracion")

  // ── Config state (with save button) ─────────────────────────────────────
  const [config, setConfig] = useState(initialConfig)
  const [configDirty, setConfigDirty] = useState(false)

  const updateConfig = (updates: Partial<NonNullable<typeof config>>) => {
    setConfig((p) => p ? { ...p, ...updates } : p)
    if (config && initialConfig) {
      const next = { ...config, ...updates }
      const { id: _1, organisation_id: _2, created_at: _3, updated_at: _4, ...origRest } = initialConfig
      const { id: _5, organisation_id: _6, created_at: _7, updated_at: _8, ...nextRest } = next
      setConfigDirty(JSON.stringify(origRest) !== JSON.stringify(nextRest))
    } else {
      setConfigDirty(true)
    }
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
    const next = editedTypes.map((lt) => lt.id === id ? { ...lt, [field]: value } : lt)
    setEditedTypes(next)
    const anyChanged = next.some((lt) => {
      const orig = initialTypes.find((o) => o.id === lt.id)
      if (!orig) return true
      return lt.has_balance !== orig.has_balance || lt.default_days !== orig.default_days ||
        lt.allows_carry_forward !== orig.allows_carry_forward || lt.overflow_to_type_id !== orig.overflow_to_type_id ||
        lt.is_paid !== orig.is_paid || lt.is_archived !== orig.is_archived
    })
    setTypesDirty(anyChanged)
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
  const [lastGenerateResult, setLastGenerateResult] = useState<string | null>(null)
  const [lastRollOverResult, setLastRollOverResult] = useState<string | null>(null)

  const handleGenerateBalances = () => {
    setLastGenerateResult(null)
    startTransition(async () => {
      const result = await adminGenerateBalancesForYear(orgId, selectedYear)
      if (result.error) { toast.error(result.error); return }
      if (result.created === 0 && result.skipped > 0) {
        const msg = `Todos los saldos ya existían (${result.skipped} empleados). No se realizaron cambios.`
        setLastGenerateResult(msg)
        toast(msg)
      } else {
        const msg = `✓ ${result.created} saldos creados` + (result.skipped > 0 ? `, ${result.skipped} ya existentes` : "")
        setLastGenerateResult(msg)
        toast.success(msg)
      }
    })
  }

  const handleRollOver = () => {
    setLastRollOverResult(null)
    startTransition(async () => {
      const result = await adminRollOverCarryForward(orgId, selectedYear - 1)
      if (result.error) { toast.error(result.error); return }
      if (result.processed === 0) {
        const msg = "No hay días restantes que traspasar."
        setLastRollOverResult(msg)
        toast(msg)
      } else {
        const msg = `✓ ${result.processed} registros de arrastre traspasados`
        setLastRollOverResult(msg)
        toast.success(msg)
      }
    })
  }

  // ── Danger zone ─────────────────────────────────────────────────────────
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)

  // Unsaved changes guard for tab switching
  const handleTabChange = (newTab: Tab) => {
    if (newTab === tab) return
    if (configDirty || typesDirty) {
      if (!window.confirm("Hay cambios sin guardar. ¿Deseas salir sin guardar?")) return
      setConfig(initialConfig)
      setConfigDirty(false)
      setEditedTypes(initialTypes)
      setTypesDirty(false)
    }
    setTab(newTab)
  }

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
            onClick={() => handleTabChange(key)}
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
            <div>
              <h3 className="text-[14px] font-medium">Año de vacaciones</h3>
              <p className="text-[13px] text-muted-foreground mt-0.5">Define cuándo empieza el ciclo anual de vacaciones. Los saldos se calculan dentro de este periodo.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[14px]">El año comienza el</span>
              <input type="number" min={1} max={31} value={config.leave_year_start_day} onChange={(e) => updateConfig({ leave_year_start_day: parseInt(e.target.value) || 1 })} className="w-14 border border-border rounded px-2 py-1 text-[14px] bg-background text-center" disabled={isPending} />
              <span className="text-[14px]">de</span>
              <select value={config.leave_year_start_month} onChange={(e) => updateConfig({ leave_year_start_month: parseInt(e.target.value) })} className="border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
                {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
            </div>
          </div>

          {/* Day counting */}
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
            <div>
              <h3 className="text-[14px] font-medium">Conteo de días</h3>
              <p className="text-[13px] text-muted-foreground mt-0.5">Cómo se cuentan los días de ausencia. Afecta al cálculo del saldo disponible.</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <label className="flex items-start gap-2 text-[14px]">
                <input type="radio" name="counting" checked={config.counting_method === "working_days"} onChange={() => updateConfig({ counting_method: "working_days" })} className="accent-primary mt-1" disabled={isPending} />
                <div>
                  <span className="font-medium">Días laborables</span>
                  <p className="text-[12px] text-muted-foreground">Solo lunes a viernes. Los fines de semana no se descuentan.</p>
                </div>
              </label>
              <label className="flex items-start gap-2 text-[14px]">
                <input type="radio" name="counting" checked={config.counting_method === "calendar_days"} onChange={() => updateConfig({ counting_method: "calendar_days" })} className="accent-primary mt-1" disabled={isPending} />
                <div>
                  <span className="font-medium">Días naturales</span>
                  <p className="text-[12px] text-muted-foreground">Todos los días del calendario, incluidos fines de semana.</p>
                </div>
              </label>
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={config.public_holidays_deducted} onChange={(e) => updateConfig({ public_holidays_deducted: e.target.checked })} className="accent-primary" disabled={isPending} />
                Descontar festivos oficiales del recuento
              </label>
            </div>
          </div>

          {/* Carry forward */}
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
            <div>
              <h3 className="text-[14px] font-medium">Arrastre de días</h3>
              <p className="text-[13px] text-muted-foreground mt-0.5">Permite traspasar días no consumidos al año siguiente, con un máximo y una fecha de caducidad.</p>
            </div>
            <div className="flex flex-col gap-2.5">
              <label className="flex items-center gap-2 text-[14px]">
                <input type="checkbox" checked={config.carry_forward_allowed} onChange={(e) => updateConfig({ carry_forward_allowed: e.target.checked })} className="accent-primary" disabled={isPending} />
                Permitir arrastre de días no consumidos
              </label>
              {config.carry_forward_allowed && (
                <div className="ml-6 flex flex-col gap-2.5 rounded-md bg-muted/30 border border-border px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px]">Máximo de días a arrastrar</span>
                    <input type="number" min={0} value={config.max_carry_forward_days} onChange={(e) => updateConfig({ max_carry_forward_days: parseInt(e.target.value) || 0 })} className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background text-center" disabled={isPending} />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[14px]">Los días arrastrados caducan el</span>
                    <input type="number" min={1} max={31} value={config.carry_forward_expiry_day} onChange={(e) => updateConfig({ carry_forward_expiry_day: parseInt(e.target.value) || 1 })} className="w-14 border border-border rounded px-2 py-1 text-[14px] bg-background text-center" disabled={isPending} />
                    <span className="text-[14px]">de</span>
                    <select value={config.carry_forward_expiry_month} onChange={(e) => updateConfig({ carry_forward_expiry_month: parseInt(e.target.value) })} className="border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
                      {MONTH_NAMES.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Save button — always visible */}
          <div className="flex items-center gap-3">
            <Button onClick={handleSaveConfig} disabled={isPending || !configDirty}>
              {isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
            {configDirty && (
              <Button variant="outline" onClick={() => { setConfig(initialConfig); setConfigDirty(false) }} disabled={isPending}>
                Cancelar
              </Button>
            )}
          </div>

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
          {/* Year selector */}
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex items-center gap-3">
            <span className="text-[14px] font-medium">Año</span>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="border border-border rounded px-2 py-1 text-[14px] bg-background">
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Generate balances */}
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
            <h3 className="text-[14px] font-medium">Generar saldos para {selectedYear}</h3>
            <p className="text-[13px] text-muted-foreground">
              Crea registros de saldo para todo el personal activo con los días por defecto de cada tipo de ausencia controlado.
              Si un empleado ya tiene saldo para ese año, se mantiene sin cambios.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={handleGenerateBalances} disabled={isPending}>
                {isPending ? "Generando…" : "Generar saldos"}
              </Button>
            </div>
            {lastGenerateResult && (
              <p className="text-[13px] text-muted-foreground">
                {lastGenerateResult}
              </p>
            )}
          </div>

          {/* Roll over carry-forward */}
          <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
            <h3 className="text-[14px] font-medium">Traspasar arrastre de {selectedYear - 1} a {selectedYear}</h3>
            <p className="text-[13px] text-muted-foreground">
              Calcula los días no consumidos en {selectedYear - 1} para cada empleado y los añade como arrastre en {selectedYear},
              respetando el máximo configurado. Si el empleado no tiene saldo en {selectedYear}, se crea automáticamente.
            </p>
            <div>
              <Button variant="outline" size="sm" onClick={handleRollOver} disabled={isPending}>
                {isPending ? "Procesando…" : "Traspasar arrastre"}
              </Button>
            </div>
            {lastRollOverResult && (
              <p className="text-[13px] text-muted-foreground">
                {lastRollOverResult}
              </p>
            )}
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
                  <tr className="border-b border-border bg-muted/40">
                    <th className="text-left px-3 py-2.5 font-medium w-64 min-w-48">Nombre</th>
                    <th className="text-center px-2 py-2.5 font-medium w-24">
                      <span className="inline-flex items-center gap-1">
                        Controlado
                        <span title="Indica si este tipo de ausencia descuenta días del saldo del empleado. Los tipos controlados tienen un límite anual de días." className="cursor-help">
                          <Info className="size-3 text-muted-foreground/60" />
                        </span>
                      </span>
                    </th>
                    <th className="text-center px-2 py-2.5 font-medium w-16">Días</th>
                    <th className="text-center px-2 py-2.5 font-medium w-24">
                      <span className="inline-flex items-center gap-1">
                        Arrastre
                        <span title="Permite traspasar los días no consumidos al año siguiente, hasta el máximo configurado en las reglas de arrastre." className="cursor-help">
                          <Info className="size-3 text-muted-foreground/60" />
                        </span>
                      </span>
                    </th>
                    <th className="text-left px-2 py-2.5 font-medium w-36">Desborde</th>
                    <th className="text-center px-2 py-2.5 font-medium w-24">Remunerado</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {activeTypes.map((lt) => (
                    <tr key={lt.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="w-3 h-3 rounded-full shrink-0 border" style={{ backgroundColor: lt.color + "55", borderColor: lt.color }} />
                          <span className="font-medium">{lt.name}</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <input type="checkbox" checked={lt.has_balance} onChange={(e) => updateTypeField(lt.id, "has_balance", e.target.checked)} className="accent-primary" disabled={isPending} />
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        {lt.has_balance ? (
                          <input type="number" value={lt.default_days ?? ""} onChange={(e) => updateTypeField(lt.id, "default_days", e.target.value ? parseInt(e.target.value) : null)} className="w-14 border border-border rounded px-2 py-1 text-[14px] text-center bg-background" disabled={isPending} />
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <input type="checkbox" checked={lt.allows_carry_forward} onChange={(e) => updateTypeField(lt.id, "allows_carry_forward", e.target.checked)} className="accent-primary" disabled={isPending || !lt.has_balance} />
                      </td>
                      <td className="px-2 py-2.5">
                        <select value={lt.overflow_to_type_id ?? ""} onChange={(e) => updateTypeField(lt.id, "overflow_to_type_id", e.target.value || null)} className="w-full border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
                          <option value="">—</option>
                          {activeTypes.filter((t) => t.id !== lt.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <input type="checkbox" checked={lt.is_paid} onChange={(e) => updateTypeField(lt.id, "is_paid", e.target.checked)} className="accent-primary" disabled={isPending} />
                      </td>
                      <td className="px-2 py-2.5">
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
                <div>
                  <label className="text-[13px] text-muted-foreground">{locale === "en" ? "Name" : "Nombre"}</label>
                  <input
                    type="text"
                    value={newType.name}
                    onChange={(e) => setNewType((p) => ({ ...p, name: e.target.value, name_en: e.target.value }))}
                    className="w-full border border-border rounded px-2 py-1 text-[14px] bg-background mt-1"
                  />
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

            {/* Save button — always visible */}
            <div className="flex items-center gap-3 pt-3 border-t border-border">
              <Button onClick={handleSaveTypes} disabled={isPending || !typesDirty}>
                {isPending ? "Guardando…" : "Guardar cambios"}
              </Button>
              {typesDirty && (
                <Button variant="outline" onClick={() => { setEditedTypes(initialTypes); setTypesDirty(false) }} disabled={isPending}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
