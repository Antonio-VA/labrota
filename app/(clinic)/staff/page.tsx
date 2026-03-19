import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffList } from "@/components/staff-list"
import type { StaffWithSkills } from "@/lib/types/database"

export default async function StaffPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from("staff")
    .select("*, staff_skills(*)")
    .order("last_name")

  const staff = (data ?? []) as StaffWithSkills[]

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <StaffList staff={staff} />
        </MobileGate>
      </div>
    </>
  )
}
