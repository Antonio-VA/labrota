"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  getRotaWeek,
  type RotaWeekData,
  type RotaDay,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import { addDays, type GenerationStrategy } from "@/components/calendar-panel/utils"
import { getRotaCache } from "./use-rota-cache"
import { useMonthSummary } from "./use-month-summary"
import { usePrevWeekProbe } from "./use-prev-week-probe"
import { useStaffList } from "./use-staff-list"
import { computeBiopsyOverridePatch } from "@/lib/biopsy-override"

interface UseRotaDataOptions {
  weekStart: string
  monthStart: string
  view: "week" | "month" | "day"
  canEdit: boolean
  refreshKey: number
  initialData?: RotaWeekData
  initialStaff?: StaffWithSkills[]
}

export function useRotaData({
  weekStart, monthStart, view, canEdit, refreshKey, initialData, initialStaff,
}: UseRotaDataOptions) {

  const cache = getRotaCache()

  // Seed cache once from SSR payload so navigation away + back is instant.
  const seededRef = useRef(false)
  if (!seededRef.current) {
    seededRef.current = true
    if (initialData) cache.weeks.set(initialData.weekStart, initialData)
  }

  const cachedWeek = (initialData?.weekStart === weekStart ? initialData : null) ?? cache.weeks.get(weekStart) ?? null

  const [weekData, setWeekData]           = useState<RotaWeekData | null>(cachedWeek)
  const [loadingWeek, setLoadingWeek]     = useState(!cachedWeek)
  const [error, setError]                 = useState<string | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(!!cachedWeek)
  const [punctionsOverride, setPunctionsOverrideLocal] = useState<Record<string, number>>(
    cachedWeek?.rota?.punctions_override ?? {},
  )
  const [activeStrategy, setActiveStrategy] = useState<GenerationStrategy | null>(null)
  const [liveDays, setLiveDays]           = useState<RotaDay[] | null>(null)
  const aiReasoningRef    = useRef<string | null>(null)
  const reasoningSourceRef = useRef<"claude" | "hybrid" | null>(null)

  const fetchVersionRef  = useRef(0)
  const lastFetchIdRef   = useRef(0)
  const skipInitialFetch = useRef(!!initialData && initialData.weekStart === weekStart)
  const gridSetDaysRef   = useRef<((days: RotaDay[]) => void) | null>(null)

  // Fire-and-forget prefetch: populates the cache without touching React state.
  // Used by adjacent-week prefetch and by hover-on-nav-button prefetch so a
  // click-to-next/prev hits a warm cache. Safe to call repeatedly — the cache
  // check prevents duplicate round-trips.
  const prefetchWeek = useCallback((ws: string) => {
    if (cache.weeks.has(ws)) return
    getRotaWeek(ws).then((d) => { cache.weeks.set(ws, d) }).catch(() => {})
  }, [cache])

  const prefetchAdjacent = useCallback((ws: string) => {
    const run = () => {
      prefetchWeek(addDays(ws, -7))
      prefetchWeek(addDays(ws, 7))
    }
    if (typeof requestIdleCallback === "function") requestIdleCallback(run)
    else setTimeout(run, 200)
  }, [prefetchWeek])

  const fetchWeek = useCallback((ws: string) => {
    // Cache hit: show instantly, then silently refresh. Version-guarded so rapid
    // week switches don't let an older response overwrite a newer one.
    const cached = cache.weeks.get(ws)
    if (cached) {
      const version = ++fetchVersionRef.current
      setInitialLoaded(true)
      setWeekData(cached)
      setPunctionsOverrideLocal(cached.rota?.punctions_override ?? {})
      setLoadingWeek(false)
      setLiveDays(null)
      setError(null)
      aiReasoningRef.current = null
      reasoningSourceRef.current = null
      setActiveStrategy(null)
      getRotaWeek(ws).then((d) => {
        if (fetchVersionRef.current !== version) return
        cache.weeks.set(ws, d)
        setWeekData(d)
        setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
        prefetchAdjacent(ws)
      }).catch(() => {})
      return
    }

    const version = ++fetchVersionRef.current
    aiReasoningRef.current = null
    reasoningSourceRef.current = null
    setActiveStrategy(null)
    setLoadingWeek(true)
    setLiveDays(null)
    setError(null)
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error("Request timed out. Please refresh.")), 15000)
    })
    Promise.race([getRotaWeek(ws), timeout]).then((d) => {
      if (fetchVersionRef.current !== version) return
      cache.weeks.set(ws, d)
      setInitialLoaded(true)
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
      setLoadingWeek(false)
      prefetchAdjacent(ws)
    }).catch((e: unknown) => {
      if (fetchVersionRef.current !== version) return
      setInitialLoaded(true)
      setWeekData(null)
      setError(e instanceof Error ? e.message : "Failed to load schedule data.")
      setLoadingWeek(false)
    }).finally(() => {
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    })
  }, [cache, prefetchAdjacent])

  // Silent refresh after drag-drop so the grid doesn't flash skeleton. Returns
  // the fresh week so callers (skill-gap toasts, etc.) can await it instead of
  // re-issuing a raw getRotaWeek.
  const fetchWeekSilent = useCallback((ws: string): Promise<RotaWeekData | null> => {
    const id = ++lastFetchIdRef.current
    return getRotaWeek(ws).then((d) => {
      if (id !== lastFetchIdRef.current) return null
      cache.weeks.set(ws, d)
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
      return d
    }).catch(() => null)
  }, [cache])

  const { monthSummary, loadingMonth, setLoadingMonth, fetchMonth } =
    useMonthSummary({ monthStart, weekStart, view, refreshKey })
  const prevWeekHasRota = usePrevWeekProbe({ weekStart, canEdit, view })
  const { staffList, staffLoaded } = useStaffList({ initialStaff, weekData, refreshKey })

  function handleBiopsyChange(date: string, biopsyNew: number) {
    const patch = computeBiopsyOverridePatch(date, biopsyNew, {
      biopsyConversionRate: weekData?.biopsyConversionRate ?? monthSummary?.biopsyConversionRate ?? 0.5,
      biopsyDay5Pct: weekData?.biopsyDay5Pct ?? monthSummary?.biopsyDay5Pct ?? 0.5,
      biopsyDay6Pct: weekData?.biopsyDay6Pct ?? monthSummary?.biopsyDay6Pct ?? 0.5,
      punctionsDefault: weekData?.punctionsDefault ?? {},
      monthDays: monthSummary?.days,
    }, punctionsOverride)
    if (patch) setPunctionsOverrideLocal((prev) => ({ ...prev, ...patch }))
  }

  useEffect(() => {
    if (initialData) prefetchAdjacent(initialData.weekStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (skipInitialFetch.current) { skipInitialFetch.current = false; return }
    fetchWeek(weekStart)
  }, [weekStart, fetchWeek])

  // refreshKey refetches week only; month is handled by useMonthSummary.
  useEffect(() => {
    if (refreshKey === 0) return
    fetchWeek(weekStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  return {
    weekData, setWeekData,
    monthSummary,
    loadingWeek, setLoadingWeek,
    loadingMonth, setLoadingMonth,
    error, setError,
    initialLoaded,
    staffList, staffLoaded,
    prevWeekHasRota,
    punctionsOverride, setPunctionsOverrideLocal,
    activeStrategy, setActiveStrategy,
    liveDays, setLiveDays,
    aiReasoningRef, reasoningSourceRef,
    fetchWeek, fetchWeekSilent, fetchMonth, prefetchWeek,
    handleBiopsyChange,
    lastFetchIdRef, gridSetDaysRef,
  }
}
