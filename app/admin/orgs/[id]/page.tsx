import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { getLocale } from "next-intl/server"
import { formatDateWithYear } from "@/lib/format-date"
import type { Organisation } from "@/lib/types/database"
import { ArrowLeft, Users, Plus } from "lucide-react"
import { cn } from "@/lib/utils"
import { AdminOrgHeaderActions } from "@/components/admin-org-header-actions"
import { AdminOrgDetailClient } from "@/components/admin-org-detail-client"
import { AdminHistoryUpload } from "@/components/admin-history-upload"
import { AdminImplementation } from "@/components/admin-implementation"
import { AdminOrgTabs } from "@/components/admin-org-tabs"
import { updateOrgRegional } from "@/app/admin/actions"

export default async function OrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()
  const locale = await getLocale() as "es" | "en"
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const [
    orgRes, staffRes, rotasRes, recentRotasRes, profilesRes, labConfigRes,
  ] = await Promise.all([
    admin.from("organisations").select("*").eq("id", id).single(),
    admin.from("staff").select("id", { count: "exact", head: true }).eq("organisation_id", id).eq("onboarding_status", "active"),
    admin.from("rotas").select("id", { count: "exact", head: true }).eq("organisation_id", id),
    admin.from("rotas").select("id", { count: "exact", head: true }).eq("organisation_id", id).gte("created_at", thirtyDaysAgo),
    admin.from("organisation_members").select("user_id, role, display_name").eq("organisation_id", id),
    admin.from("lab_config").select("country, region").eq("organisation_id", id).maybeSingle(),
  ])

  if (!orgRes.data) notFound()

  const org = orgRes.data as Organisation
  type MemberRecord = { user_id: string; role: string; display_name: string | null }
  const memberRecords = (profilesRes.data ?? []) as MemberRecord[]

  const memberUserIds = memberRecords.map((m) => m.user_id)
  const profilesData = memberUserIds.length > 0
    ? ((await admin.from("profiles").select("id, email, full_name").in("id", memberUserIds)).data ?? []) as { id: string; email: string; full_name: string | null }[]
    : []
  const profileMap = Object.fromEntries(profilesData.map((p) => [p.id, p]))

  const lastLoginByUser: Record<string, string | null> = {}
  let lastLoginOverall: string | null = null
  if (memberUserIds.length > 0) {
    const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const memberSet = new Set(memberUserIds)
    const orgAuthUsers = (authData?.users ?? []).filter((u) => memberSet.has(u.id))
    for (const u of orgAuthUsers) lastLoginByUser[u.id] = u.last_sign_in_at ?? null
    const dates = orgAuthUsers.map((u) => u.last_sign_in_at).filter(Boolean) as string[]
    lastLoginOverall = dates.sort().at(-1) ?? null
  }

  const fmt = (d: string) => formatDateWithYear(d, locale)

  const userRows = memberRecords
    .filter((m) => profileMap[m.user_id])
    .map((m) => {
      const profile = profileMap[m.user_id]
      return {
        id: profile.id,
        email: profile.email,
        displayName: m.display_name ?? profile.full_name,
        orgId: id,
        role: m.role,
        lastLogin: lastLoginByUser[profile.id] ? fmt(lastLoginByUser[profile.id]!) : null,
      }
    })

  // Org initials
  const initials = org.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <AdminOrgHeaderActions org={org} />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Personal activo", value: String(staffRes.count ?? 0), isNumber: true },
          { label: "Horarios (total)", value: String(rotasRes.count ?? 0), isNumber: true },
          { label: "Horarios (30 días)", value: String(recentRotasRes.count ?? 0), isNumber: true },
          { label: "Último acceso", value: lastLoginOverall ? fmt(lastLoginOverall) : "Nunca", isNumber: false },
        ].map((kpi) => (
          <div key={kpi.label} className="rounded-xl border border-border/60 bg-background px-4 py-3">
            <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">{kpi.label}</p>
            <p className={cn("mt-0.5 leading-tight", kpi.isNumber ? "text-[22px] font-semibold text-foreground" : "text-[14px] font-medium text-foreground")}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <AdminOrgTabs
        configuration={
          <AdminOrgDetailClient
            orgId={id}
            userRows={userRows}
            initialCountry={(labConfigRes.data as { country?: string } | null)?.country ?? ""}
            initialRegion={(labConfigRes.data as { region?: string } | null)?.region ?? ""}
            initialDisplayMode={(org as { rota_display_mode?: string }).rota_display_mode as "by_shift" | "by_task" ?? "by_shift"}
            initialLeaveRequests={(labConfigRes.data as { enable_leave_requests?: boolean } | null)?.enable_leave_requests ?? false}
            initialBilling={{
              start: (org as any).billing_start ?? null,
              end: (org as any).billing_end ?? null,
              fee: (org as any).billing_fee ?? null,
            }}
          />
        }
        defaults={
          <div className="flex flex-col gap-6">
            <AdminHistoryUpload orgId={id} />
            <div className="rounded-xl border border-border/60 bg-background px-5 py-4">
              <AdminImplementation orgId={id} />
            </div>
          </div>
        }
      />
    </div>
  )
}
