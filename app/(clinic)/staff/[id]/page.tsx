import { requireEditor } from "@/lib/require-editor"
import { notFound } from "next/navigation"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { MobileGate } from "@/components/mobile-gate"
import { StaffForm } from "@/components/staff-form"
import { StaffDetailTabs } from "@/components/staff-detail-tabs"
import { StaffLeaveBalances } from "@/components/staff-leave-balances"
import type { StaffWithSkills, Tecnica, Department, ShiftTypeDefinition, CompanyLeaveType, HolidayConfig, HolidayBalance, Leave } from "@/lib/types/database"
import { ChevronLeft } from "lucide-react"
import { getLeaveYear } from "@/lib/hr-balance-engine"

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
  const admin = createAdminClient()
  if (staff.email) {
    const { data: member } = await admin
      .from("organisation_members")
      .select("id")
      .eq("linked_staff_id", id)
      .maybeSingle() as { data: { id: string } | null }
    hasViewerAccount = !!member
  }

  // Check if HR module is active
  const { data: hrModule } = await supabase
    .from("hr_module")
    .select("status")
    .maybeSingle() as { data: { status: string } | null }

  const hrActive = hrModule?.status === "active"

  let hrData: {
    leaveTypes: CompanyLeaveType[]
    balances: HolidayBalance[]
    config: HolidayConfig
    leaves: Leave[]
    year: number
  } | null = null

  if (hrActive) {
    const today = new Date().toISOString().slice(0, 10)

    const [configRes, typesRes, leavesRes] = await Promise.all([
      supabase.from("holiday_config").select("*").single() as unknown as Promise<{ data: HolidayConfig | null }>,
      supabase.from("company_leave_types").select("*").order("sort_order") as unknown as Promise<{ data: CompanyLeaveType[] | null }>,
      supabase.from("leaves").select("*").eq("staff_id", id).in("status", ["approved", "pending", "cancelled"]).order("start_date", { ascending: false }) as unknown as Promise<{ data: Leave[] | null }>,
    ])

    const hConfig = configRes.data
    const currentYear = hConfig
      ? getLeaveYear(today, hConfig.leave_year_start_month, hConfig.leave_year_start_day)
      : new Date().getFullYear()

    const { data: balancesData } = await supabase
      .from("holiday_balance")
      .select("*")
      .eq("staff_id", id)
      .eq("year", currentYear) as { data: HolidayBalance[] | null }

    if (hConfig) {
      hrData = {
        leaveTypes: typesRes.data ?? [],
        balances: balancesData ?? [],
        config: hConfig,
        leaves: (leavesRes.data ?? []) as Leave[],
        year: currentYear,
      }
    }
  }

  const staffName = `${staff.first_name} ${staff.last_name}`

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <div className="max-w-2xl mx-auto flex flex-col gap-6">
            <div>
              <h1 className="text-[18px] font-medium flex items-center gap-1">
                <Link href="/staff" className="text-muted-foreground hover:text-foreground transition-colors"><ChevronLeft className="size-5" /></Link>
                {staffName}
              </h1>
            </div>
            <StaffDetailTabs
              staffName={staffName}
              profile={
                <StaffForm mode="edit" staff={staff} tecnicas={tecnicas} departments={departments} shiftTypes={shiftTypes} guardiaMode={guardiaMode} hasViewerAccount={hasViewerAccount} />
              }
              balances={
                hrData ? (
                  <StaffLeaveBalances
                    staffId={id}
                    staffName={staffName}
                    leaveTypes={hrData.leaveTypes}
                    balances={hrData.balances}
                    config={hrData.config}
                    leaves={hrData.leaves}
                    year={hrData.year}
                    publicHolidays={[]}
                  />
                ) : null
              }
            />
          </div>
        </MobileGate>
      </div>
    </>
  )
}
