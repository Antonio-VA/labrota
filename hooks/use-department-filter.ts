import { useEffect, useMemo, useState } from "react"
import { buildDeptMaps } from "@/components/calendar-panel/utils"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"

export function useDepartmentFilter(weekData: RotaWeekData | null, staffList: StaffWithSkills[]) {
  const departments = weekData?.departments ?? []

  const globalDeptMaps = useMemo(() => buildDeptMaps(departments), [departments])

  const ALL_DEPTS = useMemo(
    () => departments.length > 0 ? departments.map((d) => d.code) : ["lab", "andrology", "admin"],
    [departments],
  )

  const deptAbbrMap = useMemo(
    () => Object.fromEntries(
      departments.length > 0
        ? departments.map((d) => [d.code, d.abbreviation || d.name.slice(0, 3)])
        : [["lab", "Emb"], ["andrology", "And"], ["admin", "Adm"]],
    ),
    [departments],
  )

  const [deptFilter, setDeptFilter] = useState<Set<string>>(new Set(ALL_DEPTS))

  // Reset filter when org departments change
  useEffect(() => { setDeptFilter(new Set(ALL_DEPTS)) }, [ALL_DEPTS])

  const allDeptsSelected = deptFilter.size >= ALL_DEPTS.length

  function toggleDept(dept: string) {
    setDeptFilter((prev) => {
      const next = new Set(prev)
      next.has(dept) ? next.delete(dept) : next.add(dept)
      return next
    })
  }

  function setAllDepts() {
    setDeptFilter(new Set(ALL_DEPTS))
  }

  function setOnlyDept(dept: string) {
    const next = new Set([dept])
    setDeptFilter(next)
    localStorage.setItem("labrota_dept_filter", JSON.stringify([dept]))
  }

  const filteredStaffList = allDeptsSelected ? staffList : staffList.filter((s) => deptFilter.has(s.role))

  return {
    departments,
    globalDeptMaps,
    ALL_DEPTS,
    deptAbbrMap,
    deptFilter,
    allDeptsSelected,
    toggleDept,
    setAllDepts,
    setOnlyDept,
    filteredStaffList,
  }
}
