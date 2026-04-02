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
// AdminHistoryUpload and AdminImplementation moved to implementation tab via AdminOrgDetailClient
import { AdminOrgTabs } from "@/components/admin-org-tabs"
import { AdminBackups } from "@/components/admin-backups"
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
    deptRes, shiftRes, tecnicaRes, assignmentRes, publishedRotasRes, leavesRes, recentRotaListRes,
    rotasByTypeRes,
  ] = await Promise.all([
    admin.from("organisations").select("*").eq("id", id).single(),
    admin.from("staff").select("id", { count: "exact", head: true }).eq("organisation_id", id).eq("onboarding_status", "active"),
    admin.from("rotas").select("id", { count: "exact", head: true }).eq("organisation_id", id),
    admin.from("rotas").select("id", { count: "exact", head: true }).eq("organisation_id", id).gte("created_at", thirtyDaysAgo),
    admin.from("organisation_members").select("user_id, role, display_name, linked_staff_id").eq("organisation_id", id),
    admin.from("lab_config").select("country, region, enable_leave_requests, enable_notes, annual_leave_days").eq("organisation_id", id).maybeSingle(),
    admin.from("departments").select("id", { count: "exact", head: true }).eq("organisation_id", id),
    admin.from("shift_types").select("id", { count: "exact", head: true }).eq("organisation_id", id),
    admin.from("tecnicas").select("id", { count: "exact", head: true }).eq("organisation_id", id),
    admin.from("rota_assignments").select("id", { count: "exact", head: true }).eq("organisation_id", id).limit(1),
    admin.from("rotas").select("id", { count: "exact", head: true }).eq("organisation_id", id).eq("status", "published"),
    admin.from("leaves").select("id", { count: "exact", head: true }).eq("organisation_id", id).eq("status", "approved"),
    admin.from("rotas").select("week_start, status, created_at").eq("organisation_id", id).order("week_start", { ascending: false }).limit(8) as unknown as Promise<{ data: { week_start: string; status: string; created_at: string }[] | null }>,
    admin.from("rotas").select("generation_type").eq("organisation_id", id) as unknown as Promise<{ data: { generation_type: string | null }[] | null }>,
  ])

  // Fetch staff for linking
  const staffListRes = await admin
    .from("staff")
    .select("id, first_name, last_name, role")
    .eq("organisation_id", id)
    .eq("onboarding_status", "active")
    .order("first_name")

  if (!orgRes.data) notFound()

  const org = orgRes.data as Organisation

  // Rota count by generation method
  const rotaTypes = rotasByTypeRes.data ?? []
  const byMethod = {
    template: rotaTypes.filter((r) => r.generation_type === "strict_template" || r.generation_type === "flexible_template").length,
    engine:   rotaTypes.filter((r) => r.generation_type === "ai_optimal" || r.generation_type === "ai_optimal_v2").length,
    hybrid:   rotaTypes.filter((r) => r.generation_type === "ai_hybrid").length,
    blank:    rotaTypes.filter((r) => r.generation_type === "manual" || r.generation_type == null).length,
  }
  const orgStaff = (staffListRes.data ?? []) as { id: string; first_name: string; last_name: string; role: string }[]
  type MemberRecord = { user_id: string; role: string; display_name: string | null; linked_staff_id: string | null }
  const memberRecords = (profilesRes.data ?? []) as MemberRecord[]

  const memberUserIds = memberRecords.map((m) => m.user_id)
  const profilesData = memberUserIds.length > 0
    ? ((await admin.from("profiles").select("id, email, full_name").in("id", memberUserIds)).data ?? []) as { id: string; email: string; full_name: string | null }[]
    : []
  const profileMap = Object.fromEntries(profilesData.map((p) => [p.id, p]))

  const lastLoginByUser: Record<string, string | null> = {}
  let lastLoginOverall: string | null = null
  if (memberUserIds.length > 0) {
    const authResults = await Promise.all(
      memberUserIds.map((uid) => admin.auth.admin.getUserById(uid))
    )
    for (const r of authResults) {
      if (r.data?.user) lastLoginByUser[r.data.user.id] = r.data.user.last_sign_in_at ?? null
    }
    const dates = Object.values(lastLoginByUser).filter(Boolean) as string[]
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
        linkedStaffId: m.linked_staff_id,
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

      <AdminOrgTabs
        estadisticas={
          <div className="flex flex-col gap-5">
            {/* Summary row */}
            <div className="grid grid-cols-3 gap-4 lg:grid-cols-4">
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">Uso</p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Horarios generados</span>
                    <span className="text-[14px] font-semibold">{rotasRes.count ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Publicados</span>
                    <span className="text-[14px] font-semibold">{publishedRotasRes.count ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Últimos 30 días</span>
                    <span className="text-[14px] font-semibold">{recentRotasRes.count ?? 0}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">Equipo</p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Personal activo</span>
                    <span className="text-[14px] font-semibold">{staffRes.count ?? 0}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Usuarios</span>
                    <span className="text-[14px] font-semibold">{memberRecords.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Ausencias aprobadas</span>
                    <span className="text-[14px] font-semibold">{leavesRes.count ?? 0}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">Actividad</p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Último acceso</span>
                    <span className="text-[13px] font-medium">{lastLoginOverall ? fmt(lastLoginOverall) : "Nunca"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Creada</span>
                    <span className="text-[13px] font-medium">{fmt(org.created_at)}</span>
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-border bg-background px-5 py-4 col-span-3 lg:col-span-1">
                <p className="text-[12px] text-muted-foreground font-medium uppercase tracking-wide">Generación</p>
                <div className="mt-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Híbrido</span>
                    <span className="text-[14px] font-semibold text-purple-600">{byMethod.hybrid}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Motor</span>
                    <span className="text-[14px] font-semibold text-blue-600">{byMethod.engine}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Plantilla</span>
                    <span className="text-[14px] font-semibold text-emerald-600">{byMethod.template}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] text-muted-foreground">Vacío / Manual</span>
                    <span className="text-[14px] font-semibold text-muted-foreground">{byMethod.blank}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent rotas table */}
            {(recentRotaListRes.data ?? []).length > 0 && (
              <div className="rounded-lg border border-border bg-background overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border">
                  <p className="text-[13px] font-medium text-muted-foreground">Últimos horarios</p>
                </div>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Semana</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Estado</th>
                      <th className="text-left px-4 py-2 font-medium text-muted-foreground">Creado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(recentRotaListRes.data ?? []).map((r, i) => (
                      <tr key={r.week_start + i} className="border-b border-border last:border-0">
                        <td className="px-4 py-2 font-medium">{fmt(r.week_start)}</td>
                        <td className="px-4 py-2">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                            r.status === "published" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                          )}>
                            {r.status === "published" ? "Publicado" : "Borrador"}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{fmt(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* User activity */}
            <div className="rounded-lg border border-border bg-background overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border">
                <p className="text-[13px] font-medium text-muted-foreground">Actividad de usuarios</p>
              </div>
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Usuario</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Rol</th>
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Último acceso</th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((u) => (
                    <tr key={u.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2">
                        <div>
                          <span className="font-medium">{u.displayName ?? u.email}</span>
                          {u.displayName && <p className="text-[11px] text-muted-foreground">{u.email}</p>}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
                          u.role === "admin" ? "bg-blue-50 text-blue-700"
                            : u.role === "viewer" ? "bg-gray-100 text-gray-600"
                            : "bg-indigo-50 text-indigo-700"
                        )}>
                          {u.role === "admin" ? "Admin" : u.role === "viewer" ? "Viewer" : "Manager"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{u.lastLogin ?? "Nunca"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        }
        funcionalidades={
          <AdminOrgDetailClient
            orgId={id} userRows={userRows} section="funcionalidades"
            initialCountry={(labConfigRes.data as { country?: string } | null)?.country ?? ""}
            initialRegion={(labConfigRes.data as { region?: string } | null)?.region ?? ""}
            initialDisplayMode={(org as { rota_display_mode?: string }).rota_display_mode as "by_shift" | "by_task" ?? "by_shift"}
            initialLeaveRequests={(labConfigRes.data as { enable_leave_requests?: boolean } | null)?.enable_leave_requests ?? false}
            initialEnableNotes={(labConfigRes.data as { enable_notes?: boolean } | null)?.enable_notes ?? true}
            initialEnableTaskInShift={(labConfigRes.data as { enable_task_in_shift?: boolean } | null)?.enable_task_in_shift ?? false}
            initialBilling={{ start: (org as any).billing_start ?? null, end: (org as any).billing_end ?? null, fee: (org as any).billing_fee ?? null }}
            initialAiOptimalVersion={(org as any).ai_optimal_version ?? "v2"}
            initialEngineHybridEnabled={(org as any).engine_hybrid_enabled ?? true}
            initialEngineReasoningEnabled={(org as any).engine_reasoning_enabled ?? false}
            initialTaskOptimalVersion={(org as any).task_optimal_version ?? "v1"}
            initialTaskHybridEnabled={(org as any).task_hybrid_enabled ?? false}
            initialTaskReasoningEnabled={(org as any).task_reasoning_enabled ?? false}
            initialDailyHybridLimit={(org as any).daily_hybrid_limit ?? 10}
          />
        }
        facturacion={
          <AdminOrgDetailClient
            orgId={id} userRows={userRows} section="facturacion"
            initialCountry={(labConfigRes.data as { country?: string } | null)?.country ?? ""}
            initialRegion={(labConfigRes.data as { region?: string } | null)?.region ?? ""}
            initialBilling={{ start: (org as any).billing_start ?? null, end: (org as any).billing_end ?? null, fee: (org as any).billing_fee ?? null }}
          />
        }
        configuracion={
          <AdminOrgDetailClient
            orgId={id} userRows={userRows} section="configuracion" hideUsers
            initialName={org.name}
            initialSlug={org.slug}
            initialLogoUrl={org.logo_url}
            initialCountry={(labConfigRes.data as { country?: string } | null)?.country ?? ""}
            initialRegion={(labConfigRes.data as { region?: string } | null)?.region ?? ""}
            initialAnnualLeaveDays={(labConfigRes.data as { annual_leave_days?: number } | null)?.annual_leave_days ?? 20}
          />
        }
        usuarios={
          <AdminOrgDetailClient
            orgId={id} userRows={userRows} section="usuarios"
            initialCountry={(labConfigRes.data as { country?: string } | null)?.country ?? ""}
            initialRegion={(labConfigRes.data as { region?: string } | null)?.region ?? ""}
            orgStaff={orgStaff}
          />
        }
        implementacion={
          <AdminOrgDetailClient
            orgId={id} userRows={userRows} section="implementacion" hideUsers
            initialCountry={(labConfigRes.data as { country?: string } | null)?.country ?? ""}
            initialRegion={(labConfigRes.data as { region?: string } | null)?.region ?? ""}
            implementationStatus={{
              hasRegion: !!(labConfigRes.data as any)?.country,
              departmentCount: deptRes.count ?? 0,
              shiftCount: shiftRes.count ?? 0,
              taskCount: tecnicaRes.count ?? 0,
              staffCount: staffRes.count ?? 0,
              hasRota: (assignmentRes.count ?? 0) > 0,
              rotaCount: rotasRes.count ?? 0,
            }}
          />
        }
        backups={<AdminBackups orgId={id} />}
      />
    </div>
  )
}
