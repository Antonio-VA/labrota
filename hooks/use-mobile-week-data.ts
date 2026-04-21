"use client"

import { useState, useEffect } from "react"
import { getMondayOf } from "@/lib/format-date"
import { getRotaWeek, getActiveStaff, type RotaWeekData } from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"

const _mobileWeekCache = new Map<string, RotaWeekData>()
let _mobileWeekStaffCache: StaffWithSkills[] | null = null

export function useMobileWeekData() {
  const [weekStart, setWeekStart] = useState(() => getMondayOf())
  const [data, setData] = useState<RotaWeekData | null>(() => _mobileWeekCache.get(getMondayOf()) ?? null)
  const [staffList, setStaffList] = useState<StaffWithSkills[]>(() => _mobileWeekStaffCache ?? [])
  const [loading, setLoading] = useState(() => !_mobileWeekCache.has(getMondayOf()))
  const [error, setError] = useState<string | null>(null)

   
  useEffect(() => {
    const cachedData = _mobileWeekCache.get(weekStart)
    const cachedStaff = _mobileWeekStaffCache
    if (cachedData && cachedStaff) {
      setData(cachedData)
      setStaffList(cachedStaff)
      setLoading(false)
      setError(null)
      Promise.all([getRotaWeek(weekStart), getActiveStaff()]).then(([rotaData, staff]) => {
        _mobileWeekCache.set(weekStart, rotaData)
        _mobileWeekStaffCache = staff
        setData(rotaData)
        setStaffList(staff)
      }).catch((err) => {
        console.error("[mobile-week] background refresh failed", err)
        setError(err instanceof Error ? err.message : "Failed to refresh week")
      })
      return
    }
    setLoading(true)
    setError(null)
    Promise.all([
      cachedData ? Promise.resolve(cachedData) : getRotaWeek(weekStart),
      cachedStaff ? Promise.resolve(cachedStaff) : getActiveStaff(),
    ]).then(([rotaData, staff]) => {
      _mobileWeekCache.set(weekStart, rotaData)
      _mobileWeekStaffCache = staff
      setData(rotaData)
      setStaffList(staff)
      setLoading(false)
    }).catch((err) => {
      console.error("[mobile-week] fetch failed", err)
      setError(err instanceof Error ? err.message : "Failed to load week")
      setLoading(false)
    })
  }, [weekStart])
   

  function refresh() {
    setLoading(true)
    setError(null)
    Promise.all([getRotaWeek(weekStart), getActiveStaff()]).then(([rotaData, staff]) => {
      _mobileWeekCache.set(weekStart, rotaData)
      _mobileWeekStaffCache = staff
      setData(rotaData)
      setStaffList(staff)
      setLoading(false)
    }).catch((err) => {
      console.error("[mobile-week] refresh failed", err)
      setError(err instanceof Error ? err.message : "Failed to refresh week")
      setLoading(false)
    })
  }

  return { weekStart, setWeekStart, data, staffList, loading, error, refresh }
}
