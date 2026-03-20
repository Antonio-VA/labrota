import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { AddUserForm } from "@/components/admin-add-user-form"
import { getLocale } from "next-intl/server"
import { formatDateWithYear } from "@/lib/format-date"
import type { Organisation } from "@/lib/types/database"
import { ArrowLeft, Users } from "lucide-react"
import { AdminOrgHeaderActions } from "@/components/admin-org-header-actions"
import { AdminUsersTable, type UserRow } from "@/components/admin-users-table"

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border bg-background px-5 py-4">
      <p className="text-[14px] text-muted-foreground">{label}</p>
      <p className="text-[18px] font-medium mt-0.5">{value}</p>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()
  const locale = await getLocale() as "es" | "en"
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch org + stats in parallel
  const [
    orgRes,
    staffRes,
    rotasRes,
    recentRotasRes,
    profilesRes,
  ] = await Promise.all([
    admin.from("organisations").select("*").eq("id", id).single(),
    admin
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", id)
      .eq("onboarding_status", "active"),
    admin
      .from("rotas")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", id),
    admin
      .from("rotas")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", id)
      .gte("created_at", thirtyDaysAgo),
    admin
      .from("organisation_members")
      .select("user_id, role, display_name")
      .eq("organisation_id", id),
  ])

  if (!orgRes.data) notFound()

  const org = orgRes.data as Organisation
  type MemberRecord = { user_id: string; role: string; display_name: string | null }
  const memberRecords = (profilesRes.data ?? []) as MemberRecord[]

  // Fetch profiles for all member user_ids
  const memberUserIds = memberRecords.map((m) => m.user_id)
  const profilesData = memberUserIds.length > 0
    ? ((await admin.from("profiles").select("id, email, full_name").in("id", memberUserIds)).data ?? []) as { id: string; email: string; full_name: string | null }[]
    : []
  const profileMap = Object.fromEntries(profilesData.map((p) => [p.id, p]))

  // Per-user last login from Supabase Auth
  const lastLoginByUser: Record<string, string | null> = {}
  let lastLoginOverall: string | null = null

  if (memberUserIds.length > 0) {
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const memberSet = new Set(memberUserIds)
    const orgAuthUsers = (authData?.users ?? []).filter((u) => memberSet.has(u.id))
    for (const u of orgAuthUsers) {
      lastLoginByUser[u.id] = u.last_sign_in_at ?? null
    }
    const dates = orgAuthUsers.map((u) => u.last_sign_in_at).filter(Boolean) as string[]
    lastLoginOverall = dates.sort().at(-1) ?? null
  }

  const fmt = (d: string) => formatDateWithYear(d, locale)

  const userRows: UserRow[] = memberRecords
    .filter((m) => profileMap[m.user_id])
    .map((m) => {
      const profile = profileMap[m.user_id]
      return {
        id:          profile.id,
        email:       profile.email,
        displayName: m.display_name ?? profile.full_name,
        orgId:       id,
        role:        m.role,
        lastLogin:   lastLoginByUser[profile.id] ? fmt(lastLoginByUser[profile.id]!) : null,
      }
    })

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <AdminOrgHeaderActions org={org} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active staff"      value={staffRes.count ?? 0} />
        <StatCard label="Rotas (all time)"  value={rotasRes.count ?? 0} />
        <StatCard label="Rotas (30 days)"   value={recentRotasRes.count ?? 0} />
        <StatCard label="Last login"        value={lastLoginOverall ? fmt(lastLoginOverall) : "Never"} />
      </div>

      {/* Users */}
      <div className="flex flex-col gap-3">
        <h2 className="text-[18px] font-medium">Users</h2>

        <div className="rounded-lg border border-border bg-background overflow-hidden">
          {userRows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users className="size-6 text-muted-foreground" />
              <p className="text-[14px] text-muted-foreground">No users yet</p>
            </div>
          ) : (
            <AdminUsersTable users={userRows} orgId={id} />
          )}
        </div>

        {/* Add user form */}
        <div className="rounded-lg border border-border bg-background p-5">
          <h3 className="text-[14px] font-medium mb-4">Add user to this organisation</h3>
          <AddUserForm orgId={org.id} />
        </div>
      </div>
    </div>
  )
}
