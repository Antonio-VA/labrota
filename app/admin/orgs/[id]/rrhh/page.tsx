import { notFound } from "next/navigation"
import Link from "next/link"
import { createAdminClient } from "@/lib/supabase/admin"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft } from "lucide-react"
import type { Organisation } from "@/lib/types/database"
import { getAdminHrModuleStatus, adminGetHolidayConfig, adminGetCompanyLeaveTypes } from "@/app/admin/hr-module-actions"
import { AdminRrhhPage } from "@/components/admin-rrhh-page"
import { AdminModuleSwitcher } from "@/components/admin-module-switcher"

export default async function OrgRrhhPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const admin = createAdminClient()

  const { data: orgData } = await admin.from("organisations").select("id, name, slug, is_active").eq("id", id).single()
  if (!orgData) notFound()
  const org = orgData as Pick<Organisation, "id" | "name" | "slug" | "is_active">

  const hrStatus = await getAdminHrModuleStatus(id)
  if (!hrStatus.active) notFound()

  const [config, leaveTypes] = await Promise.all([
    adminGetHolidayConfig(id),
    adminGetCompanyLeaveTypes(id),
  ])

  return (
    <div className="flex flex-col gap-6">
      {/* Header — same pattern as org detail */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon-sm" render={<Link href="/" />}>
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h1 className="text-[18px] font-medium truncate">{org.name}</h1>
          <Badge variant={org.is_active ? "active" : "inactive"}>
            {org.is_active ? "Activa" : "Suspendida"}
          </Badge>
        </div>
        <AdminModuleSwitcher orgId={id} active="rrhh" hrActive={true} />
      </div>

      <AdminRrhhPage
        orgId={id}
        config={config}
        leaveTypes={leaveTypes}
      />
    </div>
  )
}
