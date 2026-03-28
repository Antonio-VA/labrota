import Link from "next/link"
import { getLocale } from "next-intl/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
// formatDateWithYear moved into AdminOrgTable client component
import { Plus, Building2 } from "lucide-react"
import type { Organisation } from "@/lib/types/database"
import { AdminOrgTable } from "@/components/admin-org-table"

async function fetchOrgStats(admin: ReturnType<typeof createAdminClient>, orgId: string) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const [staffRes, rotasRes, recentRotasRes, profilesRes] = await Promise.all([
    admin.from("staff").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).eq("onboarding_status", "active"),
    admin.from("rotas").select("id", { count: "exact", head: true }).eq("organisation_id", orgId),
    admin.from("rotas").select("id", { count: "exact", head: true }).eq("organisation_id", orgId).gte("created_at", thirtyDaysAgo),
    admin.from("profiles").select("id").eq("organisation_id", orgId),
  ])
  return {
    activeStaff: staffRes.count ?? 0,
    totalRotas: rotasRes.count ?? 0,
    recentRotas: recentRotasRes.count ?? 0,
    profileIds: ((profilesRes.data ?? []) as { id: string }[]).map((p) => p.id),
  }
}

async function fetchLastLogin(admin: ReturnType<typeof createAdminClient>, profileIds: string[]): Promise<string | null> {
  if (profileIds.length === 0) return null
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (!data) return null
  const orgUsers = data.users.filter((u) => profileIds.includes(u.id))
  const dates = orgUsers.map((u) => u.last_sign_in_at).filter(Boolean) as string[]
  return dates.sort().at(-1) ?? null
}

export default async function AdminPage() {
  const admin = createAdminClient()
  const locale = await getLocale() as "es" | "en"

  const { data: orgs } = await admin.from("organisations").select("*").order("created_at", { ascending: false })
  const allOrgs: Organisation[] = (orgs as Organisation[] | null) ?? []

  const statsArr = await Promise.all(allOrgs.map((org) => fetchOrgStats(admin, org.id)))
  const lastLogins = await Promise.all(statsArr.map(({ profileIds }) => fetchLastLogin(admin, profileIds)))

  const rows = allOrgs.map((org, i) => ({
    id: org.id,
    name: org.name,
    slug: org.slug,
    is_active: org.is_active,
    logo_url: org.logo_url,
    created_at: org.created_at,
    activeStaff: statsArr[i].activeStaff,
    totalRotas: statsArr[i].totalRotas,
    recentRotas: statsArr[i].recentRotas,
    lastLogin: lastLogins[i],
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[18px] font-medium">Organisations</h1>
        <Button render={<Link href="/admin/orgs/new" />}>
          <Plus />
          New organisation
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-background flex flex-col items-center gap-3 py-16 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <p className="text-[14px] font-medium">No organisations yet</p>
          <p className="text-[14px] text-muted-foreground">Create your first clinic to get started.</p>
        </div>
      ) : (
        <AdminOrgTable rows={rows} locale={locale} />
      )}
    </div>
  )
}
