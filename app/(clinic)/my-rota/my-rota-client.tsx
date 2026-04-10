"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useLocale } from "next-intl"
import { useViewerStaffId } from "@/lib/role-context"
import { getMondayOfWeek } from "@/lib/rota-engine"
import { getRotaWeek, type RotaWeekData } from "@/app/(clinic)/rota/actions"
import { MySchedule } from "@/components/my-schedule"
import { Skeleton } from "@/components/ui/skeleton"

const TODAY = new Date().toISOString().split("T")[0]

function addDaysToDate(date: string, days: number): string {
  const d = new Date(date + "T12:00:00")
  d.setDate(d.getDate() + days)
  return d.toISOString().split("T")[0]
}

export function MyRotaClient() {
  const locale = useLocale() as "es" | "en"
  const viewerStaffId = useViewerStaffId()

  const [currentDate, setCurrentDate] = useState(TODAY)
  const weekStart = getMondayOfWeek(new Date(currentDate + "T12:00:00"))
  const [weekData, setWeekData] = useState<RotaWeekData | null>(null)
  const [loading, setLoading] = useState(true)
  const cache = useRef(new Map<string, RotaWeekData>())

  const fetchWeek = useCallback((ws: string) => {
    const cached = cache.current.get(ws)
    if (cached) {
      setWeekData(cached)
      setLoading(false)
      // Refresh silently
      getRotaWeek(ws).then((d) => { cache.current.set(ws, d); setWeekData(d) }).catch(() => {})
      return
    }
    setLoading(true)
    getRotaWeek(ws).then((d) => {
      cache.current.set(ws, d)
      setWeekData(d)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => { fetchWeek(weekStart) }, [weekStart, fetchWeek])

  // Listen for AI agent refresh events
  useEffect(() => {
    function onRefresh() { fetchWeek(weekStart) }
    window.addEventListener("labrota:refresh", onRefresh)
    return () => window.removeEventListener("labrota:refresh", onRefresh)
  }, [weekStart, fetchWeek])

  const handleWeekChange = useCallback((dir: -1 | 1) => {
    setCurrentDate((prev) => {
      const ws = getMondayOfWeek(new Date(prev + "T12:00:00"))
      return addDaysToDate(ws, dir * 7)
    })
  }, [])

  if (!viewerStaffId) {
    return (
      <div className="flex items-center justify-center flex-1 md:hidden">
        <p className="text-[14px] text-muted-foreground">{locale === "es" ? "No tienes un turno asignado" : "No shift assigned to you"}</p>
      </div>
    )
  }

  // Initial load — no data at all yet
  if (!weekData && loading) {
    return (
      <div className="flex flex-col gap-4 px-4 py-6 md:hidden animate-pulse">
        <Skeleton className="h-14 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    )
  }

  if (!weekData) return null

  return (
    <MySchedule
      staffId={viewerStaffId}
      days={weekData.days}
      onLeaveByDate={weekData.onLeaveByDate ?? {}}
      shiftTimes={weekData.shiftTimes ?? null}
      tecnicas={weekData.tecnicas ?? []}
      locale={locale}
      timeFormat={weekData.timeFormat}
      initialDate={currentDate}
      swapEnabled={weekData.enableSwapRequests}
      rotaPublished={weekData.rota?.status === "published"}
      onDateChange={setCurrentDate}
      onWeekChange={handleWeekChange}
      loading={loading}
      weekData={weekData}
    />
  )
}
