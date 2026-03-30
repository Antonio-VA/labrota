"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { renameOrgUser, removeOrgUser, updateOrgUserRole } from "@/app/admin/actions"
import { toast } from "sonner"
import { Check, X, Pencil } from "lucide-react"

export interface UserRow {
  id:          string
  email:       string
  displayName: string | null   // resolved: org display_name ?? global full_name
  orgId:       string
  role:        string
  lastLogin:   string | null
}

export function AdminUsersTable({ users, orgId }: { users: UserRow[]; orgId: string }) {
  return (
    <table className="w-full text-[14px]">
      <thead>
        <tr className="border-b border-border bg-muted">
          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nombre</th>
          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Rol</th>
          <th className="px-4 py-3 text-left font-medium text-muted-foreground">Último acceso</th>
          <th className="px-4 py-3" />
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <UserTableRow key={u.id} user={u} orgId={orgId} />
        ))}
      </tbody>
    </table>
  )
}

function UserTableRow({ user, orgId }: { user: UserRow; orgId: string }) {
  const [isEditing, setIsEditing]     = useState(false)
  const [draft, setDraft]             = useState(user.displayName ?? "")
  const [displayName, setDisplayName] = useState(user.displayName)
  const [role, setRole]               = useState(user.role)
  const [error, setError]             = useState("")
  const [isPending, startTransition]  = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  function handleRoleChange(newRole: string) {
    const prev = role
    setRole(newRole)
    startTransition(async () => {
      const result = await updateOrgUserRole(user.id, orgId, newRole)
      if (result?.error) {
        setRole(prev)
        toast.error(result.error)
      } else {
        toast.success("Rol actualizado")
      }
    })
  }

  useEffect(() => {
    if (isEditing) inputRef.current?.focus()
  }, [isEditing])

  function openEdit() {
    setDraft(displayName ?? "")
    setError("")
    setIsEditing(true)
  }

  function cancel() {
    setIsEditing(false)
    setError("")
  }

  function commit() {
    if (draft.trim() === (displayName ?? "")) { setIsEditing(false); return }
    startTransition(async () => {
      const result = await renameOrgUser(user.id, orgId, draft)
      if (result?.error) {
        setError(result.error)
      } else {
        setDisplayName(draft.trim() || null)
        setIsEditing(false)
        setError("")
      }
    })
  }

  return (
    <tr className="border-b border-border last:border-0 even:bg-muted/30">
      {/* Name — inline editable, email shown as tooltip */}
      <td className="px-4 py-3">
        {isEditing ? (
          <div className="flex items-center gap-1.5">
            <Input
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter")  commit()
                if (e.key === "Escape") cancel()
              }}
              disabled={isPending}
              className="h-7 text-[13px] w-44"
            />
            <button
              onClick={commit}
              disabled={isPending}
              className="flex items-center justify-center size-6 rounded text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
              aria-label="Save"
            >
              <Check className="size-3.5" />
            </button>
            <button
              onClick={cancel}
              disabled={isPending}
              className="flex items-center justify-center size-6 rounded text-muted-foreground hover:bg-muted transition-colors"
              aria-label="Cancel"
            >
              <X className="size-3.5" />
            </button>
            {error && <span className="text-[12px] text-destructive">{error}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 group">
            <div>
              <span
                className="font-medium"
                title={user.email}
              >
                {displayName ?? <span className="text-muted-foreground italic">No name</span>}
              </span>
              <p className="text-[12px] text-muted-foreground leading-none mt-0.5">{user.email}</p>
            </div>
            <button
              onClick={openEdit}
              className="flex items-center justify-center size-6 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-all"
              aria-label="Rename"
            >
              <Pencil className="size-3" />
            </button>
          </div>
        )}
      </td>

      {/* Role dropdown */}
      <td className="px-4 py-3">
        <select
          value={role}
          onChange={(e) => handleRoleChange(e.target.value)}
          disabled={isPending}
          className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none cursor-pointer"
        >
          {role === "admin" && <option value="admin">Admin</option>}
          <option value="manager">Manager</option>
          <option value="viewer">Viewer</option>
        </select>
      </td>

      {/* Last login */}
      <td className="px-4 py-3 text-muted-foreground">
        {user.lastLogin ?? <span className="text-muted-foreground/50">Never</span>}
      </td>

      {/* Remove */}
      <td className="px-4 py-3 text-right">
        <form
          action={removeOrgUser.bind(null, user.id, orgId)}
          onSubmit={(e) => {
            if (!confirm(`Remove ${user.email} from this organisation?`)) e.preventDefault()
          }}
        >
          <button
            type="submit"
            className="text-[13px] text-destructive hover:underline underline-offset-2"
          >
            Remove
          </button>
        </form>
      </td>
    </tr>
  )
}
