"use server"

import { createClient } from "@/lib/supabase/server"
import { getOrgId } from "@/lib/get-org-id"

export interface HeadcountResult {
  total: number
  breakdown: { department: string; label: string; headcount: number; explanation: string }[]
  explanation: string
  calculatedAt: string
}

export async function calculateOptimalHeadcount(): Promise<{ data?: HeadcountResult; error?: string }> {
  const supabase = await createClient()
  const orgId = await getOrgId()
  if (!orgId) return { error: "Not authenticated." }

  const [labConfigRes, orgRes, deptRes, staffRes] = await Promise.all([
    supabase.from("lab_config").select("*").single() as unknown as Promise<{ data: Record<string, unknown> | null }>,
    supabase.from("organisations").select("rota_display_mode").eq("id", orgId).single() as unknown as Promise<{ data: { rota_display_mode: string } | null }>,
    supabase.from("departments").select("*").order("sort_order") as unknown as Promise<{ data: { code: string; name: string }[] | null }>,
    supabase.from("staff").select("id, role, days_per_week").neq("onboarding_status", "inactive") as unknown as Promise<{ data: { id: string; role: string; days_per_week: number }[] | null }>,
  ])

  if (!labConfigRes.data) return { error: "Lab config not found." }

  const lc = labConfigRes.data
  const departments = deptRes.data ?? []
  const _staffList = staffRes.data ?? []

  const isByTask = (orgRes.data?.rota_display_mode ?? "by_shift") === "by_task"

  const shiftCoverageEnabled = lc.shift_coverage_enabled as boolean | undefined ?? false
  const shiftCoverageByDay = lc.shift_coverage_by_day as Record<string, Record<string, Record<string, number>>> | null
  const coverageByDay = lc.coverage_by_day as Record<string, Record<string, number>> | null

  function getDeptCoverageForDay(day: string, deptCode: string): number {
    if (isByTask) {
      return coverageByDay?.[day]?.[deptCode] ?? 0
    }
    if (shiftCoverageEnabled && shiftCoverageByDay) {
      let total = 0
      for (const shiftCode of Object.keys(shiftCoverageByDay)) {
        total += shiftCoverageByDay[shiftCode]?.[day]?.[deptCode] ?? 0
      }
      return total
    }
    if (coverageByDay) {
      return coverageByDay[day]?.[deptCode] ?? 0
    }
    if (deptCode === "lab") {
      const isWe = day === "sat" || day === "sun"
      return isWe ? (lc.min_weekend_lab_coverage as number ?? 0) : (lc.min_lab_coverage as number ?? 0)
    }
    if (deptCode === "andrology") {
      const isWe = day === "sat" || day === "sun"
      return isWe ? (lc.min_weekend_andrology as number ?? 0) : (lc.min_andrology_coverage as number ?? 0)
    }
    return 0
  }

  const annualLeaveDays = lc.annual_leave_days as number ?? 20
  const defaultDaysPerWeek = lc.default_days_per_week as number ?? 5
  const effectiveDaysPerYear = (defaultDaysPerWeek * 52) - annualLeaveDays
  const weekdays = ["mon", "tue", "wed", "thu", "fri"]
  const weekendDays = ["sat", "sun"]
  const allDepts = [...departments.filter((d) => d.code !== "admin"), ...departments.filter((d) => d.code === "admin")]

  const deptResults: { code: string; name: string; headcount: number; explanation: string }[] = []
  let grandTotal = 0

  for (const dept of allDepts) {
    const weekdayCoverages = weekdays.map((d) => getDeptCoverageForDay(d, dept.code))
    const weekendCoverages = weekendDays.map((d) => getDeptCoverageForDay(d, dept.code))
    const maxWeekday = Math.max(0, ...weekdayCoverages)
    const maxWeekend = Math.max(0, ...weekendCoverages)

    if (maxWeekday === 0 && maxWeekend === 0) continue

    const weekdaySum = weekdayCoverages.reduce((s, c) => s + c, 0)
    const weekendSum = weekendCoverages.reduce((s, c) => s + c, 0)
    const weekdayPersonDays = weekdaySum * 52.14
    const weekendPersonDays = weekendSum * 52.14
    const totalPersonDays = weekdayPersonDays + weekendPersonDays

    const optimal = Math.ceil(totalPersonDays / effectiveDaysPerYear)
    grandTotal += optimal

    deptResults.push({
      code: dept.code,
      name: dept.name,
      headcount: optimal,
      explanation: `${weekdaySum + weekendSum} person-days/week needed (${weekdaySum} weekday + ${weekendSum} weekend). ${Math.round(totalPersonDays)} person-days/year ÷ ${Math.round(effectiveDaysPerYear)} effective days/person = ${optimal}.`,
    })
  }

  const headcountResult: HeadcountResult = {
    total: grandTotal,
    breakdown: deptResults.map((d) => ({
      department: d.code,
      label: d.name,
      headcount: d.headcount,
      explanation: d.explanation,
    })),
    explanation: `Minimum fully trained staff needed to meet ${isByTask ? "daily dept" : shiftCoverageEnabled ? "per-shift" : "dept-level"} coverage minimums year-round. Assumes all staff are certified. Each person provides (${defaultDaysPerWeek} days/week × 52) − ${annualLeaveDays} holiday days = ${Math.round(effectiveDaysPerYear)} effective days/year.`,
    calculatedAt: new Date().toISOString(),
  }

  return { data: headcountResult }
}
