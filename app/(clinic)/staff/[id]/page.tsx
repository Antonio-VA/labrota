import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffForm } from "@/components/staff-form"
import type { StaffWithSkills } from "@/lib/types/database"

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations("staff")

  const { data } = await supabase
    .from("staff")
    .select("*, staff_skills(*)")
    .eq("id", id)
    .single()

  if (!data) notFound()

  const staff = data as StaffWithSkills

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div>
              <h1 className="text-[18px] font-medium">{t("editStaff")}</h1>
              <p className="text-[14px] text-muted-foreground mt-1">
                {staff.first_name} {staff.last_name}
              </p>
            </div>
            <StaffForm mode="edit" staff={staff} />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
