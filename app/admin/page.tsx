import Link from "next/link"
import { getLocale } from "next-intl/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toggleOrgStatus } from "@/app/admin/actions"
import { formatDateWithYear } from "@/lib/format-date"
import { Plus, Building2 } from "lucide-react"
import type { Organisation } from "@/lib/types/database"

// ── Per-org stats ─────────────────────────────────────────────────────────────
async function fetchOrgStats(admin: ReturnType<typeof createAdminClient>, orgId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [staffRes, rotasRes, recentRotasRes, profilesRes] = await Promise.all([
    admin
      .from("staff")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("onboarding_status", "active"),
    admin
      .from("rotas")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId),
    admin
      .from("rotas")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .gte("created_at", thirtyDaysAgo),
    admin
      .from("profiles")
      .select("id")
      .eq("organisation_id", orgId),
  ])

  return {
    activeStaff:  staffRes.count  ?? 0,
    totalRotas:   rotasRes.count  ?? 0,
    recentRotas:  recentRotasRes.count ?? 0,
    profileIds:   ((profilesRes.data ?? []) as { id: string }[]).map((p) => p.id),
  }
}

// ── Last login across all org users ───────────────────────────────────────────
async function fetchLastLogin(
  admin: ReturnType<typeof createAdminClient>,
  profileIds: string[]
): Promise<string | null> {
  if (profileIds.length === 0) return null

  // Fetch all users and find the most recent sign-in for this org
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (!data) return null

  const orgUsers = data.users.filter((u) => profileIds.includes(u.id))
  const dates = orgUsers
    .map((u) => u.last_sign_in_at)
    .filter(Boolean) as string[]

  if (dates.length === 0) return null
  return dates.sort().at(-1) ?? null
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default async function AdminPage() {
  const admin = createAdminClient()
  const locale = await getLocale() as "es" | "en"

  const { data: orgs } = await admin
    .from("organisations")
    .select("*")
    .order("created_at", { ascending: false })

  const allOrgs: Organisation[] = (orgs as Organisation[] | null) ?? []

  // Fetch stats for all orgs in parallel
  const statsArr = await Promise.all(allOrgs.map((org) => fetchOrgStats(admin, (org as Organisation).id)))

  // Fetch last logins in parallel
  const lastLogins = await Promise.all(
    statsArr.map(({ profileIds }) => fetchLastLogin(admin, profileIds))
  )

  const rows = allOrgs.map((org, i) => ({
    org,
    stats: statsArr[i],
    lastLogin: lastLogins[i],
  }))

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-medium">Organisations</h1>
        <Button size="sm" className="rounded-lg" render={<Link href="/admin/orgs/new" />}>
          <Plus />
          New organisation
        </Button>
      </div>

      {/* Table */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-background flex flex-col items-center gap-3 py-16 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <p className="text-[14px] font-medium">No organisations yet</p>
          <p className="text-[14px] text-muted-foreground">Create your first clinic to get started.</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background overflow-hidden">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Organisation</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Active staff</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rotas (all)</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Rotas (30d)</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last login</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ org, stats, lastLogin }) => (
                <tr key={org.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="px-4 py-3">
                    <Link
                      href={`/admin/orgs/${org.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {org.name}
                    </Link>
                    <p className="text-muted-foreground text-[13px]">{org.slug}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={org.is_active ? "active" : "inactive"}>
                      {org.is_active ? "Active" : "Suspended"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.activeStaff}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.totalRotas}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{stats.recentRotas}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {lastLogin ? formatDateWithYear(lastLogin, locale) : "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {formatDateWithYear(org.created_at, locale)}
                  </td>
                  <td className="px-4 py-3">
                    <form action={toggleOrgStatus.bind(null, org.id, org.is_active)}>
                      <button
                        type="submit"
                        className="text-[14px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline whitespace-nowrap"
                      >
                        {org.is_active ? "Suspend" : "Activate"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
