import { requireEditor } from "@/lib/require-editor"
import { MobileGate } from "@/components/mobile-gate"
import { OrgUsersTable } from "@/components/org-users-table"
import { AuditLogViewer } from "@/components/audit-log-viewer"
import { SettingsTabs } from "@/components/settings-tabs"
import { getOrgUsers, type OrgUser } from "./actions"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import type { Staff } from "@/lib/types/database"

export default async function SettingsPage() {
  await requireEditor()

  const orgId = await getOrgId()
  let users: OrgUser[] = []
  let staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[] = []
  let orgName = ""

  if (orgId) {
    users = await getOrgUsers()

    const supabase = await createClient()
    const { data: staffData } = await supabase
      .from("staff")
      .select("id, first_name, last_name, role")
      .neq("onboarding_status", "inactive")
      .order("first_name")
    staff = (staffData ?? []) as Pick<Staff, "id" | "first_name" | "last_name" | "role">[]

    const admin = createAdminClient()
    const { data: org } = await admin
      .from("organisations")
      .select("name")
      .eq("id", orgId)
      .single() as { data: { name: string } | null }
    orgName = org?.name ?? ""
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
      <MobileGate>
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-[18px] font-medium">Administración</h1>
            {orgName && (
              <p className="text-[14px] text-muted-foreground mt-0.5">{orgName}</p>
            )}
          </div>

          <SettingsTabs
            usuarios={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <OrgUsersTable initialUsers={users} staff={staff} />
              </div>
            }
            historial={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <AuditLogViewer />
              </div>
            }
          />
        </div>
      </MobileGate>
    </div>
  )
}
