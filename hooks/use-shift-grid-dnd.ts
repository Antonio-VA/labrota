"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useSensor, useSensors, PointerSensor, type DragEndEvent, type DragStartEvent, type DragOverEvent } from "@dnd-kit/core"
import {
  removeAssignment,
  deleteAssignment,
  upsertAssignment,
  moveAssignmentShift,
  type RotaWeekData,
  type RotaDay,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"
import type { Assignment } from "@/components/calendar-panel/types"

type LocalDaysUpdater = (update: RotaDay[] | ((prev: RotaDay[]) => RotaDay[])) => void

export function useShiftGridDnd({
  localDays, data, weekStart, staffById, setLocalDays,
  onAfterMutation, onCancelUndo, onSaved, onRefresh, t,
}: {
  localDays: RotaDay[]
  data: RotaWeekData | null
  weekStart: string
  staffById: Map<string, StaffWithSkills>
  setLocalDays: LocalDaysUpdater
  onAfterMutation?: (snapshot: RotaWeekData, inverse: () => Promise<{ error?: string }>, forward: () => Promise<{ error?: string }>) => void
  onCancelUndo?: () => void
  onSaved?: () => void
  onRefresh: () => void
  t: (key: string) => string
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(String(e.active.id))
    setOverId(null)
  }, [])

  const handleDragOver = useCallback((e: DragOverEvent) => {
    setOverId(e.over ? String(e.over.id) : null)
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    setOverId(null)
    if (!over) return

    const activeId = String(active.id)
    const destZone = String(over.id)

    if (activeId.startsWith("off-")) {
      if (destZone.startsWith("OFF-")) return
      const destDate = destZone.slice(-10)
      const destShift = destZone.slice(0, destZone.length - 11) as ShiftType
      const staffId = activeId.slice(4, activeId.length - 11)
      const staffMember = staffById.get(staffId)

      if (staffMember) {
        setLocalDays((prev) => prev.map((d) => {
          if (d.date !== destDate) return d
          const optimistic = {
            id: `opt-${Date.now()}`, staff_id: staffId,
            staff: { id: staffId, first_name: staffMember.first_name, last_name: staffMember.last_name, role: staffMember.role as never },
            shift_type: destShift, is_manual_override: true, function_label: null, tecnica_id: null, notes: null, trainee_staff_id: null, whole_team: false,
          }
          return { ...d, assignments: [...d.assignments, optimistic as Assignment] }
        }))
      }

      const snapshot = data
      const idCapture: { value: string | undefined } = { value: undefined }
      if (snapshot) {
        onAfterMutation?.(
          snapshot,
          () => idCapture.value ? deleteAssignment(idCapture.value) : Promise.resolve({ error: "Cannot undo" }),
          async () => {
            const r = await upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift })
            if (r.id) idCapture.value = r.id
            return r
          },
        )
      }
      try {
        const result = await upsertAssignment({ weekStart, staffId, date: destDate, shiftType: destShift })
        if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
        idCapture.value = result.id
        onSaved?.()
      } catch {
        onCancelUndo?.(); toast.error(t("assignmentError")); onRefresh()
      }
      return
    }

    const assignmentId = activeId
    const sourceAssignment = localDays.flatMap((d) => d.assignments.map((a) => ({ ...a, date: d.date }))).find((a) => a.id === assignmentId)
    if (!sourceAssignment) return

    const sourceZone = `${sourceAssignment.shift_type}-${sourceAssignment.date}`
    if (sourceZone === destZone) return

    if (destZone.startsWith("OFF-")) {
      setLocalDays((prev) => prev.map((d) => ({
        ...d, assignments: d.assignments.filter((a) => a.id !== assignmentId),
      })))
      const oldShift = sourceAssignment.shift_type as ShiftType
      const oldDate = sourceAssignment.date
      const oldStaff = sourceAssignment.staff_id
      const snapshot = data
      const idCapture = { value: assignmentId }
      if (snapshot) {
        onAfterMutation?.(
          snapshot,
          async () => {
            const r = await upsertAssignment({ weekStart, staffId: oldStaff, date: oldDate, shiftType: oldShift })
            if (r.id) idCapture.value = r.id
            return r
          },
          () => removeAssignment(idCapture.value),
        )
      }
      try {
        const result = await removeAssignment(assignmentId)
        if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
        onSaved?.()
      } catch {
        onCancelUndo?.(); toast.error(t("removeError")); onRefresh()
      }
      return
    }

    const destDate = destZone.slice(-10)
    const destShift = destZone.slice(0, destZone.length - 11)

    if (sourceAssignment.date !== destDate) {
      toast.error(t("shiftMoveError"))
      return
    }

    const oldShift = sourceAssignment.shift_type
    const snapshot = data
    setLocalDays((prev) => prev.map((d) => ({
      ...d, assignments: d.assignments.map((a) =>
        a.id === assignmentId ? { ...a, shift_type: destShift, is_manual_override: true } : a
      ),
    })))
    if (snapshot) {
      onAfterMutation?.(
        snapshot,
        () => moveAssignmentShift(assignmentId, oldShift),
        () => moveAssignmentShift(assignmentId, destShift),
      )
    }
    try {
      const result = await moveAssignmentShift(assignmentId, destShift)
      if (result?.error) { onCancelUndo?.(); toast.error(result.error); onRefresh(); return }
      onSaved?.()
    } catch {
      onCancelUndo?.(); toast.error(t("moveError")); onRefresh()
    }
  }, [localDays, data, weekStart, staffById, onAfterMutation, onCancelUndo, onSaved, onRefresh, setLocalDays, t])

  return { activeId, overId, sensors, handleDragStart, handleDragOver, handleDragEnd }
}
