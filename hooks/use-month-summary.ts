"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { getRotaMonthSummary, type RotaMonthSummary } from "@/app/(clinic)/rota/actions"

export function useMonthSummary({
  monthStart, weekStart, view, refreshKey,
}: {
  monthStart: string
  weekStart: string
  view: "week" | "month" | "day"
  refreshKey: number
}) {
  const [monthSummary, setMonthSummary] = useState<RotaMonthSummary | null>(null)
  const [loadingMonth, setLoadingMonth] = useState(false)
  const lastFetchedKeyRef = useRef<string | null>(null)

  const fetchMonth = useCallback((ms: string, ws?: string) => {
    lastFetchedKeyRef.current = `${ms}:${ws ?? ""}`
    setMonthSummary(null)
    setLoadingMonth(true)
    getRotaMonthSummary(ms, ws).then((d) => {
      setMonthSummary(d)
      setLoadingMonth(false)
    })
  }, [])

  useEffect(() => {
    if (view !== "month") return
    const key = `${monthStart}:${weekStart}`
    if (lastFetchedKeyRef.current === key) return
    fetchMonth(monthStart, weekStart)
  }, [monthStart, weekStart, view, fetchMonth])

  useEffect(() => {
    if (refreshKey === 0) return
    if (view === "month") fetchMonth(monthStart, weekStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return { monthSummary, setMonthSummary, loadingMonth, setLoadingMonth, fetchMonth }
}
