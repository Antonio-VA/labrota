"use client"

import { useState, useTransition, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { toast } from "sonner"
import {
  publishRota,
  unlockRota,
  setPunctionsOverride,
  applyTemplate,
  clearWeek,
  copyPreviousWeek,
  type RotaWeekData,
  type RotaMonthSummary,
} from "@/app/(clinic)/rota/actions"
import {
  generateRota,
  generateRotaWithAI,
  generateRotaHybrid,
  generateTaskHybrid,
} from "@/app/(clinic)/rota/generate-actions"
import type { GenerationStrategy } from "@/components/calendar-panel/utils"
import type { ViewMode } from "@/components/calendar-panel/types"
import { getRotaCache } from "./use-rota-cache"

type Translate = (key: string, values?: Record<string, string | number>) => string

export function useRotaActions({
  weekStart, monthStart, view,
  weekData, monthSummary,
  setError, setActiveStrategy,
  setLoadingWeek, setLoadingMonth,
  setPunctionsOverrideLocal,
  aiReasoningRef, reasoningSourceRef,
  fetchWeek, fetchWeekSilent, fetchMonth,
  setShowStrategyModal,
  t,
}: {
  weekStart: string
  monthStart: string
  view: ViewMode
  weekData: RotaWeekData | null
  monthSummary: RotaMonthSummary | null
  setError: Dispatch<SetStateAction<string | null>>
  setActiveStrategy: Dispatch<SetStateAction<GenerationStrategy | null>>
  setLoadingWeek: Dispatch<SetStateAction<boolean>>
  setLoadingMonth: Dispatch<SetStateAction<boolean>>
  setPunctionsOverrideLocal: Dispatch<SetStateAction<Record<string, number>>>
  aiReasoningRef: MutableRefObject<string | null>
  reasoningSourceRef: MutableRefObject<"claude" | "hybrid" | null>
  fetchWeek: (ws: string) => void
  fetchWeekSilent: (ws: string) => Promise<RotaWeekData | null>
  fetchMonth: (ms: string, ws?: string) => void
  setShowStrategyModal: (v: boolean) => void
  t: Translate
}) {
  const [isPending, startTransition] = useTransition()
  const [pendingAction, setPendingAction] = useState<"generating" | "deleting" | null>(null)
  const [multiWeekScope, setMultiWeekScope] = useState<string[] | null>(null)
  const [showCopyConfirm, setShowCopyConfirm] = useState(false)

  function handleStrategyGenerate(strategy: GenerationStrategy, templateId?: string) {
    setShowStrategyModal(false)
    const weeksToGenerate = multiWeekScope ?? [weekStart]
    setMultiWeekScope(null)

    setActiveStrategy(strategy)
    setLoadingWeek(true)
    setPendingAction(strategy === "manual" ? "deleting" : "generating")
    startTransition(async () => {
      try {
        let successCount = 0
        let errorMsg: string | null = null

        for (const ws of weeksToGenerate) {
          if (strategy === "manual") {
            const result = await clearWeek(ws)
            if (result.error) { errorMsg = result.error; break }
            successCount++
          } else if (strategy === "flexible_template" && templateId) {
            const result = await applyTemplate(templateId, ws, true)
            if (result.error) { errorMsg = result.error; break }
            successCount++
          } else if (strategy === "ai_hybrid") {
            const isTask = weekData?.rotaDisplayMode === "by_task"
            const result = isTask
              ? await generateTaskHybrid(ws, false)
              : await generateRotaHybrid(ws, false)
            if (result.error) { errorMsg = result.error; break }
            if (result.reasoning) {
              aiReasoningRef.current = result.reasoning
              reasoningSourceRef.current = "hybrid"
            }
            successCount++
          } else if (strategy === "ai_reasoning") {
            const result = await generateRotaWithAI(ws, false)
            if (result.error) { errorMsg = result.error; break }
            if (result.reasoning) {
              aiReasoningRef.current = result.reasoning
              reasoningSourceRef.current = "claude"
            }
            successCount++
          } else if (strategy === "ai_optimal") {
            const isByTask = weekData?.rotaDisplayMode === "by_task"
            // Shift engine is v2-only. Task engine still supports v1/v2 selection.
            const genType: "ai_optimal" | "ai_optimal_v2" = isByTask
              ? ((weekData?.engineConfig?.taskOptimalVersion ?? "v1") === "v1" ? "ai_optimal" : "ai_optimal_v2")
              : "ai_optimal_v2"
            const result = await generateRota(ws, false, genType)
            if (result.error) { errorMsg = result.error; break }
            successCount++
          }
        }

        if (errorMsg) {
          setError(errorMsg)
          toast.error(errorMsg)
        } else if (weeksToGenerate.length > 1) {
          toast.success(t("weeksGenerated", { count: successCount }))
        } else {
          toast.success(t("scheduleGenerated"))
        }

        // Drop stale cache entries so fetchWeek doesn't flash pre-regen data
        // before the fresh result arrives.
        const cache = getRotaCache()
        for (const ws of weeksToGenerate) cache.weeks.delete(ws)

        fetchWeek(weekStart)
        if (view === "month") fetchMonth(monthStart, weekStart)
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e)
        const isTimeout = /failed to fetch|timeout|aborted|network/i.test(raw)
        const msg = isTimeout ? t("generatingTimeout") : raw || t("generatingError")
        setError(msg)
        toast.error(msg)
      } finally {
        setActiveStrategy(null)
        setPendingAction(null)
      }
    })
  }

  function handlePublish() {
    if (!weekData?.rota) return
    const rotaId = weekData.rota.id
    startTransition(async () => {
      const result = await publishRota(rotaId)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handleUnlock() {
    if (!weekData?.rota) return
    const rotaId = weekData.rota.id
    startTransition(async () => {
      const result = await unlockRota(rotaId)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  function handleDelete() {
    const msg = view === "month" ? t("confirm4WeeksDelete") : t("deleteWeekConfirm")
    if (!confirm(msg)) return
    if (view === "month") setLoadingMonth(true)
    setPendingAction("deleting")
    startTransition(async () => {
      if (view === "month" && monthSummary) {
        const allWeekStarts: string[] = []
        for (let i = 0; i < monthSummary.days.length; i += 7) {
          if (monthSummary.days[i]) allWeekStarts.push(monthSummary.days[i].date)
        }
        let errors = 0
        for (const ws of allWeekStarts) {
          const result = await clearWeek(ws)
          if (result.error) errors++
        }
        if (errors > 0) toast.error(t("weeksWithErrors", { count: errors }))
        else toast.success(t("fourWeeksDeleted"))
        fetchWeek(weekStart)
        fetchMonth(monthStart, weekStart)
      } else {
        const result = await clearWeek(weekStart)
        if (result.error) toast.error(result.error)
        else { toast.success(t("rotaDeleted")); fetchWeek(weekStart) }
      }
      setPendingAction(null)
    })
  }

  function handleCopyPreviousWeek() {
    setShowCopyConfirm(false)
    setLoadingWeek(true)
    startTransition(async () => {
      const result = await copyPreviousWeek(weekStart)
      if (result.error) { toast.error(result.error); return }
      toast.success(t("copyAssignments", { count: result.count ?? 0 }))
      fetchWeek(weekStart)
    })
  }

  function handlePunctionsChange(date: string, value: number | null) {
    if (!weekData?.rota) return
    const prevGaps = weekData.days.find((d) => d.date === date)?.skillGaps ?? []
    const rotaId = weekData.rota.id
    const ws = weekStart
    setPunctionsOverrideLocal((prev) => {
      if (value === null) {
        const { [date]: _removed, ...rest } = prev
        return rest
      }
      return { ...prev, [date]: value }
    })
    startTransition(async () => {
      const result = await setPunctionsOverride(rotaId, date, value)
      if (result.error) { setError(result.error); return }
      const newData = await fetchWeekSilent(ws)
      if (!newData) return
      const newGaps = newData.days.find((d) => d.date === date)?.skillGaps ?? []
      if (newGaps.length > prevGaps.length) {
        toast.warning(t("coverageInsufficient"))
      } else if (newGaps.length === 0 && prevGaps.length > 0) {
        toast.success(t("coverageOk"))
      }
    })
  }

  return {
    isPending,
    pendingAction,
    multiWeekScope,
    setMultiWeekScope,
    showCopyConfirm,
    setShowCopyConfirm,
    handleStrategyGenerate,
    handlePublish,
    handleUnlock,
    handleDelete,
    handleCopyPreviousWeek,
    handlePunctionsChange,
  }
}
