"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import { Users, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createOrgUser } from "@/app/admin/actions"
import { AdminUsersTable } from "@/components/admin-users-table"
import type { UserRow } from "@/components/admin-users-table"

export function UsersSection({
  orgId,
  userRows,
  orgStaff,
}: {
  orgId: string
  userRows: UserRow[]
  orgStaff: { id: string; first_name: string; last_name: string; role: string }[]
}) {
  const [addModalOpen, setAddModalOpen] = useState(false)

  return (
    <>
      <div className="flex flex-col gap-3">
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
      </div>

      {addModalOpen && (
        <AddUserModal orgId={orgId} onClose={() => setAddModalOpen(false)} />
      )}
    </>
  )
}

function AddUserModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const t = useTranslations("adminOrg")
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [fullName, setFullName] = useState("")
  const [appRole, setAppRole] = useState("manager")
  const [isPending, startTransition] = useTransition()

  function handleAdd() {
    if (!email.trim()) return
    const fd = new FormData()
    fd.set("orgId", orgId)
    fd.set("email", email.trim())
    fd.set("fullName", fullName.trim())
    fd.set("appRole", appRole)
    startTransition(async () => {
      const result = await createOrgUser(fd)
      if (result && "error" in result) { toast.error(result.error as string); return }
      toast.success(t("userAdded"))
      onClose()
      router.refresh()
    })
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />
      <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-background border border-border rounded-xl shadow-xl w-[400px] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-medium">Añadir usuario</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[13px] font-medium">Email</label>
            <Input
              type="email" value={email}
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
              placeholder={t("namePlaceholder")}
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
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button size="sm" onClick={handleAdd} disabled={isPending || !email.trim()}>
            {isPending ? "Añadiendo…" : "Añadir"}
          </Button>
        </div>
      </div>
    </>
  )
}
