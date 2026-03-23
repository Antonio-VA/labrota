import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MobileGate } from "@/components/mobile-gate"
import { LeavesList } from "@/components/leaves-list"
import type { LeaveWithStaff, Staff } from "@/lib/types/database"

export default async function LeavesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Determine role and linked staff
  let userRole: "admin" | "manager" | "viewer" = "admin"
  let viewerStaffId: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("organisation_id")
      .eq("id", user.id)
      .single() as { data: { organisation_id: string | null } | null }

    if (profile?.organisation_id) {
      const admin = createAdminClient()
      const { data: membership } = await admin
        .from("organisation_members")
        .select("role")
        .eq("user_id", user.id)
        .eq("organisation_id", profile.organisation_id)
        .single() as { data: { role: string } | null }

      if (membership?.role === "viewer") {
        userRole = "viewer"
        // Find staff record matching this user's email
        const { data: staffMatch } = await supabase
          .from("staff")
          .select("id")
          .eq("email", user.email ?? "")
          .maybeSingle() as { data: { id: string } | null }
        viewerStaffId = staffMatch?.id ?? null
      } else if (membership?.role === "manager") {
        userRole = "manager"
      }
    }
  }

  const [{ data: leavesData }, { data: staffData }] = await Promise.all([
    supabase
      .from("leaves")
      .select("*, staff(id, first_name, last_name, role)")
      .order("start_date", { ascending: false }),
    supabase
      .from("staff")
      .select("*")
      .eq("onboarding_status", "active")
      .order("last_name"),
  ])

  const leaves = (leavesData ?? []) as LeaveWithStaff[]
  const staff  = (staffData  ?? []) as Staff[]

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <LeavesList
            leaves={leaves}
            staff={staff}
            userRole={userRole}
            viewerStaffId={viewerStaffId}
          />
        </MobileGate>
      </div>
    </>
  )
}
