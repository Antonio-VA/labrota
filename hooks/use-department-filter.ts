import { useEffect, useMemo, useState } from "react"
import { buildDeptMaps } from "@/components/calendar-panel/utils"
import type { RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"

export function useDepartmentFilter(weekData: RotaWeekData | null, staffList: StaffWithSkills[]) {
  const rawDepts = weekData?.departments ?? []
  // Stabilize departments reference — the array identity changes on every
  // weekData refetch (undo/redo, silent refresh) but the codes don't. Keying
  // the downstream memos on a code-string instead of the array preserves
  // referential equality so child consumers (dept dropdowns, filters) don't
  // re-memoize on every fetch.
  const deptKey = rawDepts.map((d) => d.code).join(",")

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deptKey encodes rawDepts content
  const departments = useMemo(() => rawDepts, [deptKey])

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
      if (next.has(dept)) next.delete(dept); else next.add(dept)
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

  const filteredStaffList = useMemo(
    () => allDeptsSelected ? staffList : staffList.filter((s) => deptFilter.has(s.role)),
    [allDeptsSelected, staffList, deptFilter],
  )

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
