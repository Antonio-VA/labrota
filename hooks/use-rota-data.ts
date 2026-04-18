"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  getRotaWeek,
  getRotaMonthSummary,
  getActiveStaff,
  type RotaWeekData,
  type RotaDay,
  type RotaMonthSummary,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills } from "@/lib/types/database"
import type { GenerationStrategy } from "@/components/calendar-panel/utils"

// Pin cache to window so it survives Next.js HMR module re-evaluation in dev.
// In production a module-level Map would also work; window makes both envs reliable.
type _LrCache = { weeks: Map<string, RotaWeekData>; staff: StaffWithSkills[] | null }
const _cache: _LrCache = (() => {
  if (typeof window === "undefined") return { weeks: new Map(), staff: null }
  const win = window as unknown as { __lrCache?: _LrCache }
  if (!win.__lrCache) win.__lrCache = { weeks: new Map(), staff: null }
  return win.__lrCache
})()

// ── Types ────────────────────────────────────────────────────────────────────

interface UseRotaDataOptions {
  weekStart: string
  monthStart: string
  view: "week" | "month" | "day"
  canEdit: boolean
  refreshKey: number
  initialData?: RotaWeekData
  initialStaff?: StaffWithSkills[]
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRotaData({
  weekStart, monthStart, view, canEdit, refreshKey, initialData, initialStaff,
}: UseRotaDataOptions) {

  // ── State ────────────────────────────────────────────────────────────────

  // Seed window cache with server-provided data so navigation away + back is instant
  if (initialData) _cache.weeks.set(initialData.weekStart, initialData)

  // Only use initialData if it matches the requested week; otherwise check cache
  const cachedWeek = (initialData?.weekStart === weekStart ? initialData : null) ?? _cache.weeks.get(weekStart) ?? null
  const cachedStaff = _cache.staff

  const [weekData, setWeekData]           = useState<RotaWeekData | null>(cachedWeek)
  const [monthSummary, setMonthSummary]   = useState<RotaMonthSummary | null>(null)
  const [loadingWeek, setLoadingWeek]     = useState(!cachedWeek)
  const [loadingMonth, setLoadingMonth]   = useState(false)
  const [error, setError]                 = useState<string | null>(null)
  const [initialLoaded, setInitialLoaded] = useState(!!cachedWeek)
  const [staffList, setStaffList]         = useState<StaffWithSkills[]>(cachedStaff ?? [])
  const [staffLoaded, setStaffLoaded]     = useState(!!cachedStaff)
  const [prevWeekHasRota, setPrevWeekHasRota] = useState(false)
  const [punctionsOverride, setPunctionsOverrideLocal] = useState<Record<string, number>>(
    cachedWeek?.rota?.punctions_override ?? {},
  )
  const [activeStrategy, setActiveStrategy] = useState<GenerationStrategy | null>(null)
  const [liveDays, setLiveDays]           = useState<RotaDay[] | null>(null)
  const aiReasoningRef    = useRef<string | null>(null)
  const reasoningSourceRef = useRef<"claude" | "hybrid" | null>(null)

  // ── Internal refs ────────────────────────────────────────────────────────

  const fetchVersionRef  = useRef(0)
  const lastFetchId      = useRef(0)
  const skipInitialFetch = useRef(!!initialData && initialData.weekStart === weekStart)
  const initialStaffUsed = useRef(false)
  const prevStaffIdsRef  = useRef("")
  const gridSetDaysRef   = useRef<((days: RotaDay[]) => void) | null>(null)

  // ── Helpers ──────────────────────────────────────────────────────────────

  function weekOffset(ws: string, days: number): string {
    const dt = new Date(ws + "T12:00:00")
    dt.setDate(dt.getDate() + days)
    return dt.toISOString().split("T")[0]
  }

  function prefetchAdjacent(ws: string) {
    const run = () => {
      prefetchWeek(weekOffset(ws, -7))
      prefetchWeek(weekOffset(ws, 7))
    }
    if (typeof requestIdleCallback === "function") requestIdleCallback(run)
    else setTimeout(run, 200)
  }

  // Fire-and-forget prefetch: populates the cache without touching React state.
  // Used by adjacent-week prefetch and by hover-on-nav-button prefetch so a
  // click-to-next/prev hits a warm cache. Safe to call repeatedly — the cache
  // check prevents duplicate round-trips.
  const prefetchWeek = useCallback((ws: string) => {
    if (_cache.weeks.has(ws)) return
    getRotaWeek(ws).then((d) => { _cache.weeks.set(ws, d) }).catch(() => {})
  }, [])

  // ── Fetch functions ──────────────────────────────────────────────────────

  const fetchWeek = useCallback((ws: string) => {
    // Cache hit — show instantly, then silently refresh in background.
    // Version-guarded so rapid week switches don't let an older response overwrite a newer one.
    const cached = _cache.weeks.get(ws)
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
        _cache.weeks.set(ws, d)
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
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timed out. Please refresh.")), 15000),
    )
    Promise.race([getRotaWeek(ws), timeout]).then((d) => {
      if (fetchVersionRef.current !== version) return
      _cache.weeks.set(ws, d)
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
    })
  }, [])

