import dynamic from "next/dynamic"
import { requireEditor } from "@/lib/require-editor"
import { createClient } from "@/lib/supabase/server"
import { MobileGate } from "@/components/mobile-gate"
import { TableSkeleton } from "@/components/ui/skeleton"
import type { StaffWithSkills, Tecnica, Department, ShiftTypeDefinition } from "@/lib/types/database"

const StaffList = dynamic(() => import("@/components/staff-list").then((m) => m.StaffList), {
  loading: () => <TableSkeleton />,
})

export default async function StaffPage() {
  await requireEditor()
  const supabase = await createClient()
  const [staffRes, tecnicasRes, deptRes, shiftRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").order("last_name"),
    supabase.from("tecnicas").select("*").eq("activa", true).order("orden"),
    supabase.from("departments").select("*").order("sort_order"),
    supabase.from("shift_types").select("*").order("sort_order"),
  ])
  const staff = (staffRes.data ?? []) as StaffWithSkills[]
  const tecnicas = (tecnicasRes.data ?? []) as Tecnica[]
  const depts = (deptRes.data ?? []) as Department[]
  const shiftTypes = (shiftRes.data ?? []) as ShiftTypeDefinition[]

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <StaffList staff={staff} tecnicas={tecnicas} departments={depts} shiftTypes={shiftTypes} />
        </MobileGate>
      </div>
    </>
  )
}
