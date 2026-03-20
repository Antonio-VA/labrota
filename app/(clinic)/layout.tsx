import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { AppSidebar } from "@/components/app-sidebar"
import { ClinicTopBar } from "@/components/clinic-top-bar"

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
  let allOrgs: { id: string; name: string; logo_url: string | null }[] = []

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organisation_id")
      .eq("id", user.id)
      .single() as { data: { organisation_id: string | null } | null }

    activeOrgId = profile?.organisation_id ?? null

    if (activeOrgId) {
      const { data: org } = await supabase
        .from("organisations")
        .select("name, logo_url")
        .eq("id", activeOrgId)
        .single() as { data: { name: string; logo_url: string | null } | null }
      if (org) { orgName = org.name; orgLogoUrl = org.logo_url }
    }

    // Fetch all orgs this user belongs to (via organisation_members)
    const admin = createAdminClient()
    const { data: memberships } = await admin
      .from("organisation_members")
      .select("organisation_id")
      .eq("user_id", user.id) as { data: Array<{ organisation_id: string }> | null }

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
    <div className="flex flex-col h-screen overflow-hidden bg-muted">
      <ClinicTopBar
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
        allOrgs={allOrgs}
        activeOrgId={activeOrgId}
      />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
