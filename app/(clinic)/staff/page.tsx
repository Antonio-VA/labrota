import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { StaffList } from "@/components/staff-list"
import { getMondayOfWeek, getWeekDates } from "@/lib/rota-engine"
import type { StaffWithSkills } from "@/lib/types/database"

export default async function StaffPage() {
  const supabase   = await createClient()
  const weekStart  = getMondayOfWeek()
  const weekDates  = getWeekDates(weekStart)

  const [staffRes, assignmentsRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").order("last_name"),
    supabase.from("rota_assignments").select("staff_id").in("date", weekDates) as unknown as Promise<{ data: { staff_id: string }[] | null }>,
  ])

  const staff = (staffRes.data ?? []) as StaffWithSkills[]

  const shiftsThisWeek: Record<string, number> = {}
  for (const a of assignmentsRes.data ?? []) {
    shiftsThisWeek[a.staff_id] = (shiftsThisWeek[a.staff_id] ?? 0) + 1
  }

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <StaffList staff={staff} shiftsThisWeek={shiftsThisWeek} />
        </MobileGate>
      </div>
    </>
  )
}
