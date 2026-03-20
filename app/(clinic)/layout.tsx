import { createClient } from "@/lib/supabase/server"
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
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organisation_id")
      .eq("id", user.id)
      .single() as { data: { organisation_id: string | null } | null }
    if (profile?.organisation_id) {
      const { data: org } = await supabase
        .from("organisations")
        .select("name, logo_url")
        .eq("id", profile.organisation_id)
        .single() as { data: { name: string; logo_url: string | null } | null }
      if (org) { orgName = org.name; orgLogoUrl = org.logo_url }
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-muted">
      <ClinicTopBar orgName={orgName} orgLogoUrl={orgLogoUrl} />
      <div className="flex flex-1 overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  )
}
