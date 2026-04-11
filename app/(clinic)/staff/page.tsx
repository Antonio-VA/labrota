import dynamic from "next/dynamic"
import { requireEditor } from "@/lib/require-editor"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getOrgId } from "@/lib/get-org-id"
import { MobileGate } from "@/components/mobile-gate"
import { TableSkeleton } from "@/components/ui/skeleton"
import { calculateBalance } from "@/lib/hr-balance-engine"
import { getLeaveYear } from "@/lib/hr-balance-engine"
import type { StaffWithSkills, Tecnica, Department, ShiftTypeDefinition, CompanyLeaveType, HolidayConfig, HolidayBalance, Leave } from "@/lib/types/database"

const StaffList = dynamic(() => import("@/components/staff-list").then((m) => m.StaffList), {
  loading: () => <TableSkeleton />,
})

export default async function StaffPage() {
  await requireEditor()
  const supabase = await createClient()
  const orgId = await getOrgId()
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

  let maxStaff = 50
  if (orgId) {
    const admin = createAdminClient()
    const { data: orgData } = await admin
      .from("organisations")
      .select("max_staff")
      .eq("id", orgId)
      .single() as { data: { max_staff: number } | null }
    maxStaff = orgData?.max_staff ?? 50
  }

  // Compute leave balances if HR module is active
  let leaveBalances: Record<string, { name: string; color: string; available: number; taken: number; booked: number }> | undefined

  const { data: hrMod } = await supabase
    .from("hr_module")
    .select("status")
    .maybeSingle() as { data: { status: string } | null }

  if (hrMod?.status === "active") {
    const today = new Date().toISOString().slice(0, 10)

    const [configRes, typesRes, leavesRes] = await Promise.all([
      supabase.from("holiday_config").select("*").single() as unknown as Promise<{ data: HolidayConfig | null }>,
      supabase.from("company_leave_types").select("*").eq("has_balance", true).eq("is_archived", false).order("sort_order") as unknown as Promise<{ data: CompanyLeaveType[] | null }>,
      supabase.from("leaves").select("staff_id, leave_type_id, type, start_date, end_date, status, days_counted, balance_year").in("status", ["approved", "pending"]) as unknown as Promise<{ data: Array<Pick<Leave, "staff_id" | "leave_type_id" | "type" | "start_date" | "end_date" | "status" | "days_counted" | "balance_year">> | null }>,
    ])

    const hConfig = configRes.data
    const trackedTypes = typesRes.data ?? []

    if (hConfig && trackedTypes.length > 0) {
      const currentYear = getLeaveYear(today, hConfig.leave_year_start_month, hConfig.leave_year_start_day)

      const { data: allBalances } = await supabase
        .from("holiday_balance")
        .select("*")
        .eq("year", currentYear) as { data: HolidayBalance[] | null }

      const balancesByStaff = new Map<string, HolidayBalance[]>()
      for (const b of allBalances ?? []) {
        const arr = balancesByStaff.get(b.staff_id) ?? []
        arr.push(b)
        balancesByStaff.set(b.staff_id, arr)
      }

      const leavesByStaff = new Map<string, typeof leavesRes.data>()
      for (const l of leavesRes.data ?? []) {
        const arr = leavesByStaff.get(l.staff_id) ?? []
        arr.push(l)
        leavesByStaff.set(l.staff_id, arr)
      }

      const dayConfig = {
        counting_method: hConfig.counting_method,
        public_holidays_deducted: hConfig.public_holidays_deducted,
      }

      // Map legacy leave type names for unmapped leaves
      const LEGACY_MAP: Record<string, string[]> = {
        annual: ["vacaciones", "annual leave"],
        sick: ["baja por enfermedad", "sick leave"],
      }

      function matchesType(leave: { leave_type_id: string | null; type?: string }, lt: { id: string; name: string; name_en: string | null }) {
        if (leave.leave_type_id === lt.id) return true
        if (leave.leave_type_id) return false
        const names = LEGACY_MAP[leave.type ?? ""] ?? []
        return names.includes(lt.name.toLowerCase()) || names.includes((lt.name_en ?? "").toLowerCase())
      }

      leaveBalances = undefined
      const primaryType = trackedTypes[0]
      if (primaryType) {
        leaveBalances = {}
        for (const s of staff) {
          const staffBalances = balancesByStaff.get(s.id) ?? []
          const staffLeaves = leavesByStaff.get(s.id) ?? []

          const balRecord = staffBalances.find((b) => b.leave_type_id === primaryType.id)
          const typeLeaves = staffLeaves.filter(
            (l) => matchesType(l, primaryType) &&
              (l.balance_year === currentYear || (!l.balance_year && l.start_date.startsWith(String(currentYear))))
          )

          const bal = calculateBalance({
            entitlement: balRecord?.entitlement ?? primaryType.default_days ?? 0,
            carried_forward: balRecord?.carried_forward ?? 0,
            cf_expiry_date: balRecord?.cf_expiry_date ?? null,
            manual_adjustment: balRecord?.manual_adjustment ?? 0,
            today,
            leaveEntries: typeLeaves.map((l) => ({
              start_date: l.start_date,
              end_date: l.end_date,
              status: l.status,
              days_counted: l.days_counted,
            })),
            config: dayConfig,
            publicHolidays: [],
          })

          leaveBalances[s.id] = {
            name: primaryType.name,
            color: primaryType.color,
            available: bal.available,
            taken: bal.taken,
            booked: bal.booked,
          }
        }
      }
    }
  }

  return (
    <>
      <div className="flex-1 overflow-auto p-6 md:p-8">
        <MobileGate>
          <StaffList staff={staff} tecnicas={tecnicas} departments={depts} shiftTypes={shiftTypes} maxStaff={maxStaff} leaveBalances={leaveBalances} />
        </MobileGate>
      </div>
    </>
  )
}
