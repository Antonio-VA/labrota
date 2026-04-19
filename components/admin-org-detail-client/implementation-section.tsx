"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { CheckCircle2, Circle, AlertTriangle, FileUp, CalendarPlus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { adminSwitchToOrg, resetOrgImplementation } from "@/app/admin/actions"

export type ImplementationStatus = {
  hasRegion: boolean
  departmentCount: number
  shiftCount: number
  taskCount: number
  staffCount: number
  hasRota: boolean
  rotaCount: number
}

export function ImplementationSection({
  orgId,
  status,
}: {
  orgId: string
  status: ImplementationStatus
}) {
  const t = useTranslations("adminOrg")
  const router = useRouter()
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const steps = [
    { label: t("stepCreateOrg"),    desc: t("stepCreateOrgDesc"),                                      done: true },
    { label: t("stepConfigRegion"), desc: t("stepConfigRegionDesc"),                                   done: status.hasRegion },
    { label: "Añadir departamentos", desc: `${status.departmentCount} departamento${status.departmentCount !== 1 ? "s" : ""}`, done: status.departmentCount > 0 },
    { label: "Añadir turnos",        desc: `${status.shiftCount} turno${status.shiftCount !== 1 ? "s" : ""}`,             done: status.shiftCount > 0 },
    { label: "Añadir tareas",        desc: `${status.taskCount} tarea${status.taskCount !== 1 ? "s" : ""}`,                done: status.taskCount > 0 },
    { label: "Añadir equipo",        desc: `${status.staffCount} persona${status.staffCount !== 1 ? "s" : ""} activa${status.staffCount !== 1 ? "s" : ""}`, done: status.staffCount > 0 },
    {
      label: t("stepGenerateRota"),
      desc: status.hasRota
        ? (status.rotaCount !== 1 ? t("stepRotaGeneratedPlural", { count: status.rotaCount }) : t("stepRotaGenerated", { count: status.rotaCount }))
        : t("stepRotaNotGenerated"),
      done: status.hasRota,
    },
  ]
  const allDone = steps.every((s) => s.done)
  const completedCount = steps.filter((s) => s.done).length

  return (
    <>
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

      <div className="flex flex-col gap-3">
        <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
          <p className="text-[14px] font-medium">Importar horarios</p>
          <p className="text-[12px] text-muted-foreground">
            Importar horarios existentes desde Excel, PDF o imagen. Se cambiará tu organización activa a esta clínica.
          </p>
          <div className="flex items-center gap-3">
            <ImportButton
              orgId={orgId}
              path="/onboarding/import"
              icon={<FileUp className="size-3.5" />}
              label="Importar datos históricos"
              disabled={isPending}
              startTransition={startTransition}
            />
            <ImportButton
              orgId={orgId}
              path="/onboarding/import-rota"
              icon={<CalendarPlus className="size-3.5" />}
              label="Importar horarios futuros"
              disabled={isPending}
              startTransition={startTransition}
            />
          </div>
        </div>
      </div>

      {resetModalOpen && (
        <ResetImplementationModal
          orgId={orgId}
          onClose={() => setResetModalOpen(false)}
          onDone={() => router.refresh()}
        />
      )}
    </>
  )
}

function ImportButton({
  orgId, path, icon, label, disabled, startTransition,
}: {
  orgId: string
  path: string
  icon: React.ReactNode
  label: string
  disabled: boolean
  startTransition: (fn: () => void) => void
}) {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={disabled}
      onClick={() => {
        startTransition(async () => {
          await adminSwitchToOrg(orgId)
          window.open(path, "_blank")
        })
      }}
    >
      {icon}
      {label}
    </Button>
  )
}

function ResetImplementationModal({
  orgId, onClose, onDone,
}: {
  orgId: string
  onClose: () => void
  onDone: () => void
}) {
  const t = useTranslations("adminOrg")
  const [isResetting, startReset] = useTransition()
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
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
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isResetting}
            onClick={() => {
              startReset(async () => {
                const result = await resetOrgImplementation(orgId)
                if (result.success) {
                  toast.success(t("implementationReset"))
                  onClose()
                  onDone()
                }
              })
            }}
          >
            {isResetting ? t("resetting") : t("resetImplementation")}
          </Button>
        </div>
      </div>
    </>
  )
}
