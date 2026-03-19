import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { AddUserForm } from "@/components/admin-add-user-form"
import { getLocale } from "next-intl/server"
import { toggleOrgStatus } from "@/app/admin/actions"
import { formatDateWithYear } from "@/lib/format-date"
import type { Organisation } from "@/lib/types/database"
import { ArrowLeft, Users } from "lucide-react"
import { RemoveUserButton } from "@/components/admin-remove-user-button"

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
      .from("profiles")
      .select("id, email, full_name")
      .eq("organisation_id", id),
  ])

  if (!orgRes.data) notFound()

  const org      = orgRes.data as Organisation
  type ProfileRow = { id: string; email: string; full_name: string | null }
  const profiles = (profilesRes.data ?? []) as ProfileRow[]

  // Last login — cross-reference profiles with auth users
  let lastLogin: string | null = null
  if (profiles.length > 0) {
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const profileIds = profiles.map((p) => p.id)
    const orgAuthUsers = (authData?.users ?? []).filter((u) => profileIds.includes(u.id))
    const dates = orgAuthUsers
      .map((u) => u.last_sign_in_at)
      .filter(Boolean) as string[]
    lastLogin = dates.sort().at(-1) ?? null
  }

  const fmt = (d: string) => formatDateWithYear(d, locale)

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[18px] font-medium">{org.name}</h1>
              <Badge variant={org.is_active ? "active" : "inactive"}>
                {org.is_active ? "Active" : "Suspended"}
              </Badge>
            </div>
            <p className="text-[14px] text-muted-foreground">{org.slug}</p>
          </div>
        </div>
        <form action={toggleOrgStatus.bind(null, org.id, org.is_active)}>
          <Button
            type="submit"
            variant={org.is_active ? "destructive" : "outline"}
            size="sm"
          >
            {org.is_active ? "Suspend" : "Activate"}
          </Button>
        </form>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Active staff"      value={staffRes.count ?? 0} />
        <StatCard label="Rotas (all time)"  value={rotasRes.count ?? 0} />
        <StatCard label="Rotas (30 days)"   value={recentRotasRes.count ?? 0} />
        <StatCard label="Last login"        value={lastLogin ? fmt(lastLogin) : "Never"} />
      </div>

      {/* Users */}
      <div className="flex flex-col gap-3">
        <h2 className="text-[18px] font-medium">Users</h2>

        <div className="rounded-lg border border-border bg-background overflow-hidden">
          {profiles.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <Users className="size-6 text-muted-foreground" />
              <p className="text-[14px] text-muted-foreground">No users yet</p>
            </div>
          ) : (
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border bg-muted">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {profiles.map((p) => (
                  <tr key={p.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{p.full_name ?? "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.email}</td>
                    <td className="px-4 py-3 text-right">
                      <RemoveUserButton userId={p.id} orgId={id} email={p.email} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
