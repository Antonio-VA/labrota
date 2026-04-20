export const maxDuration = 120 // Allow up to 2min for AI rota generation

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser } from "@/lib/auth-cache"
import { AppSidebar } from "@/components/app-sidebar"
import { ClinicTopBar } from "@/components/clinic-top-bar"
import { MobileHeader } from "@/components/mobile-header"
import { MobileBottomNav } from "@/components/mobile-bottom-nav"
import { LayoutChatWrapper } from "@/components/layout-chat-wrapper"
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

    defaultOrgId = (profile as { default_organisation_id?: string | null } | null)?.default_organisation_id ?? null

    // Priority: cookie (device-local) > DB profile > default org
    // Cookie prevents cross-device org mixing — each device remembers its own active org
    const cookieStore = await cookies()
    const cookieOrgId = cookieStore.get("labrota_active_org")?.value ?? null

    if (cookieOrgId && memberships?.some((m) => m.organisation_id === cookieOrgId)) {
      // Cookie org is valid — use it (even if DB says something different from another device)
      activeOrgId = cookieOrgId
      // Sync DB if out of sync — must be awaited so RLS auth_organisation_id() matches before any RLS query
      if (profile?.organisation_id !== cookieOrgId) {
        await admin.from("profiles").update({ organisation_id: cookieOrgId } as never).eq("id", user.id)
      }
    } else if (profile?.organisation_id && memberships?.some((m) => m.organisation_id === profile.organisation_id)) {
      // Fall back to DB profile org
      activeOrgId = profile.organisation_id
    } else if (defaultOrgId && memberships?.some((m) => m.organisation_id === defaultOrgId)) {
      // Fall back to default org (first login)
      activeOrgId = defaultOrgId
    } else if (memberships?.length) {
      // Last resort: first membership
      activeOrgId = memberships[0].organisation_id
    } else {
      activeOrgId = null
    }

    // Get role for active org
    if (memberships && activeOrgId) {
      const activeMembership = memberships.find((m) => m.organisation_id === activeOrgId)
      if (activeMembership?.role === "viewer") userRole = "viewer"
      else if (activeMembership?.role === "manager") userRole = "manager"
    }

    // ── Round 2: org details + multi-org list + viewer staff (all depend on activeOrgId) ──
    const round2: PromiseLike<unknown>[] = []

    // Org name/logo — use admin client to avoid RLS mismatch when
    // cookie-based activeOrgId differs from profiles.organisation_id
    if (activeOrgId) {
      round2.push(
        admin
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

    // Resolve staff_id — for viewers always, for managers/admins when linked
    if (activeOrgId) {
      const activeMembership = memberships?.find((m) => m.organisation_id === activeOrgId)
      if (activeMembership?.linked_staff_id) {
        viewerStaffId = activeMembership.linked_staff_id
      } else if (userRole === "viewer" && user.email) {
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

    // Guard: authenticated user with no org membership cannot access the clinic app
    if (!activeOrgId || !memberships?.length) {
      redirect("/login?error=no_access")
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
            <LayoutChatWrapper>
              {children}
            </LayoutChatWrapper>
          </div>
        </div>
        <MobileBottomNav />
      </RoleProvider>
    </div>
  )
}
