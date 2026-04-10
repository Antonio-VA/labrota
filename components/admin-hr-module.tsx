"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Settings, Trash2, RotateCcw, AlertTriangle, Plus, Archive } from "lucide-react"
import { formatDateWithYear } from "@/lib/format-date"
import type { HrModule, CompanyLeaveType, HolidayConfig } from "@/lib/types/database"
import {
  adminInstallHrModule,
  adminRemoveHrModule,
  adminDeleteAllHrData,
  adminUpdateHolidayConfig,
  adminCreateCompanyLeaveType,
  adminUpdateCompanyLeaveType,
  adminGenerateBalancesForYear,
  adminRollOverCarryForward,
} from "@/app/admin/hr-module-actions"

interface Props {
  orgId: string
  installed: boolean
  active: boolean
  installedAt: string | null
  config: HolidayConfig | null
  leaveTypes: CompanyLeaveType[]
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function AdminHrModule({ orgId, installed, active, installedAt, config: initialConfig, leaveTypes: initialTypes }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteInput, setDeleteInput] = useState("")
  const [config, setConfig] = useState(initialConfig)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [showAddType, setShowAddType] = useState(false)
  const [newType, setNewType] = useState({ name: "", name_en: "", has_balance: false, default_days: null as number | null, allows_carry_forward: false, overflow_to_type_id: null as string | null, is_paid: true, color: "#64748b" })

  const handleInstall = () => {
    startTransition(async () => {
      const result = await adminInstallHrModule(orgId)
      if (result.error) toast.error(result.error)
      else { toast.success("Modulo RRHH instalado"); router.refresh() }
    })
  }

  const handleRemove = () => {
    startTransition(async () => {
      const result = await adminRemoveHrModule(orgId)
      if (result.error) toast.error(result.error)
      else { toast.success("Modulo RRHH desinstalado"); setShowRemoveConfirm(false); router.refresh() }
    })
  }

  const handleDeleteData = () => {
    if (deleteInput !== "DELETE") return
    startTransition(async () => {
      const result = await adminDeleteAllHrData(orgId)
      if (result.error) toast.error(result.error)
      else { toast.success("Datos RRHH eliminados"); setShowDeleteConfirm(false); setDeleteInput(""); router.refresh() }
    })
  }

  const saveConfig = (updates: Partial<NonNullable<typeof config>>) => {
    setConfig((p) => p ? { ...p, ...updates } : p)
    startTransition(async () => {
      const result = await adminUpdateHolidayConfig(orgId, updates)
      if (result.error) toast.error(result.error)
      else toast.success("Guardado")
    })
  }

  const handleAddType = () => {
    if (!newType.name) return
    startTransition(async () => {
      const result = await adminCreateCompanyLeaveType(orgId, newType)
      if (result.error) toast.error(result.error)
      else { toast.success("Guardado"); setShowAddType(false); setNewType({ name: "", name_en: "", has_balance: false, default_days: null, allows_carry_forward: false, overflow_to_type_id: null, is_paid: true, color: "#64748b" }); router.refresh() }
    })
  }

  const handleToggleField = (id: string, field: string, value: boolean | number | string | null) => {
    startTransition(async () => {
      const result = await adminUpdateCompanyLeaveType(id, { [field]: value })
      if (result.error) toast.error(result.error)
      else router.refresh()
    })
  }

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

