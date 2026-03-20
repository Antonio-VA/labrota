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
      <div className="flex-1 overflow-auto">
        <MobileGate>
          <div className="mx-auto w-full max-w-[1200px] px-8 py-6">
            <StaffList staff={staff} />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
