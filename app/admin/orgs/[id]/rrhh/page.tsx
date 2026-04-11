import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import type { Organisation } from "@/lib/types/database"
import { getAdminHrModuleStatus, adminGetHolidayConfig, adminGetCompanyLeaveTypes } from "@/app/admin/hr-module-actions"
import { AdminRrhhPage } from "@/components/admin-rrhh-page"
import { AdminOrgHeaderActions } from "@/components/admin-org-header-actions"

export default async function OrgRrhhPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: orgData } = await admin.from("organisations").select("id, name, slug, is_active, logo_url").eq("id", id).single()
  if (!orgData) notFound()
  const org = orgData as { id: string; name: string; slug: string; is_active: boolean; logo_url: string | null }

  const hrStatus = await getAdminHrModuleStatus(id)
  if (!hrStatus.active) notFound()

  const [config, leaveTypes] = await Promise.all([
    adminGetHolidayConfig(id),
    adminGetCompanyLeaveTypes(id),
  ])

  return (
    <div className="flex flex-col gap-6">
      {/* Header — same component as org detail, with RRHH active */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <AdminOrgHeaderActions org={org} hrActive={true} activeModule="rrhh" />
        </div>
      </div>

      <AdminRrhhPage
        orgId={id}
        config={config}
        leaveTypes={leaveTypes}
      />
    </div>
  )
}
