"use client"

import { useState, useTransition, useRef, useEffect } from "react"
import { useTranslations, useLocale } from "next-intl"
import { UserPlus, Link2, Link2Off, MoreHorizontal, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
  inviteOrgUser,
  updateUserRole,
  removeOrgMember,
  linkUserToStaff,
  type OrgUser,
} from "@/app/(clinic)/settings/actions"
import type { Staff } from "@/lib/types/database"

export function OrgUsersTable({
  initialUsers,
  staff,
}: {
  initialUsers: OrgUser[]
  staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
}) {
  const t = useTranslations("orgUsers")
  const tc = useTranslations("common")
  const locale = useLocale()
  const dateFmt = locale === "es" ? "es-ES" : "en-US"
  const [users, setUsers] = useState(initialUsers)
  const [isPending, startTransition] = useTransition()
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteName, setInviteName] = useState("")
  const [inviteRole, setInviteRole] = useState("viewer")
  const [linkingUserId, setLinkingUserId] = useState<string | null>(null)
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpenId) return
    function h(e: MouseEvent) { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpenId(null) }
    document.addEventListener("mousedown", h)
    return () => document.removeEventListener("mousedown", h)
  }, [menuOpenId])

  function handleInvite() {
    if (!inviteEmail.trim()) return
    startTransition(async () => {
      const result = await inviteOrgUser(inviteEmail, inviteRole, inviteName)
      if (result.error) { toast.error(result.error); return }
      toast.success(t("inviteSent"))
      setShowInvite(false)
      setInviteEmail(""); setInviteName(""); setInviteRole("viewer")
      setUsers((prev) => [...prev, { userId: "pending", email: inviteEmail.trim().toLowerCase(), displayName: inviteName || null, role: inviteRole, linkedStaffId: null, lastLogin: null }])
    })
  }

  function handleRoleChange(userId: string, newRole: string) {
    const prev = users
    setUsers((u) => u.map((x) => x.userId === userId ? { ...x, role: newRole } : x))
    startTransition(async () => {
      const result = await updateUserRole(userId, newRole)
      if (result.error) {
        setUsers(prev)
        toast.error(result.error)
        return
      }
      toast.success(t("roleUpdated"))
    })
  }

  function handleRemove(userId: string) {
    setMenuOpenId(null)
    if (!confirm(t("removeConfirm"))) return
    startTransition(async () => {
      const result = await removeOrgMember(userId)
      if (result.error) { toast.error(result.error); return }
      setUsers((prev) => prev.filter((u) => u.userId !== userId))
      toast.success(t("userDeleted"))
    })
  }

  function handleLink(userId: string, staffId: string | null) {
    startTransition(async () => {
      const result = await linkUserToStaff(userId, staffId)
      if (result.error) { toast.error(result.error); return }
      setUsers((prev) => prev.map((u) => u.userId === userId ? { ...u, linkedStaffId: staffId } : u))
      setLinkingUserId(null)
      toast.success(staffId ? t("userLinked") : t("linkRemoved"))
    })
  }

  function fmtLogin(d: string | null) {
    if (!d) return "—"
    return new Date(d).toLocaleDateString(dateFmt, { day: "numeric", month: "short" }) + " · " +
      new Date(d).toLocaleTimeString(dateFmt, { hour: "2-digit", minute: "2-digit" })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header with invite button */}
      <div className="flex items-center justify-between">
        <span className="text-[12px] text-muted-foreground">{t("userCount", { count: users.length })}</span>
        <Button size="sm" onClick={() => setShowInvite(true)}>
          <UserPlus className="size-3.5" />
          {t("inviteUser")}
        </Button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div className="flex flex-col gap-2 p-3 rounded-lg border border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <Input placeholder="Email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="flex-1 h-8 text-[13px]" type="email" />
            <Input placeholder={t("nameOptional")} value={inviteName} onChange={(e) => setInviteName(e.target.value)} className="flex-1 h-8 text-[13px]" />
          </div>
          <div className="flex items-center gap-2">
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className="h-8 rounded border border-input bg-transparent px-2 text-[13px] outline-none">
              <option value="manager">Manager</option>
              <option value="viewer">Viewer</option>
            </select>
            <div className="flex-1" />
            <Button size="sm" variant="ghost" onClick={() => setShowInvite(false)} disabled={isPending}>{tc("cancel")}</Button>
            <Button size="sm" onClick={handleInvite} disabled={isPending || !inviteEmail.trim()}>{isPending ? tc("sending") : t("invite")}</Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-muted border-b border-border">
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("userColumn")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("roleColumn")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("linkedStaff")}</th>
              <th className="text-left px-3 py-2 font-medium text-muted-foreground">{t("lastLogin")}</th>
              <th className="px-3 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {users.map((u, i) => {
              const linked = u.linkedStaffId ? staff.find((s) => s.id === u.linkedStaffId) : null
              return (
                <tr key={u.userId} className={cn("border-b border-border last:border-0 hover:bg-muted/50", i % 2 === 1 && "bg-muted/30")}>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{u.displayName ?? u.email}</span>
                      {u.displayName && <span className="text-[11px] text-muted-foreground">{u.email}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.userId, e.target.value)}
                      disabled={isPending || u.role === "admin"}
                      className={cn("h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none cursor-pointer", u.role === "admin" && "opacity-70 cursor-not-allowed")}
                    >
                      {u.role === "admin" && <option value="admin">Admin</option>}
                      <option value="manager">Manager</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {linkingUserId === u.userId ? (
                      <div className="flex items-center gap-1">
                        <select
                          defaultValue={u.linkedStaffId ?? ""}
                          onChange={(e) => handleLink(u.userId, e.target.value || null)}
                          disabled={isPending}
                          className="h-7 rounded border border-input bg-transparent px-2 text-[12px] outline-none"
                        >
                          <option value="">{t("unlinked")}</option>
                          {staff.map((s) => (
                            <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
                          ))}
                        </select>
                        <button onClick={() => setLinkingUserId(null)} className="text-muted-foreground hover:text-foreground">
                          <X className="size-3" />
                        </button>
                      </div>
                    ) : linked ? (
                      <button onClick={() => setLinkingUserId(u.userId)} className="flex items-center gap-1 text-[12px] text-primary hover:underline">
                        <Link2 className="size-3" />{linked.first_name} {linked.last_name}
                      </button>
                    ) : (
                      <button onClick={() => setLinkingUserId(u.userId)} className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground">
                        <Link2Off className="size-3" />{t("link")}
                      </button>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground text-[12px] tabular-nums">
                    {fmtLogin(u.lastLogin)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="relative" ref={menuOpenId === u.userId ? menuRef : undefined}>
                      <button
                        onClick={() => setMenuOpenId(menuOpenId === u.userId ? null : u.userId)}
                        className="size-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                      {menuOpenId === u.userId && (
                        <div className="absolute right-0 top-8 z-50 w-40 rounded-lg border border-border bg-background shadow-lg py-1">
                          <button
                            onClick={() => handleRemove(u.userId)}
                            className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-destructive hover:bg-accent transition-colors"
                          >
                            <Trash2 className="size-3.5" />
                            {t("remove")}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
            {users.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground italic">{t("noUsers")}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
