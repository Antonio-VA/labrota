"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  upsertAssignment,
  deleteAssignment,
  deleteAllDayAssignments,
  updateAssignmentShift,
  setFunctionLabel,
  setTecnica,
  type RotaDay,
} from "@/app/(clinic)/rota/actions"
import type { StaffWithSkills, ShiftType } from "@/lib/types/database"
import { ROLE_ORDER } from "@/components/assignment-sheet/constants"

type Assignment = RotaDay["assignments"][0]

export function useAssignmentActions({
  weekStart, date, day, rota, staffList, onSaved,
}: {
  weekStart: string
  date: string | null
  day: RotaDay | null
  rota: { id: string; status: string } | null
  staffList: StaffWithSkills[]
  onSaved: () => void
}) {
  const sortByRole = (items: Assignment[]) =>
    [...items].sort((a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9))

  const [assignments, setAssignments] = useState<Assignment[]>(() => sortByRole(day?.assignments ?? []))
  const [, startSave] = useTransition()

  const [prevDay, setPrevDay] = useState(day)
  if (day !== prevDay) {
    setPrevDay(day)
    setAssignments(sortByRole(day?.assignments ?? []))
  }

  function save(fn: () => Promise<{ error?: string }>, revert: () => void) {
    startSave(async () => {
      const r = await fn()
      if (r.error) { toast.error(r.error); revert() }
      else { onSaved() }
    })
  }

  function patchAssignment(id: string, patch: Partial<Assignment>) {
    setAssignments((prev) => prev.map((a) => a.id === id ? { ...a, ...patch } : a))
  }

  function handleAdd(staffId: string, shift: ShiftType) {
    const staff = staffList.find((s) => s.id === staffId)
    if (!staff || !date) return

    let tempId = ""
    setAssignments((prev) => {
      tempId = `temp-${Date.now()}`
      const optimistic: Assignment = {
        id: tempId, staff_id: staffId, shift_type: shift,
        is_manual_override: true,
        trainee_staff_id: null, notes: null, function_label: null, tecnica_id: null, whole_team: false,
        staff: { id: staffId, first_name: staff.first_name, last_name: staff.last_name, role: staff.role },
      }
      return [...prev, optimistic].sort(
        (a, b) => (ROLE_ORDER[a.staff.role] ?? 9) - (ROLE_ORDER[b.staff.role] ?? 9)
      )
    })

    save(
      async () => {
        const r = await upsertAssignment({ weekStart, staffId, date, shiftType: shift })
        if (!r.error && r.id) {
          setAssignments((prev) => prev.map((a) => a.id === tempId ? { ...a, id: r.id! } : a))
        }
        return r
      },
      () => setAssignments((prev) => prev.filter((a) => a.id !== tempId))
    )
  }

  function handleRemove(assignmentId: string) {
    const prev = assignments
    setAssignments((cur) => cur.filter((a) => a.id !== assignmentId))
    save(() => deleteAssignment(assignmentId), () => setAssignments(prev))
  }

  function handleChangeShift(assignmentId: string, newShift: ShiftType) {
    const prev = assignments
    setAssignments((cur) => cur.map((a) => a.id === assignmentId ? { ...a, shift_type: newShift } : a))
    save(() => updateAssignmentShift(assignmentId, newShift), () => setAssignments(prev))
  }

  function handleFunctionSave(assignmentId: string, label: string | null) {
    patchAssignment(assignmentId, { function_label: label } as never)
    startSave(async () => {
      const r = await setFunctionLabel(assignmentId, label)
      if (r.error) toast.error(r.error)
    })
  }

  function handleTecnicaSave(assignmentId: string, tecnicaId: string | null) {
    patchAssignment(assignmentId, { tecnica_id: tecnicaId } as never)
    startSave(async () => {
      const r = await setTecnica(assignmentId, tecnicaId)
      if (r.error) toast.error(r.error)
    })
  }

  function handleDeleteAll() {
    if (!rota || !date) return
    const prev = assignments
    setAssignments([])
    save(() => deleteAllDayAssignments(rota.id, date), () => setAssignments(prev))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || !date) return

    const activeId = String(active.id)
    const overId = String(over.id)

    if (activeId.startsWith("off-")) {
      if (overId === "off-section") return
      const staffId = activeId.slice(4)
      if (!overId.startsWith("shift-")) return
      const shiftCode = overId.slice(6)
      handleAdd(staffId, shiftCode as ShiftType)
      return
    }

    const sourceAssignment = assignments.find((a) => a.id === activeId)
    if (!sourceAssignment) return

    if (overId === "off-section") {
      handleRemove(activeId)
      return
    }

    if (overId.startsWith("shift-")) {
      const newShift = overId.slice(6)
      if (newShift === sourceAssignment.shift_type) return
      handleChangeShift(activeId, newShift as ShiftType)
    }
  }

  return {
    assignments,
    handleAdd,
    handleRemove,
    handleChangeShift,
    handleFunctionSave,
    handleTecnicaSave,
    handleDeleteAll,
    handleDragEnd,
  }
}
