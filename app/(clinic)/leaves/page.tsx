import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser, getCachedOrgId } from "@/lib/auth-cache"
import { LeavesList } from "@/components/leaves-list"
import type { LeaveWithStaff, Staff } from "@/lib/types/database"

type OrgMember = { role: string; linked_staff_id: string | null }
type LabConfigData = { enable_leave_requests: boolean; enable_outlook_sync: boolean }

export default async function LeavesPage() {
  const [user, orgId] = await Promise.all([getAuthUser(), getCachedOrgId()])

  let userRole: "admin" | "manager" | "viewer" = "admin"
  let viewerStaffId: string | null = null
  let enableLeaveRequests = false
  let enableOutlookSync = false

  if (user && orgId) {
    const admin = createAdminClient()
    const [memberRes, labConfigRes] = await Promise.all([
      admin
        .from("organisation_members")
        .select("role, linked_staff_id")
        .eq("user_id", user.id)
        .eq("organisation_id", orgId)
        .single() as unknown as Promise<{ data: OrgMember | null }>,
      admin
        .from("lab_config")
        .select("enable_leave_requests, enable_outlook_sync")
        .eq("organisation_id", orgId)
        .maybeSingle() as unknown as Promise<{ data: LabConfigData | null }>,
    ])

    enableLeaveRequests = labConfigRes.data?.enable_leave_requests ?? false
    enableOutlookSync = labConfigRes.data?.enable_outlook_sync ?? false

    if (memberRes.data?.role === "viewer") {
      userRole = "viewer"
      if (memberRes.data.linked_staff_id) {
        viewerStaffId = memberRes.data.linked_staff_id
      } else {
        const supabase = await createClient()
        const { data: staffMatch } = await supabase
          .from("staff")
          .select("id")
          .eq("email", user.email ?? "")
          .maybeSingle() as { data: { id: string } | null }
        viewerStaffId = staffMatch?.id ?? null
      }
    } else if (memberRes.data?.role === "manager") {
      userRole = "manager"
    }
  }

  // Use admin client for viewers (RLS may block their reads)
  const queryClient = userRole === "viewer" ? createAdminClient() : await createClient()

  // Fetch leaves + staff + reviewer data in parallel
  const [{ data: leavesData }, { data: staffData }] = await Promise.all([
    queryClient
      .from("leaves")
      .select("*, staff(id, first_name, last_name, role)")
      .eq("organisation_id", orgId!)
      .order("start_date", { ascending: false }),
    queryClient
      .from("staff")
      .select("*")
      .eq("organisation_id", orgId!)
      .eq("onboarding_status", "active")
      .order("last_name"),
  ])

  const rawLeaves = (leavesData ?? []) as LeaveWithStaff[]
  const staff  = (staffData  ?? []) as Staff[]

  // Resolve reviewer names for leaves that have reviewed_by
  const reviewerIds = [...new Set(rawLeaves.map((l) => l.reviewed_by).filter(Boolean))] as string[]
  let reviewerMap: Record<string, string> = {}
  if (reviewerIds.length > 0 && orgId) {
    const adminClient = createAdminClient()
    // Fetch profiles + member display names in parallel
    const [{ data: reviewerProfiles }, { data: memberNames }] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id, full_name")
        .in("id", reviewerIds) as unknown as Promise<{ data: Array<{ id: string; full_name: string | null }> | null }>,
      adminClient
        .from("organisation_members")
        .select("user_id, display_name")
        .eq("organisation_id", orgId!)
        .in("user_id", reviewerIds) as unknown as Promise<{ data: Array<{ user_id: string; display_name: string | null }> | null }>,
    ])
    const memberNameMap = Object.fromEntries((memberNames ?? []).map((m) => [m.user_id, m.display_name]))
    reviewerMap = Object.fromEntries(
      (reviewerProfiles ?? []).map((p) => [p.id, memberNameMap[p.id] ?? p.full_name ?? "Manager"])
    )
  }

  const leaves = rawLeaves.map((l) => ({
    ...l,
    reviewer_name: l.reviewed_by ? reviewerMap[l.reviewed_by] ?? null : null,
  }))

  return (
    <div className="flex-1 overflow-auto p-4 md:p-8">
      <LeavesList
        leaves={leaves}
        staff={staff}
        userRole={userRole}
        viewerStaffId={viewerStaffId}
        enableLeaveRequests={enableLeaveRequests}
        enableOutlookSync={enableOutlookSync}
        orgId={orgId ?? undefined}
      />
    </div>
  )
}
