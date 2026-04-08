import { requireEditor } from "@/lib/require-editor"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MobileGate } from "@/components/mobile-gate"
import { StaffForm } from "@/components/staff-form"
import type { StaffWithSkills, Tecnica, Department, ShiftTypeDefinition } from "@/lib/types/database"
import { ChevronLeft } from "lucide-react"

export default async function EditStaffPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireEditor()
  const { id } = await params
  const supabase = await createClient()
  const t = await getTranslations("staff")

  const [staffRes, tecnicasRes, deptRes, shiftTypesRes, labConfigRes] = await Promise.all([
    supabase.from("staff").select("*, staff_skills(*)").eq("id", id).single() as unknown as Promise<{ data: StaffWithSkills | null }>,
    supabase.from("tecnicas").select("*").order("orden").order("created_at"),
    supabase.from("departments").select("*").order("sort_order"),
    supabase.from("shift_types").select("*").order("sort_order"),
    supabase.from("lab_config").select("days_off_preference").single(),
  ])

  if (!staffRes.data) notFound()

  const staff       = staffRes.data as StaffWithSkills
  const tecnicas    = (tecnicasRes.data ?? []) as Tecnica[]
  const departments = (deptRes.data ?? []) as Department[]
  const shiftTypes  = (shiftTypesRes.data ?? []) as ShiftTypeDefinition[]
  const guardiaMode = (labConfigRes.data as { days_off_preference?: string } | null)?.days_off_preference === "guardia"

  // Check if this staff member already has a linked viewer account
  let hasViewerAccount = false
  if (staff.email) {
    const admin = createAdminClient()
    const { data: member } = await admin
      .from("organisation_members")
      .select("id")
      .eq("linked_staff_id", id)
      .maybeSingle() as { data: { id: string } | null }
    hasViewerAccount = !!member
  }

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div>
              <h1 className="text-[18px] font-medium flex items-center gap-1">
                <Link href="/staff" className="text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft className="size-5" /></Link>
                {t("editStaff")}
              </h1>
              <p className="text-[14px] text-muted-foreground mt-1">
                {staff.first_name} {staff.last_name}
              </p>
            </div>
            <StaffForm mode="edit" staff={staff} tecnicas={tecnicas} departments={departments} shiftTypes={shiftTypes} guardiaMode={guardiaMode} hasViewerAccount={hasViewerAccount} />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
