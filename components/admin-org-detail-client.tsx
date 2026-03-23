"use client"

import { useState, useRef, useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import { Users, Plus, MoreHorizontal, X } from "lucide-react"
import { COUNTRIES, getCountry } from "@/lib/regional-config"
import { updateOrgRegional, createOrgUser } from "@/app/admin/actions"
import type { UserRow } from "@/components/admin-users-table"
import { AdminUsersTable } from "@/components/admin-users-table"

export function AdminOrgDetailClient({
  orgId,
  userRows,
  initialCountry,
  initialRegion,
}: {
  orgId: string
  userRows: UserRow[]
  initialCountry: string
  initialRegion: string
}) {
  const router = useRouter()
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

  function handleSaveRegional() {
    startTransition(async () => {
      const result = await updateOrgRegional(orgId, country, region)
      if (result.error) toast.error(result.error)
      else toast.success("Configuración guardada")
    })
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
      {/* Configuración regional */}
      <div className="flex flex-col gap-3">
        <h2 className="text-[18px] font-medium">Configuración regional</h2>
        <div className="rounded-lg border border-border bg-background p-5">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <label className="text-[14px] font-medium shrink-0">País</label>
              <select
                value={country}
                onChange={(e) => handleCountryChange(e.target.value)}
                disabled={isPending}
                className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring min-w-[220px]"
              >
                <option value="">— Seleccionar —</option>
                {COUNTRIES.map((c) => (
                  <option key={c.code} value={c.code}>{c.name_en}</option>
                ))}
              </select>
            </div>

            {countryConfig && countryConfig.regions.length > 0 && (
              <div className="flex items-center justify-between gap-4">
                <label className="text-[14px] font-medium shrink-0">Región</label>
                <select
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={isPending}
                  className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-[14px] outline-none focus-visible:border-ring min-w-[220px]"
                >
                  <option value="">— Seleccionar —</option>
                  {countryConfig.regions.map((r) => (
                    <option key={r.code} value={r.code}>{r.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={handleSaveRegional} disabled={isPending}>
                {isPending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      </div>

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