  // ── Not installed / inactive ──────────────────────────────────────────────
  if (!installed || !active) {
    return (
      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <div>
          <h3 className="text-[14px] font-medium">Modulo RRHH</h3>
          <p className="text-[14px] text-muted-foreground mt-0.5">
            {!installed ? "No instalado" : <><Badge variant="inactive">Inactivo</Badge> Datos preservados — reinstalar para restaurar.</>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleInstall} disabled={isPending}>
            {installed ? <><RotateCcw className="size-4 mr-2" />Reinstalar modulo RRHH</> : "Instalar modulo RRHH"}
          </Button>
        </div>
        {installed && !active && (
          <div className="border-t border-border pt-4 mt-2">
            {!showDeleteConfirm ? (
              <Button variant="destructive" size="sm" onClick={() => setShowDeleteConfirm(true)} disabled={isPending}>
                <Trash2 className="size-4 mr-2" />Eliminar datos RRHH
              </Button>
            ) : (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 flex flex-col gap-3">
                <p className="text-[14px] font-medium text-destructive">Eliminar todos los datos de RRHH</p>
                <p className="text-[14px] text-muted-foreground">Esto eliminara permanentemente todos los saldos, configuracion RRHH y ajustes. Los registros de ausencias no se eliminaran. Esta accion no se puede deshacer.</p>
                <div className="flex items-center gap-2">
                  <input type="text" value={deleteInput} onChange={(e) => setDeleteInput(e.target.value)} placeholder='Escribe "DELETE" para confirmar' className="rounded-md border border-border bg-background px-3 py-1.5 text-[14px] w-48" />
                  <Button variant="destructive" size="sm" onClick={handleDeleteData} disabled={isPending || deleteInput !== "DELETE"}>Eliminar</Button>
                  <Button variant="outline" size="sm" onClick={() => { setShowDeleteConfirm(false); setDeleteInput("") }}>Cancelar</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Active ────────────────────────────────────────────────────────────────
  const activeTypes = initialTypes.filter((lt) => !lt.is_archived)
  const archivedTypes = initialTypes.filter((lt) => lt.is_archived)

  return (
    <div className="flex flex-col gap-5">
      {/* Status */}
      <div className="rounded-lg border border-border bg-background px-5 py-4 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-medium">Modulo RRHH</h3>
          <p className="text-[14px] text-muted-foreground mt-0.5">
            <Badge variant="active">Activo</Badge>
            {installedAt && <span className="ml-2">Instalado el {formatDateWithYear(installedAt, "es")}</span>}
          </p>
        </div>
      </div>

      {/* Leave Year */}
      {config && (
        <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
          <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Ano de vacaciones</h3>
          <div className="flex items-center gap-2">
            <span className="text-[14px]">El ano comienza</span>
            <select value={config.leave_year_start_month} onChange={(e) => saveConfig({ leave_year_start_month: parseInt(e.target.value) })} className="border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <span>/</span>
            <input type="number" min={1} max={31} value={config.leave_year_start_day} onChange={(e) => saveConfig({ leave_year_start_day: parseInt(e.target.value) || 1 })} className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending} />
          </div>
        </div>
      )}

      {/* Day counting */}
      {config && (
        <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
          <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Conteo de dias</h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="radio" name="counting" checked={config.counting_method === "working_days"} onChange={() => saveConfig({ counting_method: "working_days" })} className="accent-primary" disabled={isPending} />
              Dias laborables (lun-vie)
            </label>
            <label className="flex items-center gap-2 text-[14px]">
              <input type="radio" name="counting" checked={config.counting_method === "calendar_days"} onChange={() => saveConfig({ counting_method: "calendar_days" })} className="accent-primary" disabled={isPending} />
              Dias naturales
            </label>
            {config.counting_method === "calendar_days" && (
              <label className="flex items-center gap-2 text-[14px] ml-6">
                <input type="checkbox" checked={config.weekends_deducted} onChange={(e) => saveConfig({ weekends_deducted: e.target.checked })} className="accent-primary" disabled={isPending} />
                Descontar fines de semana
              </label>
            )}
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={config.public_holidays_deducted} onChange={(e) => saveConfig({ public_holidays_deducted: e.target.checked })} className="accent-primary" disabled={isPending} />
              Descontar festivos
            </label>
          </div>
        </div>
      )}

      {/* Carry forward */}
      {config && (
        <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
          <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Arrastre de dias</h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-[14px]">
              <input type="checkbox" checked={config.carry_forward_allowed} onChange={(e) => saveConfig({ carry_forward_allowed: e.target.checked })} className="accent-primary" disabled={isPending} />
              Permitir arrastre
            </label>
            {config.carry_forward_allowed && (
              <>
                <div className="flex items-center gap-2 ml-6">
                  <span className="text-[14px]">Maximo dias</span>
                  <input type="number" min={0} value={config.max_carry_forward_days} onChange={(e) => saveConfig({ max_carry_forward_days: parseInt(e.target.value) || 0 })} className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending} />
                </div>
                <div className="flex items-center gap-2 ml-6">
                  <span className="text-[14px]">Caduca</span>
                  <select value={config.carry_forward_expiry_month} onChange={(e) => saveConfig({ carry_forward_expiry_month: parseInt(e.target.value) })} className="border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
                    {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <span>/</span>
                  <input type="number" min={1} max={31} value={config.carry_forward_expiry_day} onChange={(e) => saveConfig({ carry_forward_expiry_day: parseInt(e.target.value) || 1 })} className="w-16 border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Leave types */}
      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Tipos de ausencia</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-3 py-2 font-medium">Nombre</th>
                <th className="text-center px-2 py-2 font-medium">Controlado</th>
                <th className="text-center px-2 py-2 font-medium">Dias</th>
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
                    <input type="checkbox" checked={lt.has_balance} onChange={(e) => handleToggleField(lt.id, "has_balance", e.target.checked)} className="accent-primary" disabled={isPending} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    {lt.has_balance ? (
                      <input type="number" value={lt.default_days ?? ""} onChange={(e) => handleToggleField(lt.id, "default_days", e.target.value ? parseInt(e.target.value) : null)} className="w-16 border border-border rounded px-2 py-1 text-[14px] text-center bg-background" disabled={isPending} />
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={lt.allows_carry_forward} onChange={(e) => handleToggleField(lt.id, "allows_carry_forward", e.target.checked)} className="accent-primary" disabled={isPending || !lt.has_balance} />
                  </td>
                  <td className="px-2 py-2">
                    <select value={lt.overflow_to_type_id ?? ""} onChange={(e) => handleToggleField(lt.id, "overflow_to_type_id", e.target.value || null)} className="border border-border rounded px-2 py-1 text-[14px] bg-background" disabled={isPending}>
                      <option value="">—</option>
                      {activeTypes.filter((t) => t.id !== lt.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input type="checkbox" checked={lt.is_paid} onChange={(e) => handleToggleField(lt.id, "is_paid", e.target.checked)} className="accent-primary" disabled={isPending} />
                  </td>
                  <td className="px-2 py-2">
                    <Button variant="ghost" size="icon-xs" onClick={() => handleToggleField(lt.id, "is_archived", true)} disabled={isPending}>
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
                <Button variant="ghost" size="xs" onClick={() => handleToggleField(lt.id, "is_archived", false)} disabled={isPending}>
                  <RotateCcw className="size-3 mr-1" />Restaurar
                </Button>
              </div>
            ))}
          </div>
        )}

        {!showAddType ? (
          <Button variant="outline" size="sm" onClick={() => setShowAddType(true)} className="self-start" disabled={isPending}>
            <Plus className="size-4 mr-2" />Anadir tipo de ausencia
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
                  <span className="text-[14px]">Dias:</span>
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
      </div>

      {/* Year balance management */}
      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <h3 className="text-[13px] font-medium text-muted-foreground uppercase">Gestion de saldos anuales</h3>
        <div className="flex items-center gap-3">
          <span className="text-[14px]">Ano</span>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="border border-border rounded px-2 py-1 text-[14px] bg-background">
            {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleGenerateBalances} disabled={isPending}>Generar saldos para {selectedYear}</Button>
          <Button variant="outline" size="sm" onClick={handleRollOver} disabled={isPending}>Traspasar arrastre de {selectedYear - 1}</Button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-lg border border-destructive/30 bg-background px-5 py-4 flex flex-col gap-4">
        <h3 className="text-[13px] font-medium text-destructive uppercase">Zona de peligro</h3>
        {!showRemoveConfirm ? (
          <Button variant="outline" size="sm" onClick={() => setShowRemoveConfirm(true)} disabled={isPending} className="self-start">Desinstalar modulo RRHH</Button>
        ) : (
          <div className="rounded-lg border border-border bg-muted/50 p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="size-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-[14px] font-medium">Desinstalar modulo RRHH</p>
                <p className="text-[14px] text-muted-foreground mt-1">Esto ocultara las funciones RRHH. Los datos se conservaran y se pueden restaurar reinstalando.</p>
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
  )
}
