"use client"

import { useState, useTransition, useEffect, useRef } from "react"
import { useLocale } from "next-intl"
import { formatDateWithYear } from "@/lib/format-date"
import { updateMemberRole, removeMember, suspendUser, unsuspendUser, deleteUser, resendAccess } from "@/app/admin/users/actions"
import { cn } from "@/lib/utils"
import { ChevronDown, Trash2, Building2, X, MoreHorizontal, Ban, ShieldCheck, Send, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

type Membership = { orgId: string; orgName: string; orgSlug: string; role: string; authMethod: "otp" | "password" }
export type GlobalUserInfo = {
  id: string
  email: string | null
  fullName: string | null
  avatarUrl: string | null
  lastSignIn: string | null
  isBanned: boolean
  memberships: Membership[]
}
export type GlobalOrgRow = { id: string; name: string; slug: string }

const ROLES = ["admin", "manager", "viewer"] as const
type Role = typeof ROLES[number]

const ROLE_LABEL: Record<Role, string> = { admin: "Admin", manager: "Manager", viewer: "Viewer" }
const ROLE_COLOR: Record<Role, string> = {
  admin: "text-[#1B4F8A] bg-[#dbeafe]",
  manager: "text-[#059669] bg-[#d1fae5]",
  viewer: "text-[#64748B] bg-[#f1f5f9]",
}

function RoleSelect({ userId, orgId, currentRole, onDone }: {
  userId: string; orgId: string; currentRole: string; onDone: () => void
}) {
  const [isPending, startTransition] = useTransition()

  function select(role: Role) {
    if (role === currentRole) { onDone(); return }
    startTransition(async () => {
      const res = await updateMemberRole(userId, orgId, role)
      if (res.error) toast.error(res.error)
      else toast.success("Role updated")
      onDone()
    })
  }

  return (
    <div className="absolute z-50 top-full mt-1 left-0 w-36 rounded-lg border border-border bg-background shadow-lg py-1 overflow-hidden">
      {ROLES.map((r) => (
        <button
          key={r}
          onClick={() => select(r)}
          disabled={isPending}
          className={cn(
            "flex items-center gap-2 w-full px-3 py-2.5 text-[13px] text-left hover:bg-accent transition-colors",
            r === currentRole && "font-medium"
          )}
        >
          <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-medium", ROLE_COLOR[r])}>
            {ROLE_LABEL[r]}
          </span>
          {r === currentRole && <span className="ml-auto text-primary text-[11px]">✓</span>}
        </button>
      ))}
    </div>
  )
}

function UserActionsMenu({ user }: { user: GlobalUserInfo }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [open])

  // Derive auth method: if any org uses password, treat as password user
  const authMethod = user.memberships.some((m) => m.authMethod === "password") ? "password" : "otp"

  function handleResend() {
    setOpen(false)
    if (!user.email) return
    startTransition(async () => {
      const res = await resendAccess(user.email!, authMethod)
      if (res.error) toast.error(res.error)
      else toast.success(authMethod === "password" ? "Password reset email sent" : "Magic link sent")
    })
  }

  function handleSuspend() {
    setOpen(false)
    startTransition(async () => {
      const res = user.isBanned ? await unsuspendUser(user.id) : await suspendUser(user.id)
      if (res.error) toast.error(res.error)
      else toast.success(user.isBanned ? "User unsuspended" : "User suspended")
    })
  }

  function handleDelete() {
    setOpen(false)
    if (!confirm(`Permanently delete ${user.email ?? "this user"}? This cannot be undone.`)) return
    startTransition(async () => {
      const res = await deleteUser(user.id)
      if (res.error) toast.error(res.error)
      else toast.success("User deleted")
    })
  }

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={isPending}
        className="size-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
      >
        <MoreHorizontal className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50 w-52 rounded-lg border border-border bg-background shadow-lg py-1 overflow-hidden">
          {/* Resend access */}
          <button
            onClick={handleResend}
            disabled={!user.email}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] text-left hover:bg-accent transition-colors disabled:opacity-40"
          >
            <Send className="size-4 shrink-0 text-muted-foreground" />
            {authMethod === "password" ? "Send password reset" : "Send magic link"}
          </button>

          {/* Suspend / Unsuspend */}
          <button
            onClick={handleSuspend}
            className={cn(
              "flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] text-left hover:bg-accent transition-colors",
              user.isBanned ? "text-foreground" : "text-amber-600"
            )}
          >
            {user.isBanned
              ? <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
              : <Ban className="size-4 shrink-0 text-amber-500" />
            }
            {user.isBanned ? "Unsuspend user" : "Suspend user"}
          </button>

          <div className="h-px bg-border mx-2 my-1" />

          {/* Delete */}
          <button
            onClick={handleDelete}
            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-[13px] text-left text-destructive hover:bg-destructive/10 transition-colors"
          >
            <AlertTriangle className="size-4 shrink-0" />
            Delete user
          </button>
        </div>
      )}
    </div>
  )
}

