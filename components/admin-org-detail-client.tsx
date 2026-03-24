"use client"

import { useState, useRef, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Users, Plus, MoreHorizontal, X } from "lucide-react"
import { COUNTRIES, getCountry } from "@/lib/regional-config"
import { updateOrgRegional, updateOrgDisplayMode, createOrgUser } from "@/app/admin/actions"
import type { UserRow } from "@/components/admin-users-table"
import { AdminUsersTable } from "@/components/admin-users-table"

export function AdminOrgDetailClient({
  orgId,
  userRows,
  initialCountry,
  initialRegion,
  initialDisplayMode = "by_shift",
}: {
  orgId: string
  userRows: UserRow[]
  initialCountry: string
  initialRegion: string
  initialDisplayMode?: "by_shift" | "by_task"
}) {
  const router = useRouter()
  const [displayMode, setDisplayMode] = useState(initialDisplayMode)
  const [country, setCountry] = useState(initialCountry)
  const [region, setRegion] = useState(initialRegion)
  const [isPending, startTransition] = useTransition()

  // Add user modal
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [appRole, setAppRole] = useState("admin")

  const countryConfig = getCountry(country)

  function handleCountryChange(code: string) {
    setCountry(code)
    setRegion("")
  }

  async function handleSaveRegional(): Promise<{ error?: string }> {
    return updateOrgRegional(orgId, country, region)
  }

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

  return (
    <>
      {/* Modo de horario */}
      <div className="flex flex-col gap-3">
        <h2 className="text-[18px] font-medium">Modo de horario</h2>
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-[13px] text-muted-foreground shrink-0">Modo</span>
            <div className="flex rounded-lg border border-input overflow-hidden">
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
            <span className="text-[11px] text-muted-foreground">
              {displayMode === "by_shift" ? "Personal asignado a turnos por día" : "Personal asignado a tareas por día"}
            </span>
          </div>
        </div>
      </div>

      {/* Configuración regional */}
      <div className="flex flex-col gap-3">
        <h2 className="text-[18px] font-medium">Configuración regional</h2>
        <div className="rounded-lg border border-border bg-background px-4 py-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[13px] text-muted-foreground shrink-0">País</label>
              <select
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
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
      </div>

      {/* Single save button for both sections */}
      <Button onClick={() => {
        if (displayMode !== initialDisplayMode) {
          if (!confirm("Cambiar el modo de horario puede afectar la visualización de los horarios existentes. ¿Deseas continuar?")) {
            setDisplayMode(initialDisplayMode)
            return
          }
        }
        startTransition(async () => {
          let hasError = false
          if (displayMode !== initialDisplayMode) {
            const r = await updateOrgDisplayMode(orgId, displayMode)
            if (r.error) { toast.error(r.error); hasError = true }
          }
          const r2 = await handleSaveRegional()
          if (r2.error) { toast.error(r2.error); hasError = true }
          if (!hasError) toast.success("Configuración guardada")
        })
      }} disabled={isPending} className="w-fit">
        {isPending ? "Guardando…" : "Guardar"}
      </Button>

      {/* Usuarios */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-medium">Usuarios</h2>
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
            <AdminUsersTable users={userRows} orgId={orgId} />
          )}
        </div>
      </div>

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
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@clinica.com"
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium">Nombre completo</label>
                <Input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nombre Apellido"
                  disabled={isPending}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[13px] font-medium">Rol</label>
                <select
                  value={appRole}
                  onChange={(e) => setAppRole(e.target.value)}
                  disabled={isPending}
                  className="h-9 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring"
                >
                  <option value="admin">Admin</option>
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
