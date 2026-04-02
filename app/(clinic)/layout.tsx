export const maxDuration = 120 // Allow up to 2min for AI rota generation

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser } from "@/lib/auth-cache"
import { AppSidebar } from "@/components/app-sidebar"
import { ClinicTopBar } from "@/components/clinic-top-bar"
import { MobileHeader } from "@/components/mobile-header"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { RoleProvider } from "@/lib/role-context"

export default async function ClinicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const user = await getAuthUser()

  let orgName: string | null = null
  let orgLogoUrl: string | null = null
  let activeOrgId: string | null = null
  let defaultOrgId: string | null = null
  let allOrgs: { id: string; name: string; logo_url: string | null }[] = []
  let userRole: "admin" | "manager" | "viewer" = "admin"
  let viewerStaffId: string | null = null

  if (user) {
    // ── Round 1: profile + memberships in parallel (no dependency between them) ──
    const admin = createAdminClient()
    const [{ data: profile }, { data: memberships }] = await Promise.all([
      supabase
        .from("profiles")
        .select("organisation_id, default_organisation_id, preferences")
        .eq("id", user.id)
        .single() as unknown as Promise<{ data: { organisation_id: string | null; default_organisation_id: string | null; preferences?: { locale?: string } } | null }>,
      admin
        .from("organisation_members")
        .select("organisation_id, role, linked_staff_id")
        .eq("user_id", user.id) as unknown as Promise<{ data: Array<{ organisation_id: string; role: string; linked_staff_id: string | null }> | null }>,
    ])

    activeOrgId = profile?.organisation_id ?? null
    defaultOrgId = (profile as { default_organisation_id?: string | null } | null)?.default_organisation_id ?? null

    // Auto-switch to default org only if no active org is set (first login)
    if (defaultOrgId && !activeOrgId) {
      const isMember = memberships?.some((m) => m.organisation_id === defaultOrgId)
      if (isMember) {
        await admin.from("profiles").update({ organisation_id: defaultOrgId } as never).eq("id", user.id)
        activeOrgId = defaultOrgId
      }
    }

    // Get role for active org
    if (memberships && activeOrgId) {
      const activeMembership = memberships.find((m) => m.organisation_id === activeOrgId)
      if (activeMembership?.role === "viewer") userRole = "viewer"
      else if (activeMembership?.role === "manager") userRole = "manager"
    }

    // ── Round 2: org details + multi-org list + viewer staff (all depend on activeOrgId) ──
    const round2: PromiseLike<unknown>[] = []

    // Org name/logo
    if (activeOrgId) {
      round2.push(
        supabase
          .from("organisations")
          .select("name, logo_url, rota_display_mode")
          .eq("id", activeOrgId)
          .single()
          .then(({ data: org }) => {
            const o = org as { name: string; logo_url: string | null } | null
            if (o) { orgName = o.name; orgLogoUrl = o.logo_url }
          })
      )
    }

    // Multi-org list
    if (memberships && memberships.length > 1) {
      const orgIds = memberships.map((m) => m.organisation_id)
      round2.push(
        admin
          .from("organisations")
          .select("id, name, logo_url")
          .in("id", orgIds)
          .then(({ data: orgsData }) => {
            if (orgsData) allOrgs = orgsData as typeof allOrgs
          })
      )
    }

    // Resolve viewer's staff_id
    if (userRole === "viewer" && activeOrgId) {
      const activeMembership = memberships?.find((m) => m.organisation_id === activeOrgId)
      if (activeMembership?.linked_staff_id) {
        viewerStaffId = activeMembership.linked_staff_id
      } else if (user.email) {
        round2.push(
          admin
            .from("staff")
            .select("id")
            .eq("organisation_id", activeOrgId)
            .eq("email", user.email)
            .neq("onboarding_status", "inactive")
            .maybeSingle()
            .then(({ data: staffMatch }) => {
              viewerStaffId = (staffMatch as { id: string } | null)?.id ?? null
            })
        )
      }
    }

    if (round2.length > 0) await Promise.all(round2)
  }

  return (
    <div className="flex flex-col h-dvh overflow-hidden bg-muted">
      <ClinicTopBar
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
        allOrgs={allOrgs}
        activeOrgId={activeOrgId}
        defaultOrgId={defaultOrgId}
        initialUser={user ? { email: user.email ?? null, fullName: (user.user_metadata?.full_name as string) ?? null, avatarUrl: (user.user_metadata?.avatar_url as string) ?? null } : null}
      />
      <RoleProvider role={userRole} staffId={viewerStaffId}>
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-background lg:pb-0">
            <MobileHeader
              orgName={orgName}
              orgLogoUrl={orgLogoUrl}
              allOrgs={allOrgs}
              activeOrgId={activeOrgId}
              defaultOrgId={defaultOrgId}
            />
            {children}
          </div>
        </div>
        <MobileBottomNav />
      </RoleProvider>
    </div>
  )
}
