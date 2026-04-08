import { useState, useTransition } from "react"
import { moveAssignment } from "@/app/(clinic)/rota/actions"

interface UseCalendarDndOptions {
  weekStart: string
  fetchWeek: (ws: string) => void
  setError: (e: string | null) => void
}

export function useCalendarDnd({ weekStart, fetchWeek, setError }: UseCalendarDndOptions) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [draggingFrom, setDraggingFrom] = useState<string | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [isPendingDnd, startDndTransition] = useTransition()

  function handleChipDragStart(assignmentId: string, fromDate: string) {
    setDraggingId(assignmentId)
    setDraggingFrom(fromDate)
  }

  function handleChipDragEnd() {
    setDraggingId(null)
    setDraggingFrom(null)
    setDragOverDate(null)
  }

  function handleColumnDragOver(date: string, e: React.DragEvent) {
    e.preventDefault()
    setDragOverDate(date)
  }

  function handleColumnDragLeave() {
    setDragOverDate(null)
  }

  function handleColumnDrop(toDate: string) {
    if (!draggingId || !draggingFrom || toDate === draggingFrom) {
      handleChipDragEnd()
      return
    }
    const id = draggingId
    handleChipDragEnd()
    startDndTransition(async () => {
      const result = await moveAssignment(id, toDate)
      if (result.error) setError(result.error)
      else fetchWeek(weekStart)
    })
  }

  return {
    draggingId,
    draggingFrom,
    dragOverDate,
    handleChipDragStart,
    handleChipDragEnd,
    handleColumnDragOver,
    handleColumnDragLeave,
    handleColumnDrop,
  }
}
