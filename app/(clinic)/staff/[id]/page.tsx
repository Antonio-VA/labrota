import { requireEditor } from "@/lib/require-editor"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffForm } from "@/components/staff-form"
import type { StaffWithSkills, Tecnica, Department } from "@/lib/types/database"

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireEditor()
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations("staff")

  const [staffRes, tecnicasRes, deptRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").eq("id", id).single() as unknown as Promise<{ data: StaffWithSkills | null }>,
    supabase.from("tecnicas").select("*").order("orden").order("created_at"),
    supabase.from("departments").select("*").order("sort_order"),
  ])

  if (!staffRes.data) notFound()

  const staff       = staffRes.data as StaffWithSkills
  const tecnicas    = (tecnicasRes.data ?? []) as Tecnica[]
  const departments = (deptRes.data ?? []) as Department[]

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
            <StaffForm mode="edit" staff={staff} tecnicas={tecnicas} departments={departments} />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
