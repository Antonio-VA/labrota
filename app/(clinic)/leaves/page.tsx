import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { MobileGate } from "@/components/mobile-gate"
import { LeavesList } from "@/components/leaves-list"
import type { LeaveWithStaff, Staff } from "@/lib/types/database"

export default async function LeavesPage() {
  const supabase = await createClient()
  const t = await getTranslations("leaves")

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
      <header className="h-12 shrink-0 flex items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="h-4" />
        <span className="text-[14px] font-medium text-muted-foreground">{t("title")}</span>
      </header>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <LeavesList leaves={leaves} staff={staff} />
        </MobileGate>
      </div>
    </>
  )
}
