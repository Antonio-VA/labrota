import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffList } from "@/components/staff-list"
import type { StaffWithSkills } from "@/lib/types/database"

export default async function StaffPage() {
  const supabase = await createClient()
  const t = await getTranslations("staff")

  const { data } = await supabase
    .from("staff")
    .select("*, staff_skills(*)")
    .order("last_name")

  const staff = (data ?? []) as StaffWithSkills[]

  return (
    <>
      <header className="h-12 shrink-0 flex items-center gap-4 border-b px-6">
        <span className="text-[14px] font-medium text-muted-foreground">{t("title")}</span>
      </header>

      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <StaffList staff={staff} />
        </MobileGate>
      </div>
    </>
  )
}
