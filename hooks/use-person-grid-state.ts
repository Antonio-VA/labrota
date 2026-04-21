"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  removeAssignment,
  upsertAssignment,
  setFunctionLabel,
  type RotaWeekData,
  type RotaDay,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"
import type { Assignment } from "@/components/calendar-panel/types"

export function usePersonGridState({
  data, staffList, gridSetDaysRef,
}: {
  data: RotaWeekData
  staffList: StaffWithSkills[]
  gridSetDaysRef?: React.RefObject<((days: RotaDay[]) => void) | null>
}) {
  const [localDays, setLocalDays] = useState(data.days)

  useEffect(() => {
    if (!gridSetDaysRef) return
    gridSetDaysRef.current = setLocalDays
    return () => { gridSetDaysRef.current = null }
  }, [gridSetDaysRef])

  const [prevData, setPrevData] = useState(data)
  if (data !== prevData) {
    setPrevData(data)
    setLocalDays(data.days)
  }

  const patchLocalAssignment = useCallback((assignmentId: string, patch: Record<string, unknown>) => {
    setLocalDays((prev) => prev.map((d) => ({
      ...d,
      assignments: d.assignments.map((a) =>
        a.id === assignmentId ? { ...a, ...patch } : a
      ),
    })))
  }, [])

  const handleFunctionLabelSave = useCallback(async (assignmentId: string, label: string | null) => {
    patchLocalAssignment(assignmentId, { function_label: label })
    const result = await setFunctionLabel(assignmentId, label)
    if (result.error) toast.error(result.error)
  }, [patchLocalAssignment])

  const assignMap = useMemo(() => {
    const map: Record<string, Record<string, Assignment>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!map[a.staff_id]) map[a.staff_id] = {}
        map[a.staff_id][day.date] = a
      }
    }
    return map
  }, [localDays])

  const isTaskMode = data.rotaDisplayMode === "by_task"
  const tecnicaByCode = useMemo(
    () => Object.fromEntries((data.tecnicas ?? []).map((t) => [t.codigo, t])),
    [data.tecnicas],
  )
  const tecnicaById = useMemo(
    () => Object.fromEntries((data.tecnicas ?? []).map((t) => [t.id, t])),
    [data.tecnicas],
  )
  const defaultShiftCode = (data.shiftTypes?.[0]?.code ?? "T1") as ShiftType

  const taskAssignMap = useMemo(() => {
    if (!isTaskMode) return {} as Record<string, Record<string, Assignment[]>>
    const map: Record<string, Record<string, Assignment[]>> = {}
    for (const day of localDays) {
      for (const a of day.assignments) {
        if (!map[a.staff_id]) map[a.staff_id] = {}
        if (!map[a.staff_id][day.date]) map[a.staff_id][day.date] = []
        map[a.staff_id][day.date].push(a)
      }
    }
    return map
  }, [localDays, isTaskMode])

  const wholeTeamByDate = useMemo(() => {
    if (!isTaskMode) return {} as Record<string, Assignment[]>
    const map: Record<string, Assignment[]> = {}
    for (const day of localDays) {
      map[day.date] = day.assignments.filter((a) => a.whole_team && a.function_label)
    }
    return map
  }, [localDays, isTaskMode])

  const handleTaskRemove = useCallback(async (assignmentId: string) => {
    setLocalDays((prev) => prev.map((d) => ({
      ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId),
    })))
    const result = await removeAssignment(assignmentId)
    if (result.error) toast.error(result.error)
  }, [])

  const handleTaskAdd = useCallback(async (staffId: string | null, date: string, tecnicaCodigo: string) => {
    const tempId = `temp-${crypto.randomUUID()}`
    const staffMember = staffId ? staffList.find((s) => s.id === staffId) : null
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: tempId, staff_id: staffId ?? "", shift_type: defaultShiftCode,
        is_manual_override: true, trainee_staff_id: null, notes: null,
        function_label: tecnicaCodigo, tecnica_id: null, whole_team: staffId === null,
        staff: staffMember
          ? { id: staffMember.id, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never }
          : { id: "", first_name: "All", last_name: "", role: "lab" as never },
      }],
    }))
    const result = await upsertAssignment({ weekStart: data.weekStart ?? "", staffId: staffId ?? "", date, shiftType: defaultShiftCode, functionLabel: tecnicaCodigo })
    if (result.error) { toast.error(result.error); return }
    setLocalDays((prev) => prev.map((d) => ({
      ...d,
      assignments: d.assignments.map((a) => a.id === tempId ? { ...a, id: result.id ?? tempId } : a),
    })))
  }, [staffList, data.weekStart, defaultShiftCode])

  const handleExistingShiftChange = useCallback(async (
    assignment: Assignment, newShift: string | null, date: string,
  ) => {
    if (!newShift) {
      setLocalDays((prev) => prev.map((d) => ({
        ...d, assignments: d.assignments.filter((a) => a.id !== assignment.id),
      })))
      const result = await removeAssignment(assignment.id)
      if (result.error) toast.error(result.error)
      return
    }
    patchLocalAssignment(assignment.id, { shift_type: newShift })
    const result = await upsertAssignment({ weekStart: data.weekStart ?? "", staffId: assignment.staff_id, date, shiftType: newShift })
    if (result.error) toast.error(result.error)
  }, [patchLocalAssignment, data.weekStart])

  const handleOffSlotAssign = useCallback(async (staff: StaffWithSkills, date: string, newShift: string | null) => {
    if (!newShift) return
    const result = await upsertAssignment({ weekStart: data.weekStart ?? "", staffId: staff.id, date, shiftType: newShift })
    if (result.error) { toast.error(result.error); return }
    setLocalDays((prev) => prev.map((d) => d.date !== date ? d : {
      ...d,
      assignments: [...d.assignments, {
        id: result.id ?? `temp-${Date.now()}`, staff_id: staff.id,
        staff: staff as never, shift_type: newShift, is_manual_override: true,
        function_label: null, tecnica_id: null, notes: null,
        trainee_staff_id: null, whole_team: false,
      }],
    }))
  }, [data.weekStart])

  return {
    localDays,
    assignMap,
    tecnicaByCode,
    tecnicaById,
    taskAssignMap,
    wholeTeamByDate,
    handleFunctionLabelSave,
    handleTaskRemove,
    handleTaskAdd,
    handleExistingShiftChange,
    handleOffSlotAssign,
  }
}