  // Silent refresh — used after drag-drop so the grid doesn't flash skeleton.
  // Returns the fresh week so callers that need post-refresh data (skill gap
  // toasts, etc.) can await it instead of re-issuing a raw getRotaWeek.
  const fetchWeekSilent = useCallback((ws: string): Promise<RotaWeekData | null> => {
    const id = ++lastFetchId.current
    return getRotaWeek(ws).then((d) => {
      if (id !== lastFetchId.current) return null // stale — a newer fetch is in flight
      _cache.weeks.set(ws, d)
      setWeekData(d)
      setPunctionsOverrideLocal(d.rota?.punctions_override ?? {})
      return d
    }).catch(() => null)
  }, [])

  const handleRefresh = useCallback(() => {
    fetchWeekSilent(weekStart)
  }, [fetchWeekSilent, weekStart])

  // Fetch 4-week rolling summary
  const fetchMonth = useCallback((ms: string, ws?: string) => {
    setMonthSummary(null)
    setLoadingMonth(true)
    getRotaMonthSummary(ms, ws).then((d) => {
      setMonthSummary(d)
      setLoadingMonth(false)
    })
  }, [])

  // ── Biopsy change handler ────────────────────────────────────────────────

  function handleBiopsyChange(date: string, biopsyNew: number) {
    const cr = weekData?.biopsyConversionRate ?? monthSummary?.biopsyConversionRate ?? 0.5
    const d5Pct = weekData?.biopsyDay5Pct ?? monthSummary?.biopsyDay5Pct ?? 0.5
    const d6Pct = weekData?.biopsyDay6Pct ?? monthSummary?.biopsyDay6Pct ?? 0.5
    const pd = weekData?.punctionsDefault ?? {}

    const d = new Date(date + "T12:00:00")
    const d5 = new Date(d); d5.setDate(d5.getDate() - 5); const d5str = d5.toISOString().split("T")[0]
    const d6 = new Date(d); d6.setDate(d6.getDate() - 6); const d6str = d6.toISOString().split("T")[0]

    const P5 = punctionsOverride[d5str] ?? pd[d5str] ?? monthSummary?.days.find((dd) => dd.date === d5str)?.punctions ?? 0
    const P6 = punctionsOverride[d6str] ?? pd[d6str] ?? monthSummary?.days.find((dd) => dd.date === d6str)?.punctions ?? 0

    const bForecast = Math.round(P5 * cr * d5Pct + P6 * cr * d6Pct)
    const delta = biopsyNew - bForecast
    if (Math.abs(delta) < 0.5 || cr === 0) return

    const pDelta = delta / cr
    const P5new = Math.max(0, Math.round(P5 + pDelta))
    const P6new = Math.max(0, Math.round(P6 + pDelta))

    setPunctionsOverrideLocal((prev) => ({ ...prev, [d5str]: P5new, [d6str]: P6new }))
  }

