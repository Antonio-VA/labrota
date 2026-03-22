import { requireEditor } from "@/lib/require-editor"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffList } from "@/components/staff-list"
import type { StaffWithSkills, Tecnica, Department } from "@/lib/types/database"

export default async function StaffPage() {
  await requireEditor()
  const supabase = await createClient()
  const [staffRes, tecnicasRes, deptRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").order("last_name"),
    supabase.from("tecnicas").select("*").eq("activa", true).order("orden"),
    supabase.from("departments").select("*").order("sort_order"),
  ])
  const staff = (staffRes.data ?? []) as StaffWithSkills[]
  const tecnicas = (tecnicasRes.data ?? []) as Tecnica[]
  const depts = (deptRes.data ?? []) as Department[]

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <StaffList staff={staff} tecnicas={tecnicas} departments={depts} />
        </MobileGate>
      </div>
    </>
  )
}
