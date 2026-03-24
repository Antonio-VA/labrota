"use client"

import { useState, useTransition, useRef } from "react"
import { useRouter } from "next/navigation"
import { createOrganisation } from "@/app/admin/actions"
import { generateSlug } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { ArrowLeft, AlertCircle } from "lucide-react"
import { AdminImportWizard } from "@/components/admin-import-wizard"

export default function NewOrgPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [name, setName] = useState("")
  const [error, setError] = useState("")
  const [createMode, setCreateMode] = useState<"scratch" | "import">("scratch")
  const [showImportWizard, setShowImportWizard] = useState(false)

  function handleCreate() {
    if (!name.trim()) return
    setError("")

    if (createMode === "import") {
      setShowImportWizard(true)
      return
    }

    // Create from scratch
    const fd = new FormData()
    fd.set("name", name.trim())
    fd.set("slug", generateSlug(name.trim()))

    startTransition(async () => {
      const result = await createOrganisation(fd)
      if (result?.error) setError(result.error)
      else if ((result as { orgId?: string })?.orgId) {
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

  return (
    <div className="flex flex-col gap-6 max-w-md">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-[18px] font-medium">Nueva organización</h1>
      </div>

      {/* Org name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-[14px] font-medium">Nombre de la organización</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Clínica FIV Madrid"
          disabled={isPending}
        />
      </div>

      {/* Mode — radio buttons */}
      <div className="flex flex-col gap-2">
        <label className="text-[14px] font-medium">Método de creación</label>
        <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
          <input type="radio" name="mode" checked={createMode === "scratch"} onChange={() => setCreateMode("scratch")} className="accent-primary" />
          <div>
            <span className="text-[14px] font-medium">Empezar desde cero</span>
            <p className="text-[12px] text-muted-foreground">Organización vacía — configuras todo manualmente</p>
          </div>
        </label>
        <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer transition-colors">
          <input type="radio" name="mode" checked={createMode === "import"} onChange={() => setCreateMode("import")} className="accent-primary" />
          <div>
            <span className="text-[14px] font-medium">Importar desde Excel</span>
            <p className="text-[12px] text-muted-foreground">Sube un archivo .xlsx con el horario existente</p>
          </div>
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <AlertCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-[14px] text-red-600">{error}</p>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button onClick={handleCreate} disabled={isPending || !name.trim()}>
          {isPending ? "Creando…" : "Crear organización"}
        </Button>
        <Button variant="outline" render={<Link href="/" />}>
          Cancelar
        </Button>
      </div>
    </div>
  )
}