  // ── Effects ──────────────────────────────────────────────────────────────

  // When server pre-fetches, prime adjacent weeks so clicking next/prev is instant
  useEffect(() => {
    if (initialData) prefetchAdjacent(initialData.weekStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Initial week fetch (skip if server pre-fetched)
  useEffect(() => {
    if (skipInitialFetch.current) { skipInitialFetch.current = false; return }
    fetchWeek(weekStart)
  }, [weekStart, fetchWeek])

  // Month summary fetch
  useEffect(() => {
    if (view === "month") fetchMonth(monthStart, weekStart)
  }, [monthStart, weekStart, view, fetchMonth])

  // Refresh on refreshKey change
  useEffect(() => {
    if (refreshKey === 0) return
    fetchWeek(weekStart)
    if (view === "month") fetchMonth(monthStart, weekStart)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey])

  // Check if previous week has a rota (for "copy previous week" button)
  useEffect(() => {
    if (!canEdit || view !== "week") return
    let cancelled = false
    const prev = new Date(weekStart + "T12:00:00")
    prev.setDate(prev.getDate() - 7)
    const prevWs = prev.toISOString().split("T")[0]
    // Use cache if available — avoids a redundant server round-trip on every navigation back
    const cached = _cache.weeks.get(prevWs)
    if (cached) {
      setPrevWeekHasRota(cached.days.some((day) => day.assignments.length > 0))
      return () => { cancelled = true }
    }
    getRotaWeek(prevWs).then((d) => {
      _cache.weeks.set(prevWs, d)
      if (!cancelled) setPrevWeekHasRota(d.days.some((day) => day.assignments.length > 0))
    }).catch(() => { if (!cancelled) setPrevWeekHasRota(false) })
    return () => { cancelled = true }
  }, [weekStart, canEdit, view])

  // Staff loading — use initialStaff prop; otherwise wait briefly for weekData.activeStaff
  // (populated by getRotaWeek) and only fall back to a separate fetch if that stalls.
  useEffect(() => {
    if (!initialStaffUsed.current && initialStaff && initialStaff.length > 0) {
      initialStaffUsed.current = true
      setStaffList(initialStaff)
      setStaffLoaded(true)
      return
    }
    if (staffLoaded || weekData?.activeStaff) return

    let cancelled = false
    // Delay the fallback fetch so the sync effect can consume weekData.activeStaff first.
    const fallbackDelay = setTimeout(() => {
      if (cancelled || staffLoaded || weekData?.activeStaff) return
      const staffTimeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Staff load timed out")), 15000),
      )
      Promise.race([getActiveStaff(), staffTimeout])
        .then((s) => {
          if (cancelled) return
          _cache.staff = s
          setStaffList(s)
          setStaffLoaded(true)
        })
        .catch(() => { if (!cancelled) setStaffLoaded(true) })
    }, 1500)

    return () => { cancelled = true; clearTimeout(fallbackDelay) }
  }, [refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync staff from weekData.activeStaff (avoids duplicate fetch)
  useEffect(() => {
    if (!weekData?.activeStaff || weekData.activeStaff.length === 0) return
    const ids = weekData.activeStaff.map((s) => s.id).sort().join(",")
    if (ids === prevStaffIdsRef.current) return
    prevStaffIdsRef.current = ids
    _cache.staff = weekData.activeStaff
    setStaffList(weekData.activeStaff)
    setStaffLoaded(true)
  }, [weekData?.activeStaff])

  // ── Return ───────────────────────────────────────────────────────────────

  return {
    weekData, setWeekData,
    monthSummary, setMonthSummary,
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
    fetchWeek, fetchWeekSilent, fetchMonth, handleRefresh, prefetchWeek,
    handleBiopsyChange,
    lastFetchId, gridSetDaysRef,
  }
}
