"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createOrganisation } from "@/app/admin/actions"
import { generateSlug } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { ArrowLeft, ArrowRight, AlertCircle, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import dynamic from "next/dynamic"
const AdminImportWizard = dynamic(() => import("@/components/admin-import-wizard").then((m) => m.AdminImportWizard), { ssr: false })

type Step = "name" | "config" | "creating"

const COVERAGE_OPTIONS = [
  {
    id: "standard",
    label: "IVF estándar",
    description: "Lab 3, Andrología 1, Admin 1 (L–V) · Lab 1 (Sáb) · Libre (Dom)",
  },
  {
    id: "andrology",
    label: "IVF + Andrología intensiva",
    description: "Lab 3, Andrología 2, Admin 1 (L–V) · Lab 1, Andr 1 (Sáb) · Libre (Dom)",
  },
  {
    id: "minimal",
    label: "Cobertura mínima",
    description: "Lab 2, Andrología 1, Admin 1 (L–V) · Lab 1 (Sáb) · Libre (Dom)",
  },
  {
    id: "custom",
    label: "Personalizado",
    description: "Aplica estándares ahora — ajusta en Configuración de laboratorio",
  },
]

const COUNTRY_OPTIONS = [
  { code: "ES", label: "España" },
  { code: "GB", label: "United Kingdom" },
  { code: "AE", label: "UAE / GCC" },
  { code: "PT", label: "Portugal" },
  { code: "FR", label: "France" },
  { code: "DE", label: "Germany" },
  { code: "",   label: "Otro / Other" },
]

function RadioCard({
  checked, onChange, label, description, className,
}: {
  checked: boolean; onChange: () => void; label: string; description?: string; className?: string
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/40",
        checked ? "border-primary bg-primary/5" : "border-border",
        className,
      )}
    >
      <span className={cn(
        "mt-0.5 size-4 rounded-full border-2 flex items-center justify-center shrink-0",
        checked ? "border-primary" : "border-muted-foreground/40",
      )}>
        {checked && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <input type="radio" checked={checked} onChange={onChange} className="sr-only" />
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[14px] font-medium">{label}</span>
        {description && <span className="text-[12px] text-muted-foreground">{description}</span>}
      </div>
    </label>
  )
}

