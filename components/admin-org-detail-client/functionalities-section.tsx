"use client"

import { useTransition } from "react"
import { useTranslations } from "next-intl"
import { toggleOrgSwapRequests, toggleOrgOutlookSync } from "@/app/admin/actions"
import { AdminToggle } from "./shared"

export function FunctionalitiesSection({
  orgId,
  displayMode,
  setDisplayMode,
  enableNotes,
  setEnableNotes,
  enableTaskInShift,
  setEnableTaskInShift,
  leaveRequests,
  setLeaveRequests,
  enableSwapRequests,
  setEnableSwapRequests,
  enableOutlookSync,
  setEnableOutlookSync,
  disabled,
}: {
  orgId: string
  displayMode: "by_shift" | "by_task"
  setDisplayMode: (v: "by_shift" | "by_task") => void
  enableNotes: boolean
  setEnableNotes: (v: boolean) => void
  enableTaskInShift: boolean
  setEnableTaskInShift: (v: boolean) => void
  leaveRequests: boolean
  setLeaveRequests: (v: boolean) => void
  enableSwapRequests: boolean
  setEnableSwapRequests: (v: boolean) => void
  enableOutlookSync: boolean
  setEnableOutlookSync: (v: boolean) => void
  disabled: boolean
}) {
  const t = useTranslations("adminOrg")
  const [, startInlineTransition] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Horario</p>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[14px] font-medium">Modo de horario</p>
            <p className="text-[12px] text-muted-foreground">
              {displayMode === "by_shift" ? t("byShiftDesc") : t("byTaskDesc")}
            </p>
          </div>
          <div className="flex gap-4">
            {([
              { key: "by_shift" as const, label: t("byShift") },
              { key: "by_task" as const,  label: t("byTask") },
            ]).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio" name="displayMode"
                  disabled={disabled}
                  checked={displayMode === key}
                  onChange={() => setDisplayMode(key)}
                  className="accent-primary"
                />
                <span className="text-[13px] font-medium">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="h-px bg-border" />
        <AdminToggle
          label="Notas en el horario"
          desc="Añade notas diarias al pie del horario"
          value={enableNotes}
          onChange={setEnableNotes}
          disabled={disabled}
        />
        {displayMode === "by_shift" && (
          <>
            <div className="h-px bg-border" />
            <AdminToggle
              label="Asignación de tareas en horario por turno"
              desc="Permite asignar tareas o subdepartamentos a cada persona dentro de su turno"
              value={enableTaskInShift}
              onChange={setEnableTaskInShift}
              disabled={disabled}
            />
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Autoservicio del personal</p>
        <AdminToggle
          label="Solicitud de ausencias"
          desc="Permite al personal solicitar vacaciones y ausencias desde la app"
          value={leaveRequests}
          onChange={setLeaveRequests}
          disabled={disabled}
        />
        {displayMode === "by_shift" && (
          <>
            <div className="h-px bg-border" />
            <AdminToggle
              label="Solicitudes de cambio de turno"
              desc="Permitir que el personal solicite intercambios de turno en horarios publicados"
              value={enableSwapRequests}
              onChange={(val) => {
                setEnableSwapRequests(val)
                startInlineTransition(async () => {
                  const result = await toggleOrgSwapRequests(orgId, val)
                  if (result?.error) setEnableSwapRequests(!val)
                })
              }}
              disabled={disabled}
            />
          </>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wide">Integraciones</p>
        <AdminToggle
          label="Sincronización Outlook"
          desc="Sincronizar ausencias automáticamente desde calendarios de Outlook del personal"
          value={enableOutlookSync}
          onChange={(val) => {
            setEnableOutlookSync(val)
            startInlineTransition(async () => {
              const result = await toggleOrgOutlookSync(orgId, val)
              if (result?.error) setEnableOutlookSync(!val)
            })
          }}
          disabled={disabled}
        />
      </div>
    </div>
  )
}
