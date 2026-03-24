import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { AppSidebar } from "@/components/app-sidebar"
import { ClinicTopBar } from "@/components/clinic-top-bar"
import { RoleProvider } from "@/lib/role-context"

export default async function ClinicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let orgName: string | null = null
  let orgLogoUrl: string | null = null
  let activeOrgId: string | null = null
  let defaultOrgId: string | null = null
  let allOrgs: { id: string; name: string; logo_url: string | null }[] = []
  let userRole: "admin" | "manager" | "viewer" = "admin"

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organisation_id, default_organisation_id")
      .eq("id", user.id)
      .single() as { data: { organisation_id: string | null; default_organisation_id: string | null } | null }

    activeOrgId = profile?.organisation_id ?? null
    defaultOrgId = (profile as { default_organisation_id?: string | null } | null)?.default_organisation_id ?? null

    // Auto-switch to default org only if no active org is set (first login)
    if (defaultOrgId && !activeOrgId) {
      const admin0 = createAdminClient()
      const { data: isMember } = await admin0
        .from("organisation_members")
        .select("id")
        .eq("user_id", user.id)
        .eq("organisation_id", defaultOrgId)
        .single()
      if (isMember) {
        await admin0.from("profiles").update({ organisation_id: defaultOrgId } as never).eq("id", user.id)
        activeOrgId = defaultOrgId
      }
    }

    if (activeOrgId) {
      const { data: org } = await supabase
        .from("organisations")
        .select("name, logo_url, rota_display_mode")
        .eq("id", activeOrgId)
        .single() as { data: { name: string; logo_url: string | null; rota_display_mode?: string } | null }
      if (org) { orgName = org.name; orgLogoUrl = org.logo_url }
    }

    // Fetch all orgs this user belongs to + their role in the active org
    const admin = createAdminClient()
    const { data: memberships } = await admin
      .from("organisation_members")
      .select("organisation_id, role")
      .eq("user_id", user.id) as { data: Array<{ organisation_id: string; role: string }> | null }

    // Get role for active org
    if (memberships && activeOrgId) {
      const activeMembership = memberships.find((m) => m.organisation_id === activeOrgId)
      if (activeMembership?.role === "viewer") userRole = "viewer"
      else if (activeMembership?.role === "manager") userRole = "manager"
    }

    if (memberships && memberships.length > 1) {
      const orgIds = memberships.map((m) => m.organisation_id)
      const { data: orgsData } = await admin
        .from("organisations")
        .select("id, name, logo_url")
        .in("id", orgIds) as { data: Array<{ id: string; name: string; logo_url: string | null }> | null }
      if (orgsData) allOrgs = orgsData
    }
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
      <RoleProvider role={userRole}>
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden bg-background">
            {children}
          </div>
        </div>
      </RoleProvider>
    </div>
  )
}
