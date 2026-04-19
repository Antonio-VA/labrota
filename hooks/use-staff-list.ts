"use client"

import { useState, useRef, useEffect } from "react"
import { getActiveStaff, type RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { getRotaCache } from "./use-rota-cache"

export function useStaffList({
  initialStaff, weekData, refreshKey,
}: {
  initialStaff?: StaffWithSkills[]
  weekData: RotaWeekData | null
  refreshKey: number
}) {
  const initialCache = getRotaCache()
  const [staffList, setStaffList] = useState<StaffWithSkills[]>(initialCache.staff ?? [])
  const [staffLoaded, setStaffLoaded] = useState(!!initialCache.staff)

  const initialStaffUsed = useRef(false)
  const prevStaffIdsRef = useRef("")

  // Prefer initialStaff prop; otherwise wait briefly for weekData.activeStaff
  // (populated by getRotaWeek) and only fall back to a separate fetch if that stalls.
  /* eslint-disable react-hooks/set-state-in-effect -- initial-prop fast path */
  useEffect(() => {
    if (!initialStaffUsed.current && initialStaff && initialStaff.length > 0) {
      initialStaffUsed.current = true
      setStaffList(initialStaff)
      setStaffLoaded(true)
      return
    }
    if (staffLoaded || weekData?.activeStaff) return

    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const fallbackDelay = setTimeout(() => {
      if (cancelled || staffLoaded || weekData?.activeStaff) return
      const staffTimeout = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Staff load timed out")), 15000)
      })
      Promise.race([getActiveStaff(), staffTimeout])
        .then((s) => {
          if (cancelled) return
          getRotaCache().staff = s
          setStaffList(s)
          setStaffLoaded(true)
        })
        .catch(() => { if (!cancelled) setStaffLoaded(true) })
        .finally(() => { if (timeoutId !== undefined) clearTimeout(timeoutId) })
    }, 1500)

    return () => {
      cancelled = true
      clearTimeout(fallbackDelay)
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps
  /* eslint-enable react-hooks/set-state-in-effect */

  // Mirror weekData.activeStaff into staffList — ID guard avoids rerender churn.
  /* eslint-disable react-hooks/set-state-in-effect -- mirrors weekData deriving activeStaff */
  useEffect(() => {
    if (!weekData?.activeStaff || weekData.activeStaff.length === 0) return
    const ids = weekData.activeStaff.map((s) => s.id).sort().join(",")
    if (ids === prevStaffIdsRef.current) return
    prevStaffIdsRef.current = ids
    getRotaCache().staff = weekData.activeStaff
    setStaffList(weekData.activeStaff)
    setStaffLoaded(true)
  }, [weekData?.activeStaff])
  /* eslint-enable react-hooks/set-state-in-effect */

  return { staffList, staffLoaded }
}