export default function NewOrgPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Step 1
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [createMode, setCreateMode] = useState<"scratch" | "import">("scratch")
  const [showImportWizard, setShowImportWizard] = useState(false)

  // Step 2
  const [step, setStep] = useState<Step>("name")
  const [coveragePreset, setCoveragePreset] = useState("standard")
  const [rotaDisplayMode, setRotaDisplayMode] = useState("by_shift")
  const [country, setCountry] = useState("ES")
  const [authMethod, setAuthMethod] = useState("otp")
  const [firstUserEmail, setFirstUserEmail] = useState("")
  const [firstUserName, setFirstUserName] = useState("")

  function goToConfig() {
    if (!name.trim()) return
    setError("")
    if (createMode === "import") {
      setShowImportWizard(true)
      return
    }
    setStep("config")
  }

  function handleCreate() {
    setError("")
    const fd = new FormData()
    fd.set("name", name.trim())
    fd.set("slug", generateSlug(name.trim()))
    fd.set("coverage_preset", coveragePreset === "custom" ? "standard" : coveragePreset)
    fd.set("rota_display_mode", rotaDisplayMode)
    fd.set("country", country)
    fd.set("auth_method", authMethod)
    if (firstUserEmail) {
      fd.set("first_user_email", firstUserEmail)
      fd.set("first_user_name", firstUserName)
    }

    startTransition(async () => {
      const result = await createOrganisation(fd)
      if (result?.error) {
        setError(result.error)
        setStep("config")
      } else if ((result as { orgId?: string })?.orgId) {
        router.push(`/admin/orgs/${(result as { orgId: string }).orgId}`)
      }
    })
  }

  if (showImportWizard) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" onClick={() => setShowImportWizard(false)}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-[18px] font-medium">Importar — {name}</h1>
        </div>
        <AdminImportWizard orgName={name} />
      </div>
    )
  }

  // ── Step 1: Name + mode ───────────────────────────────────────────────────
  if (step === "name") {
    return (
      <div className="flex flex-col gap-6 max-w-md">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <h1 className="text-[18px] font-medium">Nueva organización</h1>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[14px] font-medium">Nombre de la organización</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && goToConfig()}
            placeholder="Clínica FIV Madrid"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-[14px] font-medium">Método de creación</label>
          <RadioCard
            checked={createMode === "scratch"}
            onChange={() => setCreateMode("scratch")}
            label="Empezar desde cero"
            description="Organización vacía — configuramos los ajustes clave ahora"
          />
          <RadioCard
            checked={createMode === "import"}
            onChange={() => setCreateMode("import")}
            label="Importar desde Excel"
            description="Sube un archivo .xlsx con el horario existente"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
            <p className="text-[14px] text-red-600">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={goToConfig} disabled={!name.trim()}>
            {createMode === "import" ? "Continuar" : (
              <span className="flex items-center gap-1.5">Siguiente <ArrowRight className="size-3.5" /></span>
            )}
          </Button>
          <Button variant="outline" render={<Link href="/" />}>
            Cancelar
          </Button>
        </div>
      </div>
    )
  }

  // ── Step 2: Key configuration ─────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 max-w-lg">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" onClick={() => setStep("name")} disabled={isPending}>
          <ArrowLeft className="size-4" />
        </Button>
        <div>
          <h1 className="text-[18px] font-medium">Configurar organización</h1>
          <p className="text-[13px] text-muted-foreground">{name}</p>
        </div>
      </div>

      {/* Coverage preset */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-[14px] font-medium">Cobertura mínima</p>
          <p className="text-[13px] text-muted-foreground">Número de personas requeridas por departamento cada día</p>
        </div>
        <div className="flex flex-col gap-1.5">
          {COVERAGE_OPTIONS.map((opt) => (
            <RadioCard
              key={opt.id}
              checked={coveragePreset === opt.id}
              onChange={() => setCoveragePreset(opt.id)}
              label={opt.label}
              description={opt.description}
            />
          ))}
        </div>
      </div>

      {/* Rota display mode */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-[14px] font-medium">Vista del horario</p>
          <p className="text-[13px] text-muted-foreground">Cómo se mostrarán las asignaciones en el horario</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <RadioCard
            checked={rotaDisplayMode === "by_shift"}
            onChange={() => setRotaDisplayMode("by_shift")}
            label="Por turno"
            description="Cada celda muestra el turno (T1, T2…). Ideal para horarios por turnos."
          />
          <RadioCard
            checked={rotaDisplayMode === "by_task"}
            onChange={() => setRotaDisplayMode("by_task")}
            label="Por tarea"
            description="Cada celda muestra las técnicas asignadas. Ideal para labs de FIV con tareas específicas."
          />
        </div>
      </div>

      {/* Country */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[14px] font-medium">País</label>
        <p className="text-[13px] text-muted-foreground">Se usa para el calendario de festivos locales</p>
        <div className="flex flex-wrap gap-1.5">
          {COUNTRY_OPTIONS.map((c) => (
            <button
              key={c.code}
              onClick={() => setCountry(c.code)}
              className={cn(
                "px-3 py-1.5 rounded-lg border text-[13px] font-medium transition-colors",
                country === c.code ? "border-primary bg-primary/5 text-primary" : "border-border hover:bg-muted/40",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Auth method */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-[14px] font-medium">Autenticación</p>
          <p className="text-[13px] text-muted-foreground">Cómo acceden los usuarios a la plataforma</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <RadioCard
            checked={authMethod === "otp"}
            onChange={() => setAuthMethod("otp")}
            label="Magic link (OTP)"
            description="Los usuarios reciben un enlace por email cada vez que inician sesión — sin contraseña"
          />
          <RadioCard
            checked={authMethod === "password"}
            onChange={() => setAuthMethod("password")}
            label="Contraseña"
            description="Los usuarios establecen una contraseña en el primer acceso"
          />
        </div>
      </div>

      {/* First admin user */}
      <div className="flex flex-col gap-2">
        <div>
          <p className="text-[14px] font-medium">Primer usuario administrador <span className="text-muted-foreground font-normal">(opcional)</span></p>
          <p className="text-[13px] text-muted-foreground">Se enviará una invitación a este email al crear la organización</p>
        </div>
        <div className="flex gap-2">
          <Input
            value={firstUserEmail}
            onChange={(e) => setFirstUserEmail(e.target.value)}
            placeholder="admin@clinica.com"
            type="email"
            className="flex-1"
          />
          <Input
            value={firstUserName}
            onChange={(e) => setFirstUserName(e.target.value)}
            placeholder="Nombre (opcional)"
            className="flex-1"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[14px] text-red-600">{error}</p>
        </div>
      )}

      {/* Summary */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex flex-col gap-1.5">
        <p className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide">Resumen</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px]">
          <span className="text-muted-foreground">Organización</span>
          <span className="font-medium">{name}</span>
          <span className="text-muted-foreground">Cobertura</span>
          <span className="font-medium">{COVERAGE_OPTIONS.find((o) => o.id === coveragePreset)?.label ?? "Estándar"}</span>
          <span className="text-muted-foreground">Vista horario</span>
          <span className="font-medium">{rotaDisplayMode === "by_task" ? "Por tarea" : "Por turno"}</span>
          <span className="text-muted-foreground">País</span>
          <span className="font-medium">{COUNTRY_OPTIONS.find((c) => c.code === country)?.label ?? (country || "—")}</span>
          <span className="text-muted-foreground">Autenticación</span>
          <span className="font-medium">{authMethod === "otp" ? "Magic link" : "Contraseña"}</span>
          {firstUserEmail && (
            <>
              <span className="text-muted-foreground">Primer admin</span>
              <span className="font-medium">{firstUserEmail}</span>
            </>
          )}
        </div>
        <p className="text-[12px] text-muted-foreground mt-1">
          Se crearán automáticamente: 3 departamentos (Lab, Andrología, Admin) · 4 tipos de turno (T1–T4) · Cobertura por día
        </p>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleCreate} disabled={isPending}>
          {isPending ? (
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Creando…
            </span>
          ) : (
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5" />
              Crear organización
            </span>
          )}
        </Button>
        <Button variant="outline" onClick={() => setStep("name")} disabled={isPending}>
          Atrás
        </Button>
      </div>
    </div>
  )
}
