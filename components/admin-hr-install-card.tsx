"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RotateCcw } from "lucide-react"
import { formatDateWithYear } from "@/lib/format-date"
import { adminInstallHrModule } from "@/app/admin/hr-module-actions"
import Link from "next/link"

interface Props {
  orgId: string
  installed: boolean
  active: boolean
  installedAt: string | null
}

export function AdminHrInstallCard({ orgId, installed, active, installedAt }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleInstall = () => {
    startTransition(async () => {
      const result = await adminInstallHrModule(orgId)
      if (result.error) toast.error(result.error)
      else { toast.success("Módulo RRHH instalado"); router.refresh() }
    })
  }

  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4 flex flex-col gap-3">
      <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">Módulos</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium">RRHH</span>
          {active && (
            <>
              <Badge variant="active">Activo</Badge>
              {installedAt && <span className="text-[13px] text-muted-foreground">Instalado el {formatDateWithYear(installedAt, "es")}</span>}
            </>
          )}
          {installed && !active && <Badge variant="inactive">Inactivo</Badge>}
          {!installed && <span className="text-[13px] text-muted-foreground">No instalado</span>}
        </div>

        <div>
          {active && (
            <Button variant="outline" size="sm" render={<Link href={`/orgs/${orgId}/rrhh`} />}>
              Configurar
            </Button>
          )}
          {(!installed || !active) && (
            <Button size="sm" onClick={handleInstall} disabled={isPending}>
              {installed ? <><RotateCcw className="size-3.5 mr-1.5" />Reinstalar</> : "Instalar"}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