function UserRow({ user }: { user: GlobalUserInfo }) {
  const locale = useLocale()
  const [expanded, setExpanded] = useState(false)
  const [rolePickerFor, setRolePickerFor] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const initials = user.fullName
    ? user.fullName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
    : (user.email?.[0] ?? "?").toUpperCase()

  function handleRemove(orgId: string, orgName: string) {
    if (!confirm(`Remove ${user.email ?? "this user"} from "${orgName}"?`)) return
    startTransition(async () => {
      const res = await removeMember(user.id, orgId)
      if (res.error) toast.error(res.error)
      else toast.success("Removed from organisation")
    })
  }

  return (
    <>
      <tr
        className={cn(
          "border-b border-border hover:bg-muted/30 cursor-pointer transition-colors",
          user.isBanned && "opacity-60"
        )}
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {user.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="size-8 rounded-full object-cover" />
              ) : (
                <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[12px] font-semibold">
                  {initials}
                </div>
              )}
              {user.isBanned && (
                <div className="absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full bg-amber-500 flex items-center justify-center">
                  <Ban className="size-2 text-white" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {user.fullName && <p className="text-[14px] font-medium truncate">{user.fullName}</p>}
                {user.isBanned && (
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 shrink-0">Suspended</span>
                )}
              </div>
              <p className="text-[13px] text-muted-foreground truncate">{user.email ?? "—"}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-wrap gap-1.5">
            {user.memberships.length === 0 ? (
              <span className="text-[13px] text-muted-foreground">No orgs</span>
            ) : (
              user.memberships.map((m) => (
                <span key={m.orgId} className="flex items-center gap-1 text-[12px] border border-border rounded-md px-2 py-0.5 bg-muted/40">
                  <Building2 className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate max-w-[120px]">{m.orgName}</span>
                  <span className={cn("ml-0.5 px-1 py-px rounded text-[10px] font-medium", ROLE_COLOR[m.role as Role] ?? ROLE_COLOR.viewer)}>
                    {ROLE_LABEL[m.role as Role] ?? m.role}
                  </span>
                </span>
              ))
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-[13px] text-muted-foreground whitespace-nowrap">
          {user.lastSignIn ? formatDateWithYear(user.lastSignIn.split("T")[0], locale as "es" | "en") : "Never"}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 justify-end">
            <UserActionsMenu user={user} />
            <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", expanded && "rotate-180")} />
          </div>
        </td>
      </tr>

      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={4} className="px-4 py-4">
            {user.memberships.length === 0 ? (
              <p className="text-[13px] text-muted-foreground">This user has no organisation memberships.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {user.memberships.map((m) => (
                  <div key={m.orgId} className="flex items-center gap-3 bg-background border border-border rounded-lg px-4 py-3">
                    <Building2 className="size-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-[14px] font-medium">{m.orgName}</p>
                        <span className="text-[10px] text-muted-foreground border border-border rounded px-1.5 py-px">
                          {m.authMethod === "password" ? "Password" : "Magic link"}
                        </span>
                      </div>
                      <p className="text-[12px] text-muted-foreground">{m.orgSlug}</p>
                    </div>

                    <div className="relative" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => setRolePickerFor(rolePickerFor === m.orgId ? null : m.orgId)}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[13px] font-medium hover:bg-accent transition-colors",
                          ROLE_COLOR[m.role as Role] ?? ROLE_COLOR.viewer
                        )}
                      >
                        {ROLE_LABEL[m.role as Role] ?? m.role}
                        <ChevronDown className="size-3.5" />
                      </button>
                      {rolePickerFor === m.orgId && (
                        <RoleSelect
                          userId={user.id}
                          orgId={m.orgId}
                          currentRole={m.role}
                          onDone={() => setRolePickerFor(null)}
                        />
                      )}
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleRemove(m.orgId, m.orgName) }}
                      disabled={isPending}
                      className="size-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  )
}

export function AdminGlobalUsersTable({ users }: { users: GlobalUserInfo[] }) {
  const [search, setSearch] = useState("")

  const filtered = search.trim()
    ? users.filter((u) =>
        u.email?.toLowerCase().includes(search.toLowerCase()) ||
        u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        u.memberships.some((m) => m.orgName.toLowerCase().includes(search.toLowerCase()))
      )
    : users

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          type="search"
          placeholder="Search by email, name or organisation…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full h-9 rounded-lg border border-border bg-background px-3 text-[14px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-background overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">User</th>
              <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground">Organisations & roles</th>
              <th className="text-left px-4 py-2.5 text-[12px] font-medium text-muted-foreground whitespace-nowrap">Last login</th>
              <th className="w-16" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-[14px] text-muted-foreground">
                  No users match your search
                </td>
              </tr>
            ) : (
              filtered.map((u) => <UserRow key={u.id} user={u} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
