"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import {
  upsertAssignment,
  removeAssignment,
  setWholeTeam,
  type RotaWeekData,
  type RotaDay,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"

export function useTaskGridState({
  data, staffList, gridSetDaysRef,
  onAfterMutation, onCancelUndo, onSaved, onRefresh,
}: {
  data: RotaWeekData | null
  staffList: StaffWithSkills[]
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
  onAfterMutation?: (snapshot: RotaWeekData, inverse: () => Promise<{ error?: string }>, forward: () => Promise<{ error?: string }>) => void
  onCancelUndo?: () => void
  onSaved?: () => void
  onRefresh: () => void
}) {
  const [localDays, setLocalDays] = useState<RotaDay[]>(data?.days ?? [])
  const [localWholeTeam, setLocalWholeTeam] = useState<Record<string, boolean>>({})
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!gridSetDaysRef) return
    gridSetDaysRef.current = setLocalDays
    return () => { gridSetDaysRef.current = null }
  }, [gridSetDaysRef])

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
  }, [])

  const [prevData, setPrevData] = useState(data)
  if (data && data !== prevData) {
    setPrevData(data)
    setLocalDays(data.days)
    const serverWt: Record<string, boolean> = {}
    const keysWithAssignments = new Set<string>()
    for (const day of data.days) {
      for (const a of day.assignments) {
        if (a.function_label) {
          const key = `${a.function_label}:${day.date}`
          keysWithAssignments.add(key)
          if (a.whole_team) serverWt[key] = true
        }
      }
    }
    setLocalWholeTeam((prev) => {
      const next: Record<string, boolean> = {}
      for (const key of keysWithAssignments) next[key] = serverWt[key] ?? false
      for (const [key, val] of Object.entries(prev)) {
        if (!keysWithAssignments.has(key) && val) next[key] = true
      }
      const prevKeys = Object.keys(prev)
      const nextKeys = Object.keys(next)
      if (prevKeys.length === nextKeys.length && prevKeys.every((k) => prev[k] === next[k])) {
        return prev
      }
      return next
    })
  }

  const weekStart = data?.weekStart ?? ""
  const defaultShiftCode = (data?.shiftTypes?.[0]?.code ?? "T1") as ShiftType

  const debouncedRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => { onRefresh(); refreshTimer.current = null }, 800)
  }, [onRefresh])

  const optimisticAdd = useCallback((staffId: string, functionLabel: string, date: string, shiftType: ShiftType) => {
    const s = staffList.find((x) => x.id === staffId)
    if (!s) return
    setLocalDays((prev) => {
      const tempId = `temp-${Date.now()}-${Math.random()}`
      return prev.map((d) => d.date !== date ? d : {
        ...d,
        assignments: [...d.assignments, {
          id: tempId, staff_id: staffId, shift_type: shiftType,
          is_manual_override: true, trainee_staff_id: null, notes: null,
          function_label: functionLabel, tecnica_id: null, whole_team: false,
          staff: { id: s.id, first_name: s.first_name, last_name: s.last_name, role: s.role as never },
        }],
      })
    })
  }, [staffList])

  const optimisticRemove = useCallback((assignmentId: string) => {
    setLocalDays((prev) => prev.map((d) => ({
      ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId),
    })))
  }, [])

  const assignSilent = useCallback(async (staffId: string, tecnicaCodigo: string, date: string, shiftType: ShiftType) => {
    const result = await upsertAssignment({ weekStart, staffId, date, shiftType, functionLabel: tecnicaCodigo })
    if (result.error) toast.error(result.error)
    return result
  }, [weekStart])

  const removeSilent = useCallback(async (assignmentId: string) => {
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
    return result
  }, [])

  const handleAssign = useCallback(async (staffId: string, tecnicaCodigo: string, date: string, shiftType: ShiftType) => {
    const snapshot = data
    const idCapture: { value: string | undefined } = { value: undefined }
    optimisticAdd(staffId, tecnicaCodigo, date, shiftType)
    if (snapshot) {
      onAfterMutation?.(
        snapshot,
        () => idCapture.value ? removeAssignment(idCapture.value) : Promise.resolve({ error: "Cannot undo" }),
        () => upsertAssignment({ weekStart, staffId, date, shiftType, functionLabel: tecnicaCodigo }),
      )
    }
    const result = await assignSilent(staffId, tecnicaCodigo, date, shiftType)
    if (result.error) { onCancelUndo?.(); return }
    idCapture.value = result.id
    onSaved?.()
    debouncedRefresh()
  }, [data, weekStart, optimisticAdd, assignSilent, onAfterMutation, onCancelUndo, onSaved, debouncedRefresh])

  const handleRemove = useCallback(async (assignmentId: string) => {
    const snapshot = data
    let assignment: (typeof localDays[number]["assignments"][number] & { date: string }) | undefined
    for (const d of localDays) {
      const a = d.assignments.find((x) => x.id === assignmentId)
      if (a) { assignment = { ...a, date: d.date }; break }
    }
    optimisticRemove(assignmentId)
    if (snapshot && assignment) {
      onAfterMutation?.(
        snapshot,
        () => upsertAssignment({ weekStart, staffId: assignment.staff_id, date: assignment.date, shiftType: assignment.shift_type, functionLabel: assignment.function_label ?? undefined }),
        () => removeAssignment(assignmentId),
      )
    }
    const result = await removeSilent(assignmentId)
    if (result.error) { onCancelUndo?.(); return }
    onSaved?.()
    debouncedRefresh()
  }, [data, localDays, weekStart, optimisticRemove, removeSilent, onAfterMutation, onCancelUndo, onSaved, debouncedRefresh])

  const handleToggleWholeTeam = useCallback(async (tecnicaCodigo: string, date: string, current: boolean) => {
    const snapshot = data
    const key = `${tecnicaCodigo}:${date}`
    setLocalWholeTeam((prev) => ({ ...prev, [key]: !current }))
    if (snapshot) {
      onAfterMutation?.(
        snapshot,
        () => setWholeTeam(weekStart, tecnicaCodigo, date, current),
        () => setWholeTeam(weekStart, tecnicaCodigo, date, !current),
      )
    }
    const result = await setWholeTeam(weekStart, tecnicaCodigo, date, !current)
    if (result.error) { toast.error(result.error); onCancelUndo?.(); return }
    onSaved?.()
    onRefresh()
  }, [data, weekStart, onAfterMutation, onCancelUndo, onSaved, onRefresh])

  return {
    localDays,
    localWholeTeam,
    defaultShiftCode,
    optimisticAdd,
    optimisticRemove,
    assignSilent,
    removeSilent,
    handleAssign,
    handleRemove,
    handleToggleWholeTeam,
    debouncedRefresh,
  }
}
