import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffList } from "@/components/staff-list"
import type { StaffWithSkills, Tecnica } from "@/lib/types/database"

export default async function StaffPage() {
  const supabase = await createClient()
  const [staffRes, tecnicasRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").order("last_name"),
    supabase.from("tecnicas").select("*").eq("activa", true).order("orden"),
  ])
  const staff = (staffRes.data ?? []) as StaffWithSkills[]
  const tecnicas = (tecnicasRes.data ?? []) as Tecnica[]

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <StaffList staff={staff} tecnicas={tecnicas} />
        </MobileGate>
      </div>
    </>
  )
}
