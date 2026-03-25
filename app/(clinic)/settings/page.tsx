import { requireEditor } from "@/lib/require-editor"
import { MobileGate } from "@/components/mobile-gate"
import { OrgUsersTable } from "@/components/org-users-table"
import { OrgSettingsForm } from "@/components/org-settings-form"
import { AuditLogViewer } from "@/components/audit-log-viewer"
import { SettingsTabs } from "@/components/settings-tabs"
import { getOrgUsers, getOrgSettings, getOrgId, type OrgUser } from "./actions"
import { createClient } from "@/lib/supabase/server"
import type { Staff } from "@/lib/types/database"

export default async function SettingsPage() {
  await requireEditor()

  const orgId = await getOrgId()
  let users: OrgUser[] = []
  let staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[] = []
  let orgSettings: Awaited<ReturnType<typeof getOrgSettings>> = null

  if (orgId) {
    const [usersData, settingsData] = await Promise.all([
      getOrgUsers(),
      getOrgSettings(),
    ])
    users = usersData
    orgSettings = settingsData

    const supabase = await createClient()
    const { data: staffData } = await supabase
      .from("staff")
      .select("id, first_name, last_name, role")
      .neq("onboarding_status", "inactive")
      .order("first_name")
    staff = (staffData ?? []) as Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8">
      <MobileGate>
        <div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-[18px] font-medium">Administración</h1>
          </div>

          <SettingsTabs
            organizacion={
              orgSettings ? (
                <div className="rounded-lg border border-border bg-background px-5 py-4">
                  <OrgSettingsForm settings={orgSettings} orgId={orgId!} />
                </div>
              ) : (
                <p className="text-[14px] text-muted-foreground">No se encontró la organización.</p>
              )
            }
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
