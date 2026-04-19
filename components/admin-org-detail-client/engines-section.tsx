"use client"

import { AdminToggle } from "./shared"

const SHIFT_ENGINE_VERSIONS = ["v2"] as const

export function EnginesSection({
  displayMode,
  aiOptimalVersion,
  setAiOptimalVersion,
  engineHybridEnabled,
  setEngineHybridEnabled,
  engineReasoningEnabled,
  setEngineReasoningEnabled,
  dailyHybridLimit,
  setDailyHybridLimit,
  taskHybridEnabled,
  setTaskHybridEnabled,
  taskReasoningEnabled,
  setTaskReasoningEnabled,
  disabled,
}: {
  displayMode: "by_shift" | "by_task"
  aiOptimalVersion: string
  setAiOptimalVersion: (v: string) => void
  engineHybridEnabled: boolean
  setEngineHybridEnabled: (v: boolean) => void
  engineReasoningEnabled: boolean
  setEngineReasoningEnabled: (v: boolean) => void
  dailyHybridLimit: number
  setDailyHybridLimit: (v: number) => void
  taskHybridEnabled: boolean
  setTaskHybridEnabled: (v: boolean) => void
  taskReasoningEnabled: boolean
  setTaskReasoningEnabled: (v: boolean) => void
  disabled: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-4">
        <div>
          <p className="text-[14px] font-medium">Motores de generación</p>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Configura qué motores de IA están disponibles para esta organización.
          </p>
        </div>

        {displayMode === "by_shift" ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium">Versión del motor</p>
                <p className="text-[12px] text-muted-foreground">
                  v2 es la única versión disponible actualmente.
                </p>
              </div>
              <div className="flex gap-4">
                {SHIFT_ENGINE_VERSIONS.map((v) => (
                  <label key={v} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="aiOptimalVersion"
                      disabled={disabled}
                      checked={aiOptimalVersion === v}
                      onChange={() => setAiOptimalVersion(v)}
                      className="accent-primary"
                    />
                    <span className="text-[13px] font-medium">{v.toUpperCase()}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="h-px bg-border" />

            <AdminToggle
              label="Motor Híbrido"
              desc="Combina el motor con revisión de Claude. Activado por defecto."
              value={engineHybridEnabled}
              onChange={setEngineHybridEnabled}
              disabled={disabled}
            />

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium">Límite diario híbrido</p>
                <p className="text-[12px] text-muted-foreground">Número máximo de generaciones híbridas por día.</p>
              </div>
              <input
                type="number" min={1} max={100}
                value={dailyHybridLimit}
                onChange={(e) => setDailyHybridLimit(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                className="w-20 rounded-lg border border-border px-2 py-1.5 text-[14px] text-center outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary bg-background"
                disabled={disabled}
              />
            </div>

            <div className="h-px bg-border" />

            <AdminToggle
              label="Razonamiento Claude"
              desc="Claude razona paso a paso. Solo para depuración — desactivado por defecto."
              value={engineReasoningEnabled}
              onChange={setEngineReasoningEnabled}
              disabled={disabled}
              activeColor="amber"
            />
          </>
        ) : (
          <>
            <div className="h-px bg-border" />

            <AdminToggle
              label="Híbrido por Técnica"
              desc="Motor híbrido adaptado para organizaciones por tarea"
              value={taskHybridEnabled}
              onChange={setTaskHybridEnabled}
              disabled={disabled}
            />

            <div className="h-px bg-border" />

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[14px] font-medium text-muted-foreground">
                  Razonamiento por Técnica <span className="text-[11px] font-normal">(próximamente)</span>
                </p>
                <p className="text-[12px] text-muted-foreground/60">
                  Razonamiento Claude adaptado para organizaciones por tarea
                </p>
              </div>
              <AmberToggleButton
                value={taskReasoningEnabled}
                onChange={setTaskReasoningEnabled}
                disabled={disabled}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// Small inline toggle used for the disabled-looking "coming soon" row
// where the surrounding label/desc needs muted-foreground styling that
// AdminToggle doesn't support.
function AmberToggleButton({
  value, onChange, disabled,
}: {
  value: boolean
  onChange: (v: boolean) => void
  disabled: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className={
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors " +
        (value ? "bg-amber-500" : "bg-muted-foreground/20")
      }
    >
      <span
        className={
          "pointer-events-none inline-block size-5 rounded-full bg-white shadow-sm transition-transform " +
          (value ? "translate-x-5" : "translate-x-0")
        }
      />
    </button>
  )
}
