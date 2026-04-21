"use client"

import { useState, useEffect } from "react"
import { getRotaWeek } from "@/app/(clinic)/rota/actions"
import { addDays } from "@/components/calendar-panel/utils"
import { getRotaCache } from "./use-rota-cache"

export function usePrevWeekProbe({
  weekStart, canEdit, view,
}: {
  weekStart: string
  canEdit: boolean
  view: "week" | "month" | "day"
}) {
  const [prevWeekHasRota, setPrevWeekHasRota] = useState(false)

   
  useEffect(() => {
    if (!canEdit || view !== "week") return
    let cancelled = false
    const prevWs = addDays(weekStart, -7)
    const cache = getRotaCache()
    const cached = cache.weeks.get(prevWs)
    if (cached) {
      setPrevWeekHasRota(cached.days.some((day) => day.assignments.length > 0))
      return () => { cancelled = true }
    }
    getRotaWeek(prevWs).then((d) => {
      cache.weeks.set(prevWs, d)
      if (!cancelled) setPrevWeekHasRota(d.days.some((day) => day.assignments.length > 0))
    }).catch(() => { if (!cancelled) setPrevWeekHasRota(false) })
    return () => { cancelled = true }
  }, [weekStart, canEdit, view])
   

  return prevWeekHasRota
}
