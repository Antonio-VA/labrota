import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
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
      <header className="h-12 shrink-0 flex items-center gap-4 border-b px-6">
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
