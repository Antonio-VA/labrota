"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Users, Plus, X, Lock, CheckCircle2, Circle, AlertTriangle, Upload, Pencil, FileUp, CalendarPlus } from "lucide-react"
import { COUNTRIES, getCountry } from "@/lib/regional-config"
import { updateOrgRegional, updateOrgDisplayMode, createOrgUser, updateOrgBilling, toggleOrgLeaveRequests, toggleOrgTaskInShift, toggleOrgNotes, resetOrgImplementation, renameOrganisation, updateOrgLogo, adminSwitchToOrg, updateOrgEngineConfig } from "@/app/admin/actions"
import { createClient } from "@/lib/supabase/client"
import type { UserRow } from "@/components/admin-users-table"
import { AdminUsersTable } from "@/components/admin-users-table"

export function AdminOrgDetailClient({
  orgId,
  userRows,
  initialCountry,
  initialRegion,
  initialName = "",
  initialSlug = "",
  initialLogoUrl = null,
  initialDisplayMode = "by_shift",
  initialLeaveRequests = false,
  initialEnableNotes = true,
  initialEnableTaskInShift = false,
  initialBilling = { start: null, end: null, fee: null },
  initialAiOptimalVersion = "v2",
  initialEngineHybridEnabled = true,
  initialEngineReasoningEnabled = false,
  initialTaskOptimalVersion = "v1",
  initialTaskHybridEnabled = false,
  initialTaskReasoningEnabled = false,
  initialDailyHybridLimit = 10,
  initialAnnualLeaveDays = 20,
  initialDefaultDaysPerWeek = 5,
  initialReduceBudgetOnHolidays = true,
  initialPartTimeWeight = 0.5,
  initialInternWeight = 0.5,
  implementationStatus,
  section = "all",
  hideUsers = false,
  orgStaff = [],
}: {
  orgId: string
  userRows: UserRow[]
  initialCountry: string
  initialRegion: string
  initialName?: string
  initialSlug?: string
  initialLogoUrl?: string | null
  initialDisplayMode?: "by_shift" | "by_task"
  initialLeaveRequests?: boolean
  initialEnableNotes?: boolean
  initialEnableTaskInShift?: boolean
  initialBilling?: { start: string | null; end: string | null; fee: number | null }
  initialAiOptimalVersion?: string
  initialEngineHybridEnabled?: boolean
  initialEngineReasoningEnabled?: boolean
  initialTaskOptimalVersion?: string
  initialTaskHybridEnabled?: boolean
  initialTaskReasoningEnabled?: boolean
  initialDailyHybridLimit?: number
  initialAnnualLeaveDays?: number
  initialDefaultDaysPerWeek?: number
  initialReduceBudgetOnHolidays?: boolean
  initialPartTimeWeight?: number
  initialInternWeight?: number
  implementationStatus?: {
    hasRegion: boolean
    departmentCount: number
    shiftCount: number
    taskCount: number
    staffCount: number
    hasRota: boolean
    rotaCount: number
  }
  section?: "all" | "funcionalidades" | "facturacion" | "configuracion" | "usuarios" | "implementacion"
  hideUsers?: boolean
  orgStaff?: { id: string; first_name: string; last_name: string; role: string }[]
}) {
  const router = useRouter()
  const [orgName, setOrgName] = useState(initialName)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [displayMode, setDisplayMode] = useState(initialDisplayMode)
  const [leaveRequests, setLeaveRequests] = useState(initialLeaveRequests)
  const [enableNotes, setEnableNotes] = useState(initialEnableNotes)
  const [enableTaskInShift, setEnableTaskInShift] = useState(initialEnableTaskInShift)
  const [aiOptimalVersion, setAiOptimalVersion] = useState(initialAiOptimalVersion)
  const [engineHybridEnabled, setEngineHybridEnabled] = useState(initialEngineHybridEnabled)
  const [engineReasoningEnabled, setEngineReasoningEnabled] = useState(initialEngineReasoningEnabled)
  const [taskOptimalVersion] = useState(initialTaskOptimalVersion)
  const [taskHybridEnabled, setTaskHybridEnabled] = useState(initialTaskHybridEnabled)
  const [taskReasoningEnabled, setTaskReasoningEnabled] = useState(initialTaskReasoningEnabled)
  const [dailyHybridLimit, setDailyHybridLimit] = useState(initialDailyHybridLimit)
  const [annualLeaveDays, setAnnualLeaveDays] = useState(initialAnnualLeaveDays)
  const [defaultDaysPerWeek, setDefaultDaysPerWeek] = useState(initialDefaultDaysPerWeek)
  const [reduceBudgetOnHolidays, setReduceBudgetOnHolidays] = useState(initialReduceBudgetOnHolidays)
  const [partTimeWeight, setPartTimeWeight] = useState(initialPartTimeWeight)
  const [internWeight, setInternWeight] = useState(initialInternWeight)
  const [country, setCountry] = useState(initialCountry)
  const [region, setRegion] = useState(initialRegion)
  const [billing, setBilling] = useState(initialBilling)
  const [isPending, startTransition] = useTransition()

  // Add user modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [isResetting, startReset] = useTransition()
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [appRole, setAppRole] = useState("manager")

  const countryConfig = getCountry(country)

  function handleAddUser() {
    if (!email.trim()) return
    const fd = new FormData()
    fd.set("orgId", orgId)
    fd.set("email", email.trim())
    fd.set("fullName", fullName.trim())
    fd.set("appRole", appRole)
    startTransition(async () => {
      const result = await createOrgUser(fd)
      if (result && "error" in result) { toast.error(result.error as string); return }
      toast.success("Usuario añadido")
      setAddModalOpen(false)
      setEmail("")
      setFullName("")
      router.refresh()
    })
  }

  function handleSaveAll() {
    if (displayMode !== initialDisplayMode) {
      if (!confirm("Cambiar el modo de horario puede afectar la visualización de los horarios existentes. ¿Deseas continuar?")) {
        setDisplayMode(initialDisplayMode)
        return
      }
    }
    startTransition(async () => {
      let hasError = false
      if (orgName.trim() && orgName !== initialName) {
        const r = await renameOrganisation(orgId, orgName.trim())
        if (r?.error) { toast.error(r.error); hasError = true }
      }
      if (displayMode !== initialDisplayMode) {
        const r = await updateOrgDisplayMode(orgId, displayMode)
        if (r.error) { toast.error(r.error); hasError = true }
      }
      if (leaveRequests !== initialLeaveRequests || enableNotes !== initialEnableNotes) {
        const r = await toggleOrgLeaveRequests(orgId, leaveRequests)
        if (r.error) { toast.error(r.error); hasError = true }
      }
      if (enableNotes !== initialEnableNotes) {
        const r = await toggleOrgNotes(orgId, enableNotes)
        if (r.error) { toast.error(r.error); hasError = true }
      }
      if (enableTaskInShift !== initialEnableTaskInShift) {
        const r = await toggleOrgTaskInShift(orgId, enableTaskInShift)
        if (r.error) { toast.error(r.error); hasError = true }
      }
      const r2 = await updateOrgRegional(orgId, country, region, annualLeaveDays, reduceBudgetOnHolidays, defaultDaysPerWeek, partTimeWeight, internWeight)
      if (r2.error) { toast.error(r2.error); hasError = true }
      const r4 = await updateOrgEngineConfig(orgId, {
        ai_optimal_version: aiOptimalVersion,
        engine_hybrid_enabled: engineHybridEnabled,
        engine_reasoning_enabled: engineReasoningEnabled,
        task_optimal_version: taskOptimalVersion,
        task_hybrid_enabled: taskHybridEnabled,
        task_reasoning_enabled: taskReasoningEnabled,
        daily_hybrid_limit: dailyHybridLimit,
      })
      if (r4?.error) { toast.error(r4.error); hasError = true }
      const r3 = await updateOrgBilling(orgId, {
        billing_start: billing.start || null,
        billing_end: billing.end || null,
        billing_fee: billing.fee,
      })
      if (r3.error) { toast.error(r3.error); hasError = true }
      if (!hasError) toast.success("Configuración guardada")
    })
  }

  return (
    <>
      {(section === "all" || section === "implementacion") && <>
      {/* ── ESTADO DE IMPLEMENTACIÓN ─────────────────────────────────── */}
      {implementationStatus && (() => {
        const steps = [
          { label: "Crear organización", desc: "Organización registrada en el sistema", done: true },
          { label: "Configurar región", desc: "País y región configurados", done: implementationStatus.hasRegion },
          { label: "Añadir departamentos", desc: `${implementationStatus.departmentCount} departamento${implementationStatus.departmentCount !== 1 ? "s" : ""}`, done: implementationStatus.departmentCount > 0 },
          { label: "Añadir turnos", desc: `${implementationStatus.shiftCount} turno${implementationStatus.shiftCount !== 1 ? "s" : ""}`, done: implementationStatus.shiftCount > 0 },
          { label: "Añadir tareas", desc: `${implementationStatus.taskCount} tarea${implementationStatus.taskCount !== 1 ? "s" : ""}`, done: implementationStatus.taskCount > 0 },
          { label: "Añadir equipo", desc: `${implementationStatus.staffCount} persona${implementationStatus.staffCount !== 1 ? "s" : ""} activa${implementationStatus.staffCount !== 1 ? "s" : ""}`, done: implementationStatus.staffCount > 0 },
          { label: "Generar primera rota", desc: implementationStatus.hasRota ? `${implementationStatus.rotaCount} horario${implementationStatus.rotaCount !== 1 ? "s" : ""} generado${implementationStatus.rotaCount !== 1 ? "s" : ""}` : "Aún no se ha generado ningún horario", done: implementationStatus.hasRota },
        ]
        const allDone = steps.every((s) => s.done)
        const completedCount = steps.filter((s) => s.done).length

        return (
          <div className="flex flex-col gap-3">
            <div className="rounded-lg border border-border bg-background overflow-hidden">
              {allDone ? (
                <div className="px-4 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-5 text-emerald-500" />
                    <span className="text-[14px] font-medium text-emerald-600">Implementación completada</span>
                  </div>
                  <button
                    onClick={() => setResetModalOpen(true)}
                    className="text-[12px] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Re-iniciar implementación
                  </button>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2.5 border-b border-border bg-muted/30">
                    <span className="text-[12px] text-muted-foreground">{completedCount}/{steps.length} pasos completados</span>
                  </div>
                  <div className="divide-y divide-border/50">
                    {steps.map((step, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                        {step.done ? (
                          <CheckCircle2 className="size-4 text-emerald-500 mt-0.5 shrink-0" />
                        ) : (
                          <Circle className="size-4 text-muted-foreground/30 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <p className={cn("text-[13px] font-medium", step.done ? "text-foreground" : "text-muted-foreground")}>{step.label}</p>
                          <p className="text-[11px] text-muted-foreground">{step.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* Import rota actions */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
          <p className="text-[14px] font-medium">Importar horarios</p>
          <p className="text-[12px] text-muted-foreground">Importar horarios existentes desde Excel, PDF o imagen. Se cambiará tu organización activa a esta clínica.</p>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await adminSwitchToOrg(orgId)
                  window.open("/onboarding/import", "_blank")
                })
              }}
            >
              <FileUp className="size-3.5" />
              Importar datos históricos
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => {
                startTransition(async () => {
                  await adminSwitchToOrg(orgId)
                  window.open("/onboarding/import-rota", "_blank")
                })
              }}
            >
              <CalendarPlus className="size-3.5" />
              Importar horarios futuros
            </Button>
          </div>
        </div>
      </div>

      {/* Reset implementation modal */}
      {resetModalOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setResetModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[420px] p-5 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="size-5 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-[15px] font-medium">¿Re-iniciar implementación?</p>
                <p className="text-[13px] text-muted-foreground mt-1.5">
                  Esta acción eliminará todos los datos: horarios, equipo, departamentos, turnos, tareas, reglas y configuración regional.
                  Solo se conservará la organización. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setResetModalOpen(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={isResetting}
                onClick={() => {
                  startReset(async () => {
                    const result = await resetOrgImplementation(orgId)
                    if (result.success) {
                      toast.success("Implementación reiniciada")
                      setResetModalOpen(false)
                      router.refresh()
                    }
                  })
                }}
              >
                {isResetting ? "Reiniciando…" : "Re-iniciar"}
              </Button>
            </div>
          </div>
        </>
      )}

      </>}

      {(section === "all" || section === "funcionalidades") && <>
      {/* ── FUNCIONALIDADES ───────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
          {/* Display mode */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium">Modo de horario</p>
              <p className="text-[12px] text-muted-foreground">
                {displayMode === "by_shift"
                  ? "Por turno — habitual en laboratorios pequeños (<10 personas)"
                  : "Por tarea — habitual en laboratorios grandes (10+ personas)"}
              </p>
            </div>
            <div className="flex rounded-lg border border-input overflow-hidden shrink-0">
              {([
                { key: "by_shift" as const, label: "Por turno" },
                { key: "by_task" as const, label: "Por tarea" },
              ]).map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  disabled={isPending}
                  onClick={() => setDisplayMode(key)}
                  className={cn(
                    "px-4 py-1.5 text-[13px] font-medium transition-colors",
                    displayMode === key
                      ? "bg-primary text-primary-foreground"
                      : "bg-transparent text-muted-foreground hover:bg-muted"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-px bg-border" />

          {/* Leave requests */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium">Solicitud de ausencias</p>
              <p className="text-[12px] text-muted-foreground">
                Permite al personal solicitar vacaciones y ausencias desde la app
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setLeaveRequests(!leaveRequests)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                leaveRequests ? "bg-emerald-500" : "bg-muted-foreground/20"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                leaveRequests ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          <div className="h-px bg-border" />

          {/* Notes */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium">Notas en el horario</p>
              <p className="text-[12px] text-muted-foreground">
                Añade notas diarias al pie del horario
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setEnableNotes(!enableNotes)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                enableNotes ? "bg-emerald-500" : "bg-muted-foreground/20"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                enableNotes ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>

          {displayMode === "by_shift" && (<>
          <div className="h-px bg-border" />

          {/* Task in shift — only for by_shift mode */}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[14px] font-medium">Asignación de tareas en horario por turno</p>
              <p className="text-[12px] text-muted-foreground">
                Permite asignar tareas o subdepartamentos a cada persona dentro de su turno
              </p>
            </div>
            <button
              type="button"
              disabled={isPending}
              onClick={() => setEnableTaskInShift(!enableTaskInShift)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                enableTaskInShift ? "bg-emerald-500" : "bg-muted-foreground/20"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                enableTaskInShift ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
          </div>
          </>)}
        </div>
      </div>

      {/* ── MOTORES DE GENERACIÓN ─────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
          <div>
            <p className="text-[14px] font-medium">Motores de generación</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Configura qué motores de IA están disponibles para esta organización.</p>
          </div>

          {displayMode === "by_shift" ? (<>
            {/* Híbrido toggle */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium">Motor Híbrido</p>
                <p className="text-[12px] text-muted-foreground">Combina el motor con revisión de Claude. Activado por defecto.</p>
              </div>
              <button type="button" disabled={isPending} onClick={() => setEngineHybridEnabled(!engineHybridEnabled)}
                className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  engineHybridEnabled ? "bg-emerald-500" : "bg-muted-foreground/20"
                )}>
                <span className={cn("pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                  engineHybridEnabled ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
            </div>

            <div className="h-px bg-border" />

            {/* Daily hybrid limit */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium">Límite diario híbrido</p>
                <p className="text-[12px] text-muted-foreground">Número máximo de generaciones híbridas por día.</p>
              </div>
              <input
                type="number"
                min={1}
                max={100}
                value={dailyHybridLimit}
                onChange={(e) => setDailyHybridLimit(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-20 rounded-lg border border-border px-2 py-1.5 text-[14px] text-center outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                disabled={isPending}
              />
            </div>

            <div className="h-px bg-border" />

            {/* Razonamiento Claude toggle */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium">Razonamiento Claude</p>
                <p className="text-[12px] text-muted-foreground">Claude razona paso a paso. Solo para depuración — desactivado por defecto.</p>
              </div>
              <button type="button" disabled={isPending} onClick={() => setEngineReasoningEnabled(!engineReasoningEnabled)}
                className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  engineReasoningEnabled ? "bg-amber-500" : "bg-muted-foreground/20"
                )}>
                <span className={cn("pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                  engineReasoningEnabled ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
            </div>
          </>) : (<>
            <div className="h-px bg-border" />

            {/* Task Híbrido — coming soon */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium text-muted-foreground">Híbrido por Técnica <span className="text-[11px] font-normal">(próximamente)</span></p>
                <p className="text-[12px] text-muted-foreground/60">Motor híbrido adaptado para organizaciones por tarea</p>
              </div>
              <button type="button" disabled={isPending} onClick={() => setTaskHybridEnabled(!taskHybridEnabled)}
                className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  taskHybridEnabled ? "bg-emerald-500" : "bg-muted-foreground/20"
                )}>
                <span className={cn("pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                  taskHybridEnabled ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
            </div>

            <div className="h-px bg-border" />

            {/* Task Razonamiento — coming soon */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium text-muted-foreground">Razonamiento por Técnica <span className="text-[11px] font-normal">(próximamente)</span></p>
                <p className="text-[12px] text-muted-foreground/60">Razonamiento Claude adaptado para organizaciones por tarea</p>
              </div>
              <button type="button" disabled={isPending} onClick={() => setTaskReasoningEnabled(!taskReasoningEnabled)}
                className={cn("relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                  taskReasoningEnabled ? "bg-amber-500" : "bg-muted-foreground/20"
                )}>
                <span className={cn("pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
                  taskReasoningEnabled ? "translate-x-5" : "translate-x-0"
                )} />
              </button>
            </div>
          </>)}
        </div>
      </div>

      <div className="pt-3">
        <Button onClick={handleSaveAll} disabled={isPending} size="lg" className="w-fit">
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      </>}

      {(section === "all" || section === "facturacion") && <>
      {/* ── FACTURACIÓN ───────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-muted-foreground">Inicio</label>
              <Input
                type="date"
                value={billing.start ?? ""}
                onChange={(e) => setBilling((p) => ({ ...p, start: e.target.value || null }))}
                disabled={isPending}
                className="w-40 h-8 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-muted-foreground">Renovación</label>
              <Input
                type="date"
                value={billing.end ?? ""}
                onChange={(e) => setBilling((p) => ({ ...p, end: e.target.value || null }))}
                disabled={isPending}
                className="w-40 h-8 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-muted-foreground">Cuota anual (€)</label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  step={100}
                  value={billing.fee ?? ""}
                  onChange={(e) => setBilling((p) => ({ ...p, fee: e.target.value ? parseFloat(e.target.value) : null }))}
                  disabled={isPending}
                  className="w-28 h-8 text-[13px]"
                />
                {(!billing.fee || billing.fee === 0) && (
                  <span className="text-[11px] text-emerald-600 font-medium">Prueba gratuita</span>
                )}
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Lock className="size-3" />
            Solo visible y editable por super admin. Los administradores de la clínica no ven esta sección.
          </p>
        </div>
      </div>
      <div className="pt-3">
        <Button onClick={handleSaveAll} disabled={isPending} size="lg" className="w-fit">
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      </>}

      {(section === "all" || section === "configuracion") && <>
      {/* ── ORGANIZACIÓN ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-4">
            {/* Logo */}
            <div className="relative group shrink-0">
              <input
                id="org-logo-input"
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  e.target.value = ""
                  const supabase = createClient()
                  const ext = file.name.split(".").pop() ?? "png"
                  const path = `${orgId}/logo.${ext}`
                  await supabase.storage.from("org-logos").upload(path, file, { upsert: true, contentType: file.type })
                  const { data: { publicUrl } } = supabase.storage.from("org-logos").getPublicUrl(path)
                  await updateOrgLogo(orgId, publicUrl)
                  setLogoUrl(publicUrl + `?t=${Date.now()}`)
                  router.refresh()
                }}
              />
              <button
                onClick={() => document.getElementById("org-logo-input")?.click()}
                className="flex size-14 items-center justify-center rounded-xl border border-border bg-muted text-[16px] font-semibold text-muted-foreground hover:border-primary transition-colors overflow-hidden relative"
              >
                {logoUrl ? (
                  <img src={logoUrl} alt="" className="size-full object-cover" />
                ) : (
                  orgName.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl">
                  <Upload className="size-4 text-white" />
                </span>
              </button>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex flex-col gap-0.5">
                <label className="text-[12px] font-medium text-muted-foreground">Nombre</label>
                <Input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  disabled={isPending}
                  className="h-9 text-[14px] font-medium"
                />
              </div>
              <p className="text-[12px] text-muted-foreground">Slug: <span className="font-mono">{initialSlug}</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* ── CONFIGURACIÓN REGIONAL ────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-5 py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[13px] text-muted-foreground shrink-0">País</label>
              <select
                value={country}
                onChange={(e) => { setCountry(e.target.value); setRegion("") }}
                disabled={isPending}
                className="h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] outline-none focus-visible:border-ring"
              >
                <option value="">—</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name_en}</option>
                ))}
              </select>
            </div>
            {countryConfig && countryConfig.regions.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-[13px] text-muted-foreground shrink-0">Región</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={isPending}
                  className="h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] outline-none focus-visible:border-ring"
                >
                  <option value="">—</option>
                  {countryConfig.regions.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* HR subsection */}
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">HR</p>
          </div>
          <div className="px-5 py-3 flex items-center gap-3 border-b border-border/50">
            <label className="text-[13px] text-muted-foreground shrink-0">Vacaciones anuales</label>
            <input
              type="number"
              min={0}
              max={60}
              value={annualLeaveDays}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 0 && v <= 60) setAnnualLeaveDays(v)
              }}
              disabled={isPending}
              className="w-16 h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] text-center outline-none focus-visible:border-ring"
            />
            <span className="text-[12px] text-muted-foreground">días por persona al año</span>
          </div>
          <div className="px-5 py-3 flex items-center gap-3 border-b border-border/50">
            <label className="text-[13px] text-muted-foreground shrink-0">Días por semana (por defecto)</label>
            <input
              type="number"
              min={1}
              max={7}
              value={defaultDaysPerWeek}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1 && v <= 7) setDefaultDaysPerWeek(v)
              }}
              disabled={isPending}
              className="w-16 h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] text-center outline-none focus-visible:border-ring"
            />
            <span className="text-[12px] text-muted-foreground">días/semana para nuevos empleados</span>
          </div>
          <div className="px-5 py-3 flex items-center gap-3 border-b border-border/50">
            <label className="text-[13px] text-muted-foreground shrink-0">Peso a tiempo parcial</label>
            <input
              type="number"
              min={0.1}
              max={1}
              step={0.1}
              value={partTimeWeight}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v >= 0.1 && v <= 1) setPartTimeWeight(Math.round(v * 10) / 10)
              }}
              disabled={isPending}
              className="w-16 h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] text-center outline-none focus-visible:border-ring"
            />
            <span className="text-[12px] text-muted-foreground">fracción de cobertura (0.1–1.0)</span>
          </div>
          <div className="px-5 py-3 flex items-center gap-3 border-b border-border/50">
            <label className="text-[13px] text-muted-foreground shrink-0">Peso becario/intern</label>
            <input
              type="number"
              min={0.1}
              max={1}
              step={0.1}
              value={internWeight}
              onChange={(e) => {
                const v = parseFloat(e.target.value)
                if (!isNaN(v) && v >= 0.1 && v <= 1) setInternWeight(Math.round(v * 10) / 10)
              }}
              disabled={isPending}
              className="w-16 h-8 rounded-lg border border-input bg-transparent px-2 text-[13px] text-center outline-none focus-visible:border-ring"
            />
            <span className="text-[12px] text-muted-foreground">fracción de cobertura (0.1–1.0)</span>
          </div>
          <div className="px-5 py-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={reduceBudgetOnHolidays}
                onChange={(e) => setReduceBudgetOnHolidays(e.target.checked)}
                disabled={isPending}
                className="accent-primary"
              />
              <div>
                <span className="text-[13px] font-medium">Reducir presupuesto en festivos</span>
                <p className="text-[11px] text-muted-foreground mt-0.5">Reduce en 1 día el presupuesto semanal de cada persona por cada festivo de la semana.</p>
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* Save all */}
      <div className="pt-3">
        <Button onClick={handleSaveAll} disabled={isPending} size="lg" className="w-fit">
          {isPending ? "Guardando…" : "Guardar cambios"}
        </Button>
      </div>

      </>}

      {/* ── USUARIOS ──────────────────────────────────────────────────── */}
      {["all", "usuarios"].includes(section) && <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end">
          <Button size="sm" onClick={() => setAddModalOpen(true)}>
            <Plus className="size-3.5" />
            Añadir usuario
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-background overflow-hidden">
          {userRows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users className="size-6 text-muted-foreground" />
              <p className="text-[14px] text-muted-foreground">Sin usuarios</p>
            </div>
          ) : (
            <AdminUsersTable users={userRows} orgId={orgId} staff={orgStaff} />
          )}
        </div>
      </div>}

      {/* Add user modal */}
      {addModalOpen && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30" onClick={() => setAddModalOpen(false)} />
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[400px] p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <p className="text-[15px] font-medium">Añadir usuario</p>
              <button onClick={() => setAddModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium">Email</label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@clinica.com" disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium">Nombre completo</label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre Apellido" disabled={isPending} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium">Rol</label>
                <select value={appRole} onChange={(e) => setAppRole(e.target.value)} disabled={isPending}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring">
                  <option value="manager">Manager</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddModalOpen(false)}>Cancelar</Button>
              <Button size="sm" onClick={handleAddUser} disabled={isPending || !email.trim()}>
                {isPending ? "Añadiendo…" : "Añadir"}
              </Button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
