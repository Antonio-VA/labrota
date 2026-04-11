import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import type { Organisation, CompanyLeaveType, HolidayConfig } from "@/lib/types/database"
import { getAdminHrModuleStatus, adminGetHolidayConfig, adminGetCompanyLeaveTypes } from "@/app/admin/hr-module-actions"
import { AdminRrhhPage } from "@/components/admin-rrhh-page"

export default async function OrgRrhhPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: orgData } = await admin.from("organisations").select("id, name, slug").eq("id", id).single()
  if (!orgData) notFound()
  const org = orgData as Pick<Organisation, "id" | "name" | "slug">

  const hrStatus = await getAdminHrModuleStatus(id)
  if (!hrStatus.active) notFound()

  const [config, leaveTypes] = await Promise.all([
    adminGetHolidayConfig(id),
    adminGetCompanyLeaveTypes(id),
  ])

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href={`/orgs/${id}`} />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-medium truncate">{org.name}</h1>
            <span className="text-[13px] text-muted-foreground">· RRHH</span>
          </div>
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
