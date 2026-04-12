import { createAdminClient } from "@/lib/supabase/admin"
import { Users } from "lucide-react"
import { AdminGlobalUsersTable } from "@/components/admin-global-users-table"
import type { GlobalUserInfo, GlobalOrgRow } from "@/components/admin-global-users-table"

type MemberRow = { user_id: string; organisation_id: string; role: string; display_name: string | null }
type OrgRow = { id: string; name: string; slug: string }

export default async function AdminUsersPage() {
  const admin = createAdminClient()

  // Fetch all org memberships + all orgs in parallel
  const [membersRes, orgsRes] = await Promise.all([
    admin.from("organisation_members").select("user_id, organisation_id, role, display_name") as unknown as Promise<{ data: MemberRow[] | null }>,
    admin.from("organisations").select("id, name, slug").order("name") as unknown as Promise<{ data: OrgRow[] | null }>,
  ])

  const members = membersRes.data ?? []
  const orgs = orgsRes.data ?? []
  const orgMap = Object.fromEntries(orgs.map((o) => [o.id, o]))

  // Get unique user IDs and batch-fetch auth users
  const userIds = [...new Set(members.map((m) => m.user_id))]
  const authUsers = await Promise.all(userIds.map((id) => admin.auth.admin.getUserById(id)))

  const userMap: Record<string, GlobalUserInfo> = {}
  for (const res of authUsers) {
    const u = res.data?.user
    if (!u) continue
    userMap[u.id] = {
      id: u.id,
      email: u.email ?? null,
      fullName: (u.user_metadata?.full_name as string) ?? null,
      avatarUrl: (u.user_metadata?.avatar_url as string) ?? null,
      lastSignIn: u.last_sign_in_at ?? null,
      memberships: [],
    }
  }

  for (const m of members) {
    const org = orgMap[m.organisation_id]
    if (!org || !userMap[m.user_id]) continue
    userMap[m.user_id].memberships.push({
      orgId: m.organisation_id,
      orgName: org.name,
      orgSlug: org.slug,
      role: m.role,
    })
  }

  const users = Object.values(userMap).sort((a, b) =>
    (a.email ?? "").localeCompare(b.email ?? "")
  )

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-medium">Users</h1>
        <span className="text-[14px] text-muted-foreground">{users.length} total</span>
      </div>

      {users.length === 0 ? (
        <div className="rounded-lg border border-border bg-background flex flex-col items-center gap-3 py-16 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-[14px] font-medium">No users yet</p>
        </div>
      ) : (
        <AdminGlobalUsersTable users={users} />
      )}
    </div>
  )
}
