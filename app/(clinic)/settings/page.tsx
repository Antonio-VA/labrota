import Link from "next/link"
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

          {/* Import link */}
          <Link
            href="/onboarding/import"
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border bg-background hover:bg-accent/50 transition-colors"
          >
            <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium">Importar guardias históricas</p>
              <p className="text-[12px] text-muted-foreground">Sube archivos de guardias anteriores para configurar tu laboratorio automáticamente.</p>
            </div>
          </Link>

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
