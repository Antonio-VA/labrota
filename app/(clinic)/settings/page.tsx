import dynamic from "next/dynamic"
import { requireEditor } from "@/lib/require-editor"
import { MobileGate } from "@/components/mobile-gate"
import { SettingsTabs } from "@/components/settings-tabs"
import { CardSkeleton } from "@/components/ui/skeleton"

const TabSkeleton = () => <div className="rounded-lg border border-border bg-background px-5 py-4"><CardSkeleton /></div>

const OrgUsersTable = dynamic(() => import("@/components/org-users-table").then((m) => m.OrgUsersTable), { loading: TabSkeleton })
const OrgSettingsForm = dynamic(() => import("@/components/org-settings-form").then((m) => m.OrgSettingsForm), { loading: TabSkeleton })
const SettingsImplementation = dynamic(() => import("@/components/settings-implementation").then((m) => m.SettingsImplementation), { loading: TabSkeleton })
const AuditLogViewer = dynamic(() => import("@/components/audit-log-viewer").then((m) => m.AuditLogViewer), { loading: TabSkeleton })
const SettingsFuncionalidades = dynamic(() => import("@/components/settings-funcionalidades").then((m) => m.SettingsFuncionalidades), { loading: TabSkeleton })
const SettingsFacturacion = dynamic(() => import("@/components/settings-facturacion").then((m) => m.SettingsFacturacion), { loading: TabSkeleton })
const SettingsNotifications = dynamic(() => import("@/components/settings-notifications").then((m) => m.SettingsNotifications), { loading: TabSkeleton })
import { getOrgUsers, getOrgSettings, getOrgId, type OrgUser } from "./actions"
import { getStepCompletions, syncStepCompletions, type StepCompletion } from "./implementation-actions"
import { getPublishRecipients, getRotaEmailFormat } from "@/app/(clinic)/notifications-actions"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getAuthUser } from "@/lib/auth-cache"
import { getTranslations } from "next-intl/server"
import type { Staff } from "@/lib/types/database"

export default async function SettingsPage() {
  await requireEditor()
  const t = await getTranslations("settings")

  const orgId = await getOrgId()
  let users: OrgUser[] = []
  let staff: Pick<Staff, "id" | "first_name" | "last_name" | "role">[] = []
  let orgSettings: Awaited<ReturnType<typeof getOrgSettings>> = null

  // Implementation counts + step completions
  let implStatus = { departmentCount: 0, shiftCount: 0, taskCount: 0, staffCount: 0, hasRota: false, rotaCount: 0, hasRegion: false }
  let stepCompletions: Record<string, StepCompletion> = {}
  let isAdmin = false
  let notificationRecipients: Awaited<ReturnType<typeof getPublishRecipients>> = []
  let emailFormat: "by_shift" | "by_person" = "by_shift"

  if (orgId) {
    const supabase = await createClient()
    const [usersData, settingsData, staffRes, deptRes, shiftRes, tecRes, rotaRes] = await Promise.all([
      getOrgUsers(),
      getOrgSettings(),
      supabase.from("staff").select("id, first_name, last_name, role").neq("onboarding_status", "inactive").order("first_name"),
      supabase.from("departments").select("id", { count: "exact", head: true }),
      supabase.from("shift_types").select("id", { count: "exact", head: true }),
      supabase.from("tecnicas").select("id", { count: "exact", head: true }),
      supabase.from("rotas").select("id", { count: "exact", head: true }),
    ])
    users = usersData
    orgSettings = settingsData
    staff = (staffRes.data ?? []) as Pick<Staff, "id" | "first_name" | "last_name" | "role">[]
    implStatus = {
      departmentCount: deptRes.count ?? 0,
      shiftCount: shiftRes.count ?? 0,
      taskCount: tecRes.count ?? 0,
      staffCount: staff.length,
      hasRota: (rotaRes.count ?? 0) > 0,
      rotaCount: rotaRes.count ?? 0,
      hasRegion: !!orgSettings?.country,
    }

    // Check if user is admin
    const authUser = await getAuthUser()
    if (authUser) {
      const adminClient = createAdminClient()
      const { data: membership } = await adminClient
        .from("organisation_members")
        .select("role")
        .eq("user_id", authUser.id)
        .eq("organisation_id", orgId)
        .single() as { data: { role: string } | null }
      isAdmin = membership?.role === "admin" || membership?.role === "manager"
    }

    // Sync step completions (records newly completed steps) then fetch all
    await syncStepCompletions()
    stepCompletions = await getStepCompletions()

    // Fetch notification recipients (admin only)
    if (isAdmin) {
      try {
        const [recipients, fmt] = await Promise.all([getPublishRecipients(), getRotaEmailFormat()])
        notificationRecipients = recipients
        emailFormat = fmt
      } catch { /* non-admin */ }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 md:p-8" style={{ scrollbarGutter: "stable" }}>
      <MobileGate>
        <div className="w-full max-w-4xl mx-auto flex flex-col gap-6">
          <div>
            <h1 className="text-[18px] font-medium">{t("pageTitle")}</h1>
          </div>

          <SettingsTabs
            organizacion={
              orgSettings ? (
                <div className="rounded-lg border border-border bg-background px-5 py-4">
                  <OrgSettingsForm settings={orgSettings} orgId={orgId!} />
                </div>
              ) : (
                <p className="text-[14px] text-muted-foreground">{t("orgNotFound")}</p>
              )
            }
            funcionalidades={
              orgSettings ? (
                <SettingsFuncionalidades
                  displayMode={orgSettings.displayMode}
                  enableLeaveRequests={orgSettings.enableLeaveRequests}
                  enableSwapRequests={orgSettings.enableSwapRequests}
                  enableOutlookSync={orgSettings.enableOutlookSync}
                  enableNotes={orgSettings.enableNotes}
                  enableTaskInShift={orgSettings.enableTaskInShift}
                />
              ) : null
            }
            facturacion={
              orgSettings ? (
                <SettingsFacturacion
                  billingStart={orgSettings.billingStart}
                  billingEnd={orgSettings.billingEnd}
                  billingFee={orgSettings.billingFee}
                />
              ) : null
            }
            usuarios={
              <div className="rounded-lg border border-border bg-background px-5 py-4">
                <OrgUsersTable initialUsers={users} staff={staff} />
              </div>
            }
            notificaciones={
              isAdmin ? (
                <SettingsNotifications initialRecipients={notificationRecipients} initialEmailFormat={emailFormat} displayMode={orgSettings?.displayMode ?? "by_shift"} />
              ) : undefined
            }
            implementacion={
              <SettingsImplementation status={implStatus} stepCompletions={stepCompletions} />
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
