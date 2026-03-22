import { requireEditor } from "@/lib/require-editor"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffForm } from "@/components/staff-form"
import type { Tecnica, Department } from "@/lib/types/database"

export default async function NewStaffPage() {
  await requireEditor()
  const t = await getTranslations("staff")
  const supabase = await createClient()
  const [tecRes, deptRes] = await Promise.all([
    supabase.from("tecnicas").select("*").order("orden").order("created_at"),
    supabase.from("departments").select("*").order("sort_order"),
  ])
  const tecnicas = (tecRes.data ?? []) as Tecnica[]
  const departments = (deptRes.data ?? []) as Department[]

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div>
              <h1 className="text-[18px] font-medium">{t("addStaff")}</h1>
            </div>
            <StaffForm mode="create" tecnicas={tecnicas} departments={departments} />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
